# Hướng Dẫn Demo: Threat Model & Kịch Bản Tấn Công

> **Mục tiêu tài liệu:** Hướng dẫn từng bước thực hiện demo 6 kịch bản tấn công trên hệ thống IoT, giải thích cơ chế kỹ thuật bên trong, và kiểm tra phản ứng của hệ thống — phục vụ báo cáo/thuyết trình môn An Toàn Hệ Thống Nhúng và IoT.

---

## Mục lục
1. [Tổng quan kiến trúc bảo mật](#1-tổng-quan-kiến-trúc-bảo-mật)
2. [Chuẩn bị trước khi demo](#2-chuẩn-bị-trước-khi-demo)
3. [Chạy script tự động (nhanh)](#3-chạy-script-tự-động-nhanh)
4. [Scenario 0 — Baseline: Request hợp lệ](#4-scenario-0--baseline-request-hợp-lệ)
5. [Scenario 1 — Device Spoofing: Giả mạo HMAC](#5-scenario-1--device-spoofing-giả-mạo-hmac)
6. [Scenario 2 — Replay Attack: Gửi lại request cũ](#6-scenario-2--replay-attack-gửi-lại-request-cũ)
7. [Scenario 3 — Brute Force → Auto Block](#7-scenario-3--brute-force--auto-block)
8. [Scenario 4 — Unregistered Device](#8-scenario-4--unregistered-device)
9. [Scenario 5 — Privilege Escalation: Sensor giả làm Gateway](#9-scenario-5--privilege-escalation-sensor-giả-làm-gateway)
10. [Scenario 6 — SQL Injection](#10-scenario-6--sql-injection)
11. [Kiểm tra Audit Log & Dashboard](#11-kiểm-tra-audit-log--dashboard)
12. [Bảng tổng kết STRIDE](#12-bảng-tổng-kết-stride)
13. [Điểm yếu còn lại & phân tích rủi ro](#13-điểm-yếu-còn-lại--phân-tích-rủi-ro)

---

## 1. Tổng quan kiến trúc bảo mật

### Luồng xác thực 2 cấp (thực tế trong code)

```
ESP32 Sensor Node                ESP32 Gateway Node              Backend Server
      │                                 │                              │
      │── MQTT publish ───────────────► │                              │
      │   {sensor_id, sn_ts,            │                              │
      │    sn_hmac, data}               │                              │
      │                                 │                              │
      │                        [Xác thực sn_hmac]                     │
      │                        (bằng whitelist local)                  │
      │                                 │                              │
      │                                 │── HTTP POST ────────────────►│
      │                                 │   {gateway_id, gw_ts,        │
      │                                 │    gw_hmac,                  │
      │                                 │    sensor_id, sn_ts,         │
      │                                 │    sn_hmac, data}            │
      │                                 │                              │
      │                                 │              [Level 1] Xác thực Gateway
      │                                 │              [Level 2] Xác thực Sensor
      │                                 │              [RBAC]   Kiểm tra device_type
      │                                 │              [Status] Kiểm tra active/blocked
      │                                 │                              │
      │                                 │◄── 200 OK / 401 / 403 ──────│
```

### Thứ tự kiểm tra trong `validateDevice` middleware

```
Nhận request POST /api/iot/data
│
├─ 1. Thiếu field? → 400 MISSING_GATEWAY_FIELDS
│
├─ 2. [Level 1] verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac)
│       ├─ DB lookup gateway_id → không tìm thấy → NOT_FOUND
│       ├─ |now - gw_timestamp| > 300s → TIMESTAMP_EXPIRED
│       └─ timingSafeEqual(expected, gw_hmac) = false → HMAC_MISMATCH
│          → Tất cả lỗi Level 1: ghi audit GATEWAY_AUTH_FAIL, tăng fail_count
│          → fail_count ≥ 5 → DEVICE_BLOCKED
│
├─ 3. [Level 2] verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac)
│       ├─ DB lookup sensor_id → không tìm thấy → NOT_FOUND
│       ├─ |now - sn_timestamp| > 300s → TIMESTAMP_EXPIRED
│       └─ timingSafeEqual(expected, sn_hmac) = false → HMAC_MISMATCH
│          → Tất cả lỗi Level 2: ghi audit SENSOR_AUTH_FAIL, tăng fail_count
│
├─ 4. [RBAC] gateway.device_type ≠ 'gateway' → 403 INVALID_DEVICE_TYPE
│            sensor.device_type ≠ 'sensor'   → 403 INVALID_DEVICE_TYPE
│
├─ 5. [Status] gateway.status = 'blocked' → 403 DEVICE_BLOCKED
│              sensor.status = 'blocked'  → 403 DEVICE_BLOCKED
│
└─ 6. Lưu DB + 200 OK
```

### Công thức HMAC (từ `hmacService.ts`)

```
message = device_id + ":" + unix_timestamp
token   = HMAC-SHA256(secret_key, message)
        = hex string 64 ký tự

Ví dụ:
  device_id  = "ESP32-GW-A1B2C3D4"
  timestamp  = 1749383000
  secret_key = "a3f8c2...64chars"
  message    = "ESP32-GW-A1B2C3D4:1749383000"
  token      = "7f3a9b2c..." (64 hex chars)
```

---

## 2. Chuẩn bị trước khi demo

### 2.1 — Khởi động toàn bộ hệ thống

```powershell
cd e:\WorkSpace\managerDeviceIoT
docker compose up -d --build
```

Đợi ~60 giây rồi kiểm tra:

```powershell
docker compose ps
```

Kết quả mong đợi — tất cả `healthy` hoặc `running`:
```
NAME          STATUS             PORTS
mysql         running (healthy)  0.0.0.0:3308->3306/tcp
mosquitto     running            0.0.0.0:1883->1883/tcp
backend       running (healthy)  0.0.0.0:5000->5000/tcp
frontend      running            0.0.0.0:3000->3000/tcp
```

Kiểm tra backend API:
```powershell
curl http://localhost:5000/api/health
# {"status":"ok","db":"connected","mqtt":"connected"}
```

### 2.2 — Tạo thiết bị demo trên Frontend

Truy cập **http://localhost:3000** → đăng nhập `admin / admin123`

**Tạo Gateway Node:**
1. Vào **Devices** → **Thêm thiết bị**
2. Điền: Tên = `Demo-Gateway-01`, Type = `gateway`, Location = `Lab`
3. Click **Lưu** → Modal hiện `device_id` + `secret_key`
4. **SAO CHÉP NGAY** — key chỉ hiện 1 lần

**Tạo Sensor Node:**
1. Vào **Devices** → **Thêm thiết bị**
2. Điền: Tên = `Demo-Sensor-01`, Type = `sensor`, Location = `Lab`
3. Click **Lưu** → SAO CHÉP `device_id` + `secret_key`

> **Lý do cần tạo thiết bị trước:** Backend lấy `secret_key` từ DB để tính lại HMAC. Nếu thiết bị chưa đăng ký, không có key để so sánh → `NOT_FOUND`.

### 2.3 — Mở Git Bash / WSL và gán biến

```bash
# Mở Git Bash (Windows) hoặc WSL Ubuntu
# Điền giá trị thực tế từ bước 2.2

export BACKEND="http://localhost:5000"
export GW_ID="ESP32-GW-XXXXXXXX"        # device_id Gateway
export GW_SECRET="aabbcc...64chars"      # secret_key Gateway
export SN_ID="ESP32-SN-XXXXXXXX"        # device_id Sensor
export SN_SECRET="112233...64chars"      # secret_key Sensor
export ENDPOINT="$BACKEND/api/iot/data"
```

> **Kiểm tra biến đã gán đúng:**
> ```bash
> echo "GW: $GW_ID"
> echo "SN: $SN_ID"
> echo "Endpoint: $ENDPOINT"
> ```

### 2.4 — Dán hàm tiện ích vào terminal

```bash
# Tính HMAC-SHA256 từ hex key — dùng openssl
hmac() {
    local key="$1" msg="$2"
    # Chuyển hex key sang bytes trước khi ký
    echo -n "$msg" | openssl dgst -sha256 \
        -hmac "$(echo -n "$key" | xxd -r -p 2>/dev/null || echo -n "$key")" \
        -hex 2>/dev/null | sed 's/^.* //'
}

# Lấy Unix timestamp hiện tại (giây)
ts() { date +%s; }

# Gửi request và hiển thị status code + body
post_data() {
    local payload="$1"
    response=$(curl -s -w '\n%{http_code}' -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$payload")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    echo "HTTP $http_code"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
}

# Kiểm tra hàm hmac hoạt động
TEST_TS=$(ts)
echo "Test HMAC: $(hmac "$GW_SECRET" "${GW_ID}:${TEST_TS}")"
# Phải ra 64 ký tự hex, không rỗng
```

---

## 3. Chạy script tự động (nhanh)

Dùng khi cần demo nhanh toàn bộ 5 kịch bản trong một lệnh:

```bash
cd /e/WorkSpace/managerDeviceIoT   # Git Bash
# hoặc
cd /mnt/e/WorkSpace/managerDeviceIoT  # WSL

chmod +x scripts/attack_demo.sh

./scripts/attack_demo.sh \
    "$BACKEND" \
    "$GW_ID" "$GW_SECRET" \
    "$SN_ID" "$SN_SECRET"
```

Script chạy tuần tự Scenario 0 → 5, in màu xanh/đỏ từng kết quả.

**Sau khi script kết thúc:**
- Mở Dashboard → **Audit** để xem toàn bộ sự kiện
- Mở **Devices** để xem trạng thái thiết bị (có thể bị `blocked`)
- Nếu Gateway bị block: click **Unlock** để reset

---

## 4. Scenario 0 — Baseline: Request hợp lệ

### Mục đích
Chứng minh hệ thống hoạt động bình thường với request đầy đủ và đúng. Dùng làm điểm đối chiếu cho các scenario tấn công sau.

### Điều kiện để request hợp lệ (4 điều kiện đồng thời)
```
1. gateway_id tồn tại trong DB với status = 'active'
2. |now() - gw_timestamp| ≤ 300 giây
3. HMAC-SHA256(gw_secret, "gateway_id:gw_timestamp") == gw_hmac
4. Tương tự cho sensor_id / sn_timestamp / sn_hmac
```

### Luồng code khi request hợp lệ

```
POST /api/iot/data
  │
  ├─ validateDevice middleware (validateDevice.ts)
  │     ├─ verifyGatewayHMAC() → ok: true
  │     └─ verifyDeviceHMAC()  → ok: true
  │
  └─ data.routes.ts handler
        ├─ RBAC: gwRow.device_type == 'gateway' ✓
        ├─ RBAC: snRow.device_type == 'sensor'  ✓
        ├─ Status: gwRow.status == 'active'      ✓
        ├─ Status: snRow.status == 'active'      ✓
        ├─ INSERT sensor_data (device_id, gateway_id, payload)
        ├─ UPDATE devices SET last_seen=NOW(), fail_count=0
        ├─ INSERT audit_log (event_type='DATA_RECV')
        └─ return 200 {success: true, received_at: ...}
```

### Lệnh thực hiện

```bash
GW_TS=$(ts); SN_TS=$(ts)
GW_HMAC=$(hmac "$GW_SECRET" "${GW_ID}:${GW_TS}")
SN_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${SN_TS}")

echo "=== Payload hợp lệ ==="
echo "GW timestamp : $GW_TS"
echo "SN timestamp : $SN_TS"
echo "GW HMAC      : $GW_HMAC"
echo "SN HMAC      : $SN_HMAC"
echo ""

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"$GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $SN_TS,
  \"sn_hmac\":      \"$SN_HMAC\",
  \"data\":         { \"temperature\": 27.5, \"humidity\": 65.0 }
}"
```

### Kết quả mong đợi

```
HTTP 200
{
    "success": true,
    "sensor_id": "ESP32-SN-XXXXXXXX",
    "gateway_id": "ESP32-GW-XXXXXXXX",
    "received_at": "2026-06-08T10:30:00.000Z"
}
```

### Kiểm tra trên Dashboard
- **Devices**: cả Gateway và Sensor chuyển sang `Online` (chấm xanh nhấp nháy)
- **Audit Log**: có sự kiện `DATA_RECV` màu xanh

### Kiểm tra trong DB
```sql
-- Xem bản ghi dữ liệu vừa được lưu
SELECT d.device_id AS sensor, gw.device_id AS gateway,
       sd.payload, sd.received_at
FROM sensor_data sd
JOIN devices d  ON sd.device_id  = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC LIMIT 3;
```

---

## 5. Scenario 1 — Device Spoofing: Giả mạo HMAC

### Mô tả tấn công
Kẻ tấn công **biết `device_id`** (có thể sniff từ MQTT broker, log công khai, hoặc reverse engineering firmware) nhưng **không có `secret_key`**. Hắn tự tạo một chuỗi hex 64 ký tự giả để gửi vào trường `gw_hmac`.

```
Kẻ tấn công có:  gateway_id = "ESP32-GW-A1B2C3D4"  ✓ (biết)
Kẻ tấn công thiếu: secret_key                        ✗ (không biết)
Kẻ tấn công làm:  gw_hmac = "deadbeef...64 chars"   ← bịa đặt
```

### Tại sao tấn công thất bại — giải thích từng dòng code

**Bước 1 — Server tính lại HMAC để so sánh** (`hmacService.ts:56`):
```typescript
// Server lấy secret_key từ DB (kẻ tấn công không có key này)
const expected = computeHMAC(device.secret_key, `${gateway_id}:${gw_timestamp}`)
    .toString("hex");
// expected = "7f3a9b2c..." (64 hex chars — hoàn toàn khác với giá trị giả)
```

**Bước 2 — So sánh timing-safe** (`hmacService.ts:29-38`):
```typescript
function safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "hex");  // expected (tính từ DB)
    const bufB = Buffer.from(b, "hex");  // từ request (deadbeef...)
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);  // LUÔN so sánh đủ 32 bytes
    // → false vì "deadbeef..." ≠ "7f3a9b2c..."
}
```

> **Tại sao dùng `timingSafeEqual` thay vì `===`?**
> So sánh `===` dừng lại ngay ký tự đầu tiên khác nhau — kẻ tấn công có thể đo thời gian phản hồi để đoán ra bao nhiêu ký tự đầu đúng (timing attack). `timingSafeEqual` luôn tốn đúng cùng một thời gian dù kết quả đúng hay sai.

**Bước 3 — Ghi audit và tăng fail_count** (`validateDevice.ts:56-70`):
```typescript
await log("GATEWAY_AUTH_FAIL", deviceDbId, ip, userAgent, {
    gateway_id, reason: "HMAC_MISMATCH"
});
const newCount = await incrementFailCount(deviceDbId);
if (newCount >= 5) {
    await blockDevice(deviceDbId);  // → status = 'blocked'
}
res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: "HMAC_MISMATCH" });
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 1: Device Spoofing ==="
echo "Kẻ tấn công biết GW_ID nhưng không có secret_key"
echo "Tự tạo HMAC giả: deadbeef...64chars"
echo ""

GW_TS=$(ts); SN_TS=$(ts)

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $GW_TS,
  \"gw_hmac\":      \"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $SN_TS,
  \"sn_hmac\":      \"cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00\",
  \"data\":         { \"temperature\": 99.9, \"humidity\": 0.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "HMAC_MISMATCH"
}
```

### Minh họa tại sao HMAC không thể giả mạo

```
Kẻ tấn công gửi:
  gw_hmac = "deadbeefdeadbeef..." (64 chars — bịa)

Server tính:
  message  = "ESP32-GW-XXXXXXXX:1749383000"
  expected = HMAC-SHA256("aabbcc...secret", message)
           = "7f3a9b2c4e8d1f6a..." (64 chars — hoàn toàn khác)

timingSafeEqual("deadbeef...", "7f3a9b2c...") → FALSE
→ 401 GATEWAY_AUTH_FAIL
```

**Tại sao không thể đoán ra HMAC?**
- SHA-256 tạo ra 2^256 ≈ 10^77 giá trị có thể
- Brute force toàn bộ: cần 10^77 lần thử × tốc độ máy tính nhanh nhất hiện nay → **hàng tỷ tỷ năm**
- Mỗi lần sai → fail_count tăng → bị block sau 5 lần

### Kiểm tra sau tấn công

```sql
-- Xem fail_count tăng
SELECT device_id, fail_count, status FROM devices WHERE device_id = 'ESP32-GW-XXXXXXXX';

-- Xem audit log
SELECT event_type, details, created_at FROM audit_log
WHERE event_type = 'GATEWAY_AUTH_FAIL'
ORDER BY created_at DESC LIMIT 5;
```

---

## 6. Scenario 2 — Replay Attack: Gửi lại request cũ

### Mô tả tấn công
Kẻ tấn công **chặn được 1 request hợp lệ hoàn toàn** (ví dụ sniff traffic, MITM) và cố gửi lại sau 10 phút để đưa dữ liệu giả vào hệ thống. HMAC trong request này **hoàn toàn đúng** — chỉ có timestamp là cũ.

```
Request gốc (hợp lệ lúc 10:00):
  gw_timestamp = 1749380400
  gw_hmac      = "a1b2c3d4..." (đúng, tính từ secret thật)

Kẻ tấn công gửi lại lúc 10:12 (12 phút sau):
  gw_timestamp = 1749380400  ← timestamp cũ 12 phút
  gw_hmac      = "a1b2c3d4..." ← HMAC vẫn đúng!
```

### Tại sao tấn công thất bại — cơ chế timestamp window

**Kiểm tra trong `hmacService.ts:21-23`:**
```typescript
const TIMESTAMP_WINDOW_SECONDS = 300;  // ±5 phút

function isTimestampValid(timestamp: number): boolean {
    return Math.abs(Date.now() / 1000 - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
    //  |now()  -  timestamp| ≤ 300 giây
    //  |10:12  -  10:00   | = 720 giây > 300 giây → FALSE
}
```

**Thứ tự kiểm tra** (timestamp được kiểm tra **TRƯỚC** HMAC):
```
verifyGatewayHMAC()
  1. fetchDevice(gateway_id)         → tìm thấy ✓
  2. isTimestampValid(gw_timestamp)  → |720| > 300 → FALSE → return TIMESTAMP_EXPIRED
  3. computeHMAC()                   → KHÔNG CHẠY (đã thoát ở bước 2)
```

> **Điểm quan trọng khi thuyết trình:** HMAC trong Scenario 2 là **100% hợp lệ** — key đúng, message đúng. Nhưng vẫn bị từ chối vì timestamp cũ. Đây là lớp bảo vệ độc lập với HMAC.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 2: Replay Attack ==="
echo "Giả lập: chặn request lúc 10:00 và gửi lại lúc 10:12"
echo ""

# Tạo timestamp CŨ 700 giây (≈12 phút)
OLD_TS=$(($(ts) - 700))
echo "Timestamp cũ: $OLD_TS ($(date -d @$OLD_TS 2>/dev/null || date -r $OLD_TS) — 12 phút trước)"
echo "Timestamp hiện tại: $(ts)"
echo "Chênh lệch: $(($(ts) - OLD_TS)) giây > 300 giây → sẽ bị từ chối"
echo ""

# HMAC tính đúng từ secret — nhưng với timestamp cũ
GW_HMAC_OLD=$(hmac "$GW_SECRET" "${GW_ID}:${OLD_TS}")
SN_HMAC_OLD=$(hmac "$SN_SECRET" "${SN_ID}:${OLD_TS}")

echo "HMAC gateway (đúng kỹ thuật): $GW_HMAC_OLD"
echo "HMAC sensor  (đúng kỹ thuật): $SN_HMAC_OLD"
echo ""

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $OLD_TS,
  \"gw_hmac\":      \"$GW_HMAC_OLD\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $OLD_TS,
  \"sn_hmac\":      \"$SN_HMAC_OLD\",
  \"data\":         { \"temperature\": 25.0, \"humidity\": 60.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "TIMESTAMP_EXPIRED"
}
```

### Minh họa timeline tấn công

```
10:00:00  Sensor gửi request hợp lệ → timestamp = T
10:00:00  Kẻ tấn công chặn request này (sniff, MITM)
10:04:59  Cửa sổ 300 giây vẫn còn hiệu lực → request vẫn có thể gửi lại được
10:05:01  Cửa sổ 300 giây ĐÃ ĐÓNG → timestamp T cũ > 300s → mọi replay đều fail
10:12:00  Kẻ tấn công gửi lại → timestamp T (700s cũ) → TIMESTAMP_EXPIRED → 401
```

**Mỗi request chỉ hợp lệ trong 5 phút.** Sau đó, kể cả có HMAC đúng hoàn toàn, request cũng vô dụng.

### Bonus — Thử với timestamp CẬN BIÊN (289 giây cũ — vẫn còn hợp lệ)

```bash
echo "=== Thử timestamp 289 giây cũ (trong cửa sổ 300s) ==="
NEAR_TS=$(($(ts) - 289))
NEAR_GW_HMAC=$(hmac "$GW_SECRET" "${GW_ID}:${NEAR_TS}")
NEAR_SN_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${NEAR_TS}")

post_data "{
  \"gateway_id\":   \"$GW_ID\",
  \"gw_timestamp\": $NEAR_TS,
  \"gw_hmac\":      \"$NEAR_GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $NEAR_TS,
  \"sn_hmac\":      \"$NEAR_SN_HMAC\",
  \"data\":         { \"temperature\": 26.0, \"humidity\": 62.0 }
}"
# Kết quả: 200 OK (vẫn trong cửa sổ 5 phút)
```

---

## 7. Scenario 3 — Brute Force → Auto Block

### Mô tả tấn công
Kẻ tấn công không cần biết HMAC — hắn dùng script gửi liên tiếp với HMAC ngẫu nhiên, hy vọng ngẫu nhiên đúng (xác suất 1/2^256 ≈ 0). Mục đích thực tế hơn: gây rối hệ thống, cố khai thác lỗ hổng brute-force nếu có rate limit yếu.

### Cơ chế phòng thủ — Auto Block sau 5 lần

**Từ `validateDevice.ts:8-25`:**
```typescript
const BLOCK_THRESHOLD = 5;

async function incrementFailCount(deviceDbId: number): Promise<number> {
    await pool.execute(
        `UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?`,
        [deviceDbId]
    );
    const [rows] = await pool.execute<any[]>(
        `SELECT fail_count FROM devices WHERE id = ?`, [deviceDbId]
    );
    return rows[0]?.fail_count ?? 0;
}

async function blockDevice(deviceDbId: number): Promise<void> {
    await pool.execute(
        `UPDATE devices SET status = 'blocked' WHERE id = ?`, [deviceDbId]
    );
}
```

**Quy trình từng lần fail:**
```
Lần 1 fail → fail_count = 1 → 401
Lần 2 fail → fail_count = 2 → 401
Lần 3 fail → fail_count = 3 → 401
Lần 4 fail → fail_count = 4 → 401
Lần 5 fail → fail_count = 5 ≥ BLOCK_THRESHOLD(5)
              → blockDevice() → status = 'blocked'
              → INSERT audit_log(DEVICE_BLOCKED)
              → 401
Lần 6+ → Device đã bị block → verifyGatewayHMAC trả về HMAC_MISMATCH
          (vì fail_count không được reset khi đã blocked)
          Hoặc nếu kiểm tra status trước: 403 DEVICE_BLOCKED
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 3: Brute Force → Auto Block ==="
echo "Gửi 6 request với HMAC ngẫu nhiên mỗi lần"
echo ""

for i in $(seq 1 6); do
    GW_TS=$(ts); SN_TS=$(ts)
    RAND_GW=$(openssl rand -hex 32)
    RAND_SN=$(openssl rand -hex 32)

    echo -n "Lần $i — HMAC giả: ${RAND_GW:0:16}... → "

    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{
          \"gateway_id\":   \"$GW_ID\",
          \"gw_timestamp\": $GW_TS,
          \"gw_hmac\":      \"$RAND_GW\",
          \"sensor_id\":    \"$SN_ID\",
          \"sn_timestamp\": $SN_TS,
          \"sn_hmac\":      \"$RAND_SN\",
          \"data\":         {\"temperature\": 20.0, \"humidity\": 50.0}
        }")

    if [ "$http_code" == "401" ]; then
        echo "HTTP 401 AUTH_FAIL (fail_count +1)"
    elif [ "$http_code" == "403" ]; then
        echo "HTTP 403 DEVICE_BLOCKED ← thiết bị đã bị khoá!"
    else
        echo "HTTP $http_code"
    fi

    sleep 0.3
done

echo ""
echo "→ Kiểm tra trạng thái trên Dashboard: Gateway phải hiện badge đỏ 'Blocked'"
```

### Kết quả mong đợi

```
Lần 1 — HMAC giả: a3f8c2d1e5b7... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 2 — HMAC giả: 9b2e4f7c1a3d... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 3 — HMAC giả: 7d1a8e3f2c9b... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 4 — HMAC giả: 4c6b2a8f5e1d... → HTTP 401 AUTH_FAIL (fail_count +1)
Lần 5 — HMAC giả: 2f9e4c7b1a3d... → HTTP 401 AUTH_FAIL (fail_count +1) ← DEVICE_BLOCKED
Lần 6 — HMAC giả: 1e7c3f9a2b4d... → HTTP 403 DEVICE_BLOCKED ← thiết bị đã bị khoá!
```

### Kiểm tra và mở khoá sau demo

```sql
-- Kiểm tra trong DB
SELECT device_id, status, fail_count FROM devices
WHERE device_id = 'ESP32-GW-XXXXXXXX';
-- status = 'blocked', fail_count = 5

SELECT event_type, details, created_at FROM audit_log
ORDER BY created_at DESC LIMIT 10;
-- Thấy 5 × GATEWAY_AUTH_FAIL + 1 × DEVICE_BLOCKED
```

**Mở khoá trên Frontend:**
Vào **Devices** → click `Demo-Gateway-01` → nút **Unlock** → `status = 'active'`, `fail_count = 0`

---

## 8. Scenario 4 — Unregistered Device

### Mô tả tấn công
Một ESP32 chưa bao giờ được đăng ký vào hệ thống (mua ngoài, do kẻ tấn công mang vào) cố gửi dữ liệu lên server.

```
Kẻ tấn công có:  ESP32 mới + biết endpoint URL
Kẻ tấn công làm: Tự đặt device_id = "ESP32-GW-HACKER01"
                  Tự tính HMAC từ một secret_key bịa đặt
```

### Tại sao tấn công thất bại

**Bước đầu tiên trong `hmacService.ts:13-18`:**
```typescript
async function fetchDevice(device_id: string): Promise<DeviceRow | null> {
    const [rows] = await pool.execute<any[]>(
        `SELECT id, secret_key, status, fail_count
         FROM devices WHERE device_id = ? LIMIT 1`,
        [device_id]   // ← Prepared statement, không thể inject SQL
    );
    return rows.length > 0 ? (rows[0] as DeviceRow) : null;
    // → trả về null nếu device_id không tồn tại
}

// Trong verifyGatewayHMAC():
const device = await fetchDevice(gateway_id);
if (!device) return { ok: false, error: "NOT_FOUND" };
//                                       ↑
//           Thoát ngay, không cần tính HMAC
```

**Quan trọng:** Server không bao giờ tiết lộ lý do cụ thể (device không tồn tại hay HMAC sai) — cả hai đều trả về `GATEWAY_AUTH_FAIL`. Điều này ngăn kẻ tấn công dùng phản hồi để đoán `device_id` hợp lệ.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 4: Unregistered Device ==="
echo "Gửi request với device_id hoàn toàn không tồn tại trong DB"
echo ""

FAKE_TS=$(ts)
FAKE_GW_HMAC=$(openssl rand -hex 32)
FAKE_SN_HMAC=$(openssl rand -hex 32)

post_data "{
  \"gateway_id\":   \"ESP32-GW-HACKER01\",
  \"gw_timestamp\": $FAKE_TS,
  \"gw_hmac\":      \"$FAKE_GW_HMAC\",
  \"sensor_id\":    \"ESP32-SN-HACKER01\",
  \"sn_timestamp\": $FAKE_TS,
  \"sn_hmac\":      \"$FAKE_SN_HMAC\",
  \"data\":         { \"temperature\": 30.0, \"humidity\": 70.0 }
}"
```

### Kết quả mong đợi

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "NOT_FOUND"
}
```

### So sánh Scenario 1 vs Scenario 4

| Thuộc tính | Scenario 1 (Spoofing) | Scenario 4 (Unregistered) |
|---|---|---|
| `device_id` | Có trong DB | Không có trong DB |
| `secret_key` | Không biết | Không có |
| Điểm bị chặn | HMAC so sánh thất bại | DB lookup trả về null |
| Error code | `HMAC_MISMATCH` | `NOT_FOUND` |
| HTTP response | 401 `GATEWAY_AUTH_FAIL` | 401 `GATEWAY_AUTH_FAIL` |
| fail_count tăng? | Có (vì device tồn tại) | Không (không có DB record) |

---

## 9. Scenario 5 — Privilege Escalation: Sensor giả làm Gateway

### Mô tả tấn công
Một Sensor Node (thiết bị `device_type = 'sensor'`) cố gạt qua lớp Gateway bằng cách **đặt chính `sensor_id` của mình vào trường `gateway_id`**. Nó có `secret_key` hợp lệ của chính nó, nên HMAC tính đúng — nhưng sai vai trò.

```
Sensor muốn gửi trực tiếp (bypass Gateway):
  gateway_id = "ESP32-SN-001"  ← dùng SN_ID thay vì GW_ID
  gw_hmac    = HMAC(SN_SECRET, "ESP32-SN-001:timestamp")  ← đúng kỹ thuật!
  sensor_id  = "ESP32-SN-001"  ← giống gateway_id
  sn_hmac    = HMAC(SN_SECRET, "ESP32-SN-001:timestamp")  ← đúng kỹ thuật!
```

### Tại sao HMAC pass nhưng vẫn bị reject

**HMAC Level 1 và Level 2 đều PASS** — vì `SN_SECRET` là key thật, HMAC tính đúng.

**Nhưng RBAC check trong `data.routes.ts:36-43` thất bại:**
```typescript
// Fetch device_type từ DB
const gwRow = rows.find(r => r.id === gateway.id);
const snRow = rows.find(r => r.id === sensor.id);

// RBAC: device_type check
if (!gwRow || gwRow.device_type !== "gateway") {
    // gwRow.device_type = 'sensor' (vì ESP32-SN-001 là sensor)
    // 'sensor' !== 'gateway' → TRUE → block
    res.status(403).json({
        error: "INVALID_DEVICE_TYPE",
        detail: "gateway_id must be a gateway device"
    });
    return;
}
```

**Toàn bộ luồng:**
```
validateDevice middleware:
  Level 1: verifyGatewayHMAC("ESP32-SN-001", ts, hmac)
    → fetchDevice("ESP32-SN-001") → tìm thấy (sensor tồn tại)
    → isTimestampValid() → OK
    → safeCompare(expected, hmac) → TRUE (HMAC đúng!)
    → { ok: true, device: {...} }
  Level 2: verifyDeviceHMAC("ESP32-SN-001", ts, hmac) → TRUE (cũng pass)
  → next()

data.routes handler:
  gwRow = {id: X, device_type: 'sensor', status: 'active'}
  gwRow.device_type ('sensor') !== 'gateway' → TRUE
  → 403 INVALID_DEVICE_TYPE  ← BỊ CHẶN TẠI ĐÂY
```

**Ý nghĩa:** Dù HMAC có đúng, thiết bị **không thể thực hiện hành động vượt quá quyền hạn của mình**. Sensor chỉ được phép nhận dữ liệu, không được đóng vai Gateway để forward.

### Lệnh thực hiện

```bash
echo "=== SCENARIO 5: Privilege Escalation ==="
echo "Sensor dùng sensor_id làm gateway_id — HMAC đúng nhưng sai role"
echo ""

PRIV_TS=$(ts)
# Sensor tính HMAC đúng từ SN_SECRET — nhưng giả vờ là Gateway
SN_AS_GW_HMAC=$(hmac "$SN_SECRET" "${SN_ID}:${PRIV_TS}")

echo "Payload đặc biệt:"
echo "  gateway_id = SN_ID = $SN_ID  ← cố tình dùng sensor làm gateway"
echo "  gw_hmac    = HMAC(SN_SECRET, SN_ID:ts) = ${SN_AS_GW_HMAC:0:20}...  ← đúng kỹ thuật"
echo ""

post_data "{
  \"gateway_id\":   \"$SN_ID\",
  \"gw_timestamp\": $PRIV_TS,
  \"gw_hmac\":      \"$SN_AS_GW_HMAC\",
  \"sensor_id\":    \"$SN_ID\",
  \"sn_timestamp\": $PRIV_TS,
  \"sn_hmac\":      \"$SN_AS_GW_HMAC\",
  \"data\":         { \"temperature\": 25.0, \"humidity\": 60.0 }
}"
```

### Kết quả mong đợi

```
HTTP 403
{
    "error": "INVALID_DEVICE_TYPE",
    "detail": "gateway_id must be a gateway device"
}
```

> **Lưu ý khi giải thích:** HTTP là **403** (Forbidden) thay vì 401 (Unauthorized). Điều này phân biệt: 401 = chưa xác thực được danh tính, 403 = xác thực được danh tính nhưng không có quyền thực hiện hành động.

---

## 10. Scenario 6 — SQL Injection

### Mô tả tấn công
Kẻ tấn công nhúng mã SQL vào trường `gateway_id` với mục tiêu:
- Bypass xác thực: `' OR '1'='1` → câu SELECT luôn trả về kết quả
- Exfiltration: `' UNION SELECT secret_key FROM devices--` → lấy tất cả secret key

### Payload nguy hiểm (nếu KHÔNG có prepared statements)

```sql
-- Nếu server dùng string concatenation:
SELECT id, secret_key FROM devices WHERE device_id = '' OR '1'='1'
-- → Trả về tất cả records → bypass xác thực!

SELECT id, secret_key FROM devices WHERE device_id = ''
UNION SELECT secret_key, '' FROM devices--'
-- → Lấy toàn bộ secret keys!
```

### Tại sao tấn công thất bại — Prepared Statements

**Code thực tế trong `hmacService.ts:14-17`:**
```typescript
const [rows] = await pool.execute<any[]>(
    `SELECT id, secret_key, status, fail_count
     FROM devices WHERE device_id = ? LIMIT 1`,
    [device_id]   // ← Tham số được truyền tách biệt
);
```

**Cơ chế hoạt động của Prepared Statements:**
```
1. Server gửi template SQL đến MySQL trước:
   "SELECT ... WHERE device_id = ?"
   MySQL parse và compile câu query này một lần.

2. Server gửi giá trị tham số riêng:
   device_id = "' OR '1'='1"

3. MySQL ghép: device_id được ESCAPE tự động:
   WHERE device_id = '\' OR \'1\'=\'1'
   → Tìm thiết bị tên "\' OR \'1\'=\'1" → không tìm thấy → NOT_FOUND

4. SQL trong giá trị KHÔNG BAO GIỜ được execute.
```

### Lệnh thực hiện

```bash
echo "=== SCENARIO 6: SQL Injection ==="
echo ""

INJECT_TS=$(ts)

# Payload 1: Boolean-based bypass
echo "--- Payload 1: OR bypass ---"
post_data "{
  \"gateway_id\":   \"' OR '1'='1\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"' OR '1'='1\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"

echo ""
echo "--- Payload 2: UNION-based exfiltration ---"
post_data "{
  \"gateway_id\":   \"' UNION SELECT id, secret_key, status, fail_count FROM devices--\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"normal\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"

echo ""
echo "--- Payload 3: DROP TABLE ---"
post_data "{
  \"gateway_id\":   \"ESP32'; DROP TABLE devices;--\",
  \"gw_timestamp\": $INJECT_TS,
  \"gw_hmac\":      \"fake\",
  \"sensor_id\":    \"normal\",
  \"sn_timestamp\": $INJECT_TS,
  \"sn_hmac\":      \"fake\",
  \"data\":         {}
}"
```

### Kết quả mong đợi (tất cả 3 payload)

```
HTTP 401
{
    "error": "GATEWAY_AUTH_FAIL",
    "reason": "NOT_FOUND"
}
```

Không có DB leak, không có bảng bị xóa.

### Xác nhận DB vẫn toàn vẹn

```sql
SHOW TABLES;
-- Vẫn đủ 5 bảng: users, devices, sensor_data, device_tokens, audit_log

SELECT COUNT(*) FROM devices;
-- Số lượng thiết bị không thay đổi
```

---

## 11. Kiểm tra Audit Log & Dashboard

### Xem Audit Log trên giao diện Web

1. Truy cập **http://localhost:3000/audit**
2. Filter theo **Event Type**:

| Event Type | Màu | Ý nghĩa |
|---|---|---|
| `DATA_RECV` | Xanh lá | Dữ liệu nhận thành công |
| `GATEWAY_AUTH_FAIL` | Đỏ | Gateway xác thực thất bại |
| `SENSOR_AUTH_FAIL` | Cam | Sensor xác thực thất bại |
| `DEVICE_BLOCKED` | Đỏ đậm | Thiết bị bị khoá tự động |
| `DEVICE_REGISTER` | Vàng | Đăng ký thiết bị mới |

### Xem trực tiếp trong DB

```powershell
# Kết nối vào MySQL container
docker exec -it managerdeviceiot-mysql-1 `
    mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
-- Toàn bộ sự kiện bảo mật, mới nhất trước
SELECT
    al.event_type,
    d.device_id,
    al.ip_address,
    al.details,
    al.created_at
FROM audit_log al
LEFT JOIN devices d ON al.device_id = d.id
ORDER BY al.created_at DESC
LIMIT 20;

-- Thống kê theo loại sự kiện
SELECT event_type, COUNT(*) AS total
FROM audit_log
GROUP BY event_type
ORDER BY total DESC;

-- Trạng thái thiết bị sau demo
SELECT device_id, device_type, status, fail_count,
       last_seen, created_at
FROM devices
ORDER BY created_at DESC;

-- Dữ liệu sensor đã được lưu (Scenario 0)
SELECT
    d.device_id  AS sensor,
    gw.device_id AS via_gateway,
    sd.payload,
    sd.received_at
FROM sensor_data sd
JOIN devices d  ON sd.device_id  = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC
LIMIT 5;
```

### Xem log backend real-time trong khi demo

```powershell
# Mở terminal riêng để xem log
docker compose logs -f backend
```

Log backend sẽ in ra từng request, HTTP status, và lỗi chi tiết.

---

## 12. Bảng tổng kết STRIDE

| # | Kịch bản | STRIDE | Điểm bị chặn trong code | HTTP | Audit Event |
|---|---|---|---|---|---|
| 0 | Baseline hợp lệ | — | (Pass toàn bộ) | `200` | `DATA_RECV` |
| 1 | Device Spoofing | **S**poofing | `safeCompare()` → false | `401` | `GATEWAY_AUTH_FAIL` reason: `HMAC_MISMATCH` |
| 2 | Replay Attack | **T**ampering | `isTimestampValid()` → false | `401` | `GATEWAY_AUTH_FAIL` reason: `TIMESTAMP_EXPIRED` |
| 3 | Brute Force | **D**enial of Service | `fail_count ≥ 5` → `blockDevice()` | `401→403` | `AUTH_FAIL` ×5 + `DEVICE_BLOCKED` |
| 4 | Unregistered Device | **S**poofing | `fetchDevice()` → null | `401` | `GATEWAY_AUTH_FAIL` reason: `NOT_FOUND` |
| 5 | Privilege Escalation | **E**levation | `device_type !== 'gateway'` | `403` | (không ghi — bị chặn sau HMAC) |
| 6 | SQL Injection | **T**ampering | Prepared statements escape | `401` | `GATEWAY_AUTH_FAIL` reason: `NOT_FOUND` |

### Cơ chế phòng thủ theo lớp

```
Lớp 1 – Input Validation
  └─ Kiểm tra đủ field, format hợp lệ (validateDevice.ts:45-48)

Lớp 2 – Identity Verification (Level 1: Gateway)
  ├─ DB lookup (fetchDevice) — Prepared Statements chống SQL Injection
  ├─ Timestamp Window ±300s — chống Replay Attack
  └─ HMAC timingSafeEqual   — chống Spoofing & Timing Attack

Lớp 3 – Identity Verification (Level 2: Sensor)
  ├─ DB lookup
  ├─ Timestamp Window
  └─ HMAC timingSafeEqual

Lớp 4 – Role-Based Access Control
  └─ device_type check       — chống Privilege Escalation

Lớp 5 – Status Check
  └─ status = 'active'       — chặn thiết bị đã bị block

Lớp 6 – Adaptive Defense
  └─ fail_count → auto-block — chống Brute Force
```

---

## 13. Điểm yếu còn lại & phân tích rủi ro

Phần này dùng cho báo cáo — phân tích các rủi ro mà hệ thống **chưa** giải quyết hoàn toàn.

### 13.1 — Nguy cơ lộ Secret Key

| Tình huống lộ key | Hậu quả | Biện pháp khắc phục |
|---|---|---|
| **Flash dump ESP32** | Đọc được `SECRET_KEY` từ flash memory, tạo token hợp lệ vô thời hạn | Bật ESP32 Secure Boot + NVS Encryption, lưu key trong eFuse |
| **Commit lên GitHub public** | `config.h` chứa key bị index công khai vĩnh viễn | Thêm `config.h` vào `.gitignore`, dùng OTA cấp key |
| **Log server in ra key** | Key xuất hiện trong log file, ai có quyền đọc log là có key | Code review, không log credentials, kiểm tra với `grep -r "secret_key"` trong log |
| **Database bị breach** | Secret key lưu plain text → toàn bộ key bị lộ | Mã hóa AES-256-GCM trước khi lưu, master key trong env var |
| **Traffic MQTT không mã hóa** | Sniff payload trên mạng LAN (dù HMAC vẫn an toàn) | Bật TLS trên Mosquitto, cổng 8883 thay vì 1883 |

### 13.2 — Kịch bản tấn công vật lý (Out of scope nhưng nên đề cập)

```
Kẻ tấn công lấy được ESP32 vật lý:
1. Cắm vào máy tính
2. Dùng esptool.py để đọc flash:
   python -m esptool --port COM3 read_flash 0 0x400000 firmware_dump.bin
3. Tìm chuỗi DEVICE_ID và SECRET_KEY trong file dump
4. Tạo request giả với key thật → 200 OK mãi mãi

Giải pháp: ESP32 Secure Boot V2 + Flash Encryption
```

### 13.3 — Giải pháp Key Rotation (đề xuất)

```
Khi phát hiện key bị lộ:
1. Admin click "Rotate Key" trên Dashboard
2. Backend sinh secret_key mới
3. Thiết bị nhận key mới qua kênh bảo mật (OTA hoặc Serial được mã hóa)
4. Key cũ bị revoke sau 24 giờ
5. Mọi request dùng key cũ → HMAC_MISMATCH → 401
```

---

## Thứ tự demo khuyên dùng (16 phút)

```
[ 2 phút] Giới thiệu: sơ đồ kiến trúc, luồng dữ liệu, 4 lớp bảo vệ
[ 1 phút] Scenario 0: Baseline → 200 OK (hệ thống hoạt động bình thường)
[ 2 phút] Scenario 1: Spoofing → giải thích HMAC, timingSafeEqual
[ 2 phút] Scenario 2: Replay → giải thích timestamp window, xem 289s vs 700s
[ 2 phút] Scenario 3: Brute Force → xem Dashboard đổi sang Blocked, xem audit log
[ 1 phút] Scenario 4: Unregistered → nhanh
[ 2 phút] Scenario 5: Privilege Escalation → giải thích RBAC, HTTP 403 vs 401
[ 1 phút] Scenario 6: SQL Injection → chạy nhanh 3 payload
[ 2 phút] Audit Log Dashboard → tổng hợp toàn bộ sự kiện
[ 1 phút] Điểm yếu còn lại → flash dump, key rotation
```

**Script tự động (5 scenario cùng lúc):**
```bash
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

**Reset sau demo:**
- Vào **Devices** → **Unlock** Gateway bị block
- `fail_count` tự về 0 khi unlock
