# 3.3. Threat Model và Kiểm Thử Bảo Mật

> **Mục tiêu mục này:** Phân tích mô hình mối đe dọa (STRIDE) của hệ thống IoT, sau đó kiểm chứng thực tế bằng cách chạy 5 kịch bản tấn công điển hình trên môi trường Docker local. Toàn bộ kết quả được ghi lại từ demo thực tế với thiết bị `ESP32-GW-33D1954D` và `ESP32-SN-7402D02D`.

---

## 3.3.1 Mô Hình Mối Đe Dọa (STRIDE)

Hệ thống áp dụng phân tích STRIDE trên từng tầng của luồng dữ liệu:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    LUỒNG DỮ LIỆU VÀ CÁC ĐIỂM TẤN CÔNG                   │
│                                                                          │
│  [Sensor ESP32]──MQTT──►[Broker 1]──MQTT──►[Gateway ESP32]              │
│       │                    ⚠T,I              │         ⚠S,T,R            │
│       └── HMAC Layer 2 ──────────────────────┘                          │
│                                                                          │
│  [Gateway ESP32]──HTTP POST──►[Backend Node.js]──SQL──►[MySQL DB]        │
│       │              ⚠S,T,R,E      │ RBAC ⚠E,P      │       ⚠I,D       │
│       └── HMAC Layer 1 ────────────┘                                    │
│                                                                          │
│  [Browser]──HTTP──►[Nginx]──►[Backend]──JWT──►[Frontend Next.js]         │
│               ⚠T,E           ⚠E               ⚠E,P                     │
│                                                                          │
│  Ký hiệu STRIDE: S=Spoofing T=Tampering R=Repudiation                   │
│                  I=Info Disclosure D=Denial of Service E=Elevation       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Bảng STRIDE Tổng Hợp

| Mối đe dọa (STRIDE) | Kịch bản cụ thể | Cơ chế phòng vệ | Kiểm thử |
|---|---|---|---|
| **S — Spoofing** | Giả mạo device_id + HMAC bịa đặt | HMAC-SHA256 + timingSafeEqual() | S1 |
| **T — Tampering** | Sửa payload trong transit (MQTT plaintext) | HMAC bảo vệ tính toàn vẹn payload | S1, S2 |
| **R — Repudiation** | Xóa audit log để che dấu tấn công | Audit log phân quyền; chỉ admin xóa được | S3, S4 |
| **I — Info Disclosure** | Nghe lén MQTT broker (anonymous) | Không có TLS ⚠ — điểm yếu còn tồn tại | — |
| **D — Denial of Service** | Brute force HMAC liên tục → làm nghẽn | Auto-block sau 5 lần (fail_count ≥ 5) | S3 |
| **E — Elevation of Privilege** | Sensor giả làm Gateway; Viewer gọi admin API | RBAC device_type check + requireRole() | S4 |

---

## 3.3.2 Thiết Lập Môi Trường Kiểm Thử

### Hạ tầng

```
┌─────────────────── Docker Compose ─────────────────────┐
│  iot-mysql      :3308  ✓ running (healthy)              │
│  iot-mqtt-broker-1 :1883  ✓ running                    │
│  iot-mqtt-broker-2 :1884  ✓ running                    │
│  iot-backend    :5000  ✓ running (healthy)              │
│  iot-frontend   :3000  ✓ running                       │
│  iot-nginx      :80    ✓ running                       │
│                                                         │
│  Health check: GET /api/health                          │
│  → {"status":"ok","db":"connected","mqtt":"connected"}  │
└─────────────────────────────────────────────────────────┘
```

### Thiết Bị Demo

| Vai trò | Device ID | Loại |
|---|---|---|
| Gateway | `ESP32-GW-33D1954D` | gateway |
| Sensor | `ESP32-SN-7402D02D` | sensor |

### Xác Nhận HMAC Trước Demo

```bash
$ echo -n "${GW_ID}:$(date +%s)" | openssl dgst -sha256 -hmac "$GW_SECRET" -hex | sed 's/^.* //'
a89b8d7801bdd668291974a620a3ef0db016959e1cbbe3df503a069608c2029c
# → 64 ký tự hex — HMAC hoạt động đúng
```

### Lệnh Chạy Demo

```bash
# Git Bash — không dùng PowerShell
chmod +x scripts/attack_demo.sh
./scripts/attack_demo.sh "$BACKEND" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

---

## 3.3.3 Scenario 0 — Baseline: Request Hợp Lệ

### Mô tả

Gửi request đầy đủ, đúng định dạng với HMAC và timestamp hợp lệ. Mục đích xác nhận hệ thống hoạt động bình thường trước khi thực hiện các kịch bản tấn công.

### Luồng Xử Lý

```
Attacker/Test Client
        │
        │  POST /api/device/data
        │  {
        │    "gateway_id":   "ESP32-GW-33D1954D",
        │    "gw_timestamp": 1782097064,            ← now()
        │    "gw_hmac":      "d36d4bc0...",         ← HMAC-SHA256(GW_SECRET, "GW_ID:ts")
        │    "sensor_payload": {
        │      "sensor_id":    "ESP32-SN-7402D02D",
        │      "sn_timestamp": 1782097064,
        │      "sn_hmac":      "13dc89c8...",       ← HMAC-SHA256(SN_SECRET, "SN_ID:ts")
        │      "data":         { "temperature": 28.5, "humidity": 65.0 }
        │    }
        │  }
        ▼
   [validateDevice]
        ├─ verifyGatewayHMAC() → PASS ✓  (HMAC khớp, |now - ts| = 0s ≤ 300s)
        └─ verifyDeviceHMAC()  → PASS ✓

   [data.routes.ts]
        ├─ device_type = 'gateway' ✓
        ├─ status      = 'active'  ✓
        ├─ INSERT sensor_data
        ├─ UPDATE devices SET last_seen=NOW(), fail_count=0
        └─ INSERT audit_log (event='DATA_RECV')
                │
                ▼
        200 OK {"success":true, "sensor_id":"ESP32-SN-7402D02D", ...}
```

### Kết Quả Thực Tế

```
→ Gửi request hợp lệ...
✓ HTTP 200
  Response: {"success":true,"sensor_id":"ESP32-SN-7402D02D",
             "gateway_id":"ESP32-GW-33D1954D",
             "received_at":"2026-06-22T02:57:45.000Z"}

  ✓ DATA_RECV ghi vào audit_log
```

**Kết quả:** `200 OK` — hệ thống nhận và lưu dữ liệu. Audit log ghi sự kiện `DATA_RECV`.

> 📸 *Hình 3.3.1 — Audit Log hiển thị DATA_RECV xanh tại `http://localhost:3000/audit`*

---

## 3.3.4 Scenario 1 — Device Spoofing (Giả Mạo Thiết Bị)

### Mô tả Tấn Công

Kẻ tấn công biết `gateway_id` (có thể thu thập qua MQTT sniff, Serial console, hoặc reverse engineering firmware) nhưng **không có `secret_key`**. Kẻ tấn công tự bịa một chuỗi hex 64 ký tự (`deadbeef...`) để điền vào trường `gw_hmac`.

### Luồng Tấn Công vs Phòng Thủ

```
Kẻ tấn công có:   gateway_id = "ESP32-GW-33D1954D"  ✓ (biết từ sniff)
Kẻ tấn công thiếu: secret_key                        ✗ (không có)
Kẻ tấn công làm:  gw_hmac = "deadbeefdeadbeef..."   ← tự bịa 64 hex

        POST /api/device/data
        { "gw_hmac": "deadbeefdeadbeefdeadbeef..." }
                │
                ▼
   [hmacService.ts — verifyGatewayHMAC()]
        ├─ fetchDevice("ESP32-GW-33D1954D") → tìm thấy trong DB
        ├─ isTimestampValid() → OK (timestamp mới)
        ├─ expected = HMAC-SHA256(secret_key_from_DB, "GW_ID:ts")
        │           = "d36d4bc09eab587f..."   ← hoàn toàn khác!
        └─ timingSafeEqual("d36d4bc0...", "deadbeef...") → FALSE
                │
                ▼
   incrementFailCount(gateway) → fail_count = 1
   log("GATEWAY_AUTH_FAIL", ip, {reason:"HMAC_MISMATCH"})
                │
                ▼
        401 {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
```

**Tại sao `timingSafeEqual` thay vì `===`?**

```
So sánh ===: dừng ngay ký tự đầu khác nhau
  → Kẻ tấn công đo thời gian phản hồi → đoán bao nhiêu ký tự đầu đúng

timingSafeEqual: luôn so sánh đủ 32 bytes bất kể kết quả
  → Không rò rỉ thông tin qua timing → chống Timing Attack
```

### Kết Quả Thực Tế

```
→ Gửi request với HMAC giả mạo...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}

  ✓ timingSafeEqual(expected, 'deadbeef...') = false → 401 GATEWAY_AUTH_FAIL
```

**Kết quả:** `401 GATEWAY_AUTH_FAIL` — tấn công bị chặn. `fail_count` tăng lên 1.

> 📸 *Hình 3.3.2 — Audit Log hiển thị GATEWAY_AUTH_FAIL với reason: HMAC_MISMATCH*

---

## 3.3.5 Scenario 2 — Replay Attack (Tấn Công Phát Lại)

### Mô tả Tấn Công

Kẻ tấn công **chặn được một request hợp lệ hoàn toàn** (sniff MQTT traffic, MITM) và gửi lại sau 12 phút. HMAC trong request này **đúng kỹ thuật** — vì được tính từ secret key thật. Điểm sai duy nhất là timestamp đã quá cũ.

### Luồng Tấn Công vs Phòng Thủ

```
10:00:00  Sensor gửi request hợp lệ:
           { gw_timestamp: T, gw_hmac: "3f075b81..." }  ← HMAC đúng!

10:00:05  Kẻ tấn công sniff được request này trên MQTT (không có TLS)

10:12:00  Kẻ tấn công gửi lại request cũ:
           { gw_timestamp: T,        ← 700 giây trước
             gw_hmac: "3f075b81..." }  ← HMAC vẫn đúng!
                │
                ▼
   [hmacService.ts — isTimestampValid()]

   TIMESTAMP_WINDOW = 300 giây (±5 phút)

   |now() - T| = 700 giây  >  300 giây → FALSE

   return { ok: false, error: "TIMESTAMP_EXPIRED" }
                │
   ┌────────────┴────────────────────────────────┐
   │  QUAN TRỌNG: timestamp được kiểm tra TRƯỚC  │
   │  khi so sánh HMAC — dù HMAC đúng, request   │
   │  vẫn bị từ chối ngay ở bước này             │
   └─────────────────────────────────────────────┘
                │
                ▼
   log("REPLAY_ATTACK", ip, {reason:"TIMESTAMP_EXPIRED"})
        401 {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}

─────────────────────────────────────────────────────
  Timeline cửa sổ 300 giây:

  T+0s    Request hợp lệ            ✓ ACCEPTED
  T+100s  Replay #1 (trong cửa sổ)  ✓ ACCEPTED (điểm yếu: có thể replay ≤300s)
  T+300s  Replay cuối hạn           ✓ ACCEPTED
  T+301s  Replay quá hạn            ✗ TIMESTAMP_EXPIRED
  T+700s  Replay của kẻ tấn công    ✗ TIMESTAMP_EXPIRED ← kịch bản này
─────────────────────────────────────────────────────
```

### Payload Demo

```json
{
  "gateway_id":   "ESP32-GW-33D1954D",
  "gw_timestamp": 1782096366,
  "gw_hmac":      "3f075b81d89c6d8262faa70d774e89245a0d601f1b8769316fc601c894aba738",
  "sensor_payload": {
    "sensor_id":    "ESP32-SN-7402D02D",
    "sn_timestamp": 1782096366,
    "sn_hmac":      "92cee2a92e7df9c5ea1b01074c53c4872c15865a96c8b77687b1a203b4b955cf"
  }
}
```

> ⚠️ **Lưu ý:** `gw_hmac = "3f075b81..."` là HMAC **đúng kỹ thuật** — được tính từ secret key thật với đúng message. Nhưng timestamp cách hiện tại 700 giây > 300 giây nên vẫn bị từ chối.

### Kết Quả Thực Tế

```
→ Gửi request với timestamp cũ...
✗ HTTP 401
  Response: {"error":"GATEWAY_AUTH_FAIL","reason":"TIMESTAMP_EXPIRED"}

  ✓ HMAC đúng nhưng |now − 1782096366| > 300s → TIMESTAMP_EXPIRED → audit: REPLAY_ATTACK
```

**Kết quả:** `401 TIMESTAMP_EXPIRED` — phát lại thất bại. Audit log ghi `REPLAY_ATTACK`.

> 📸 *Hình 3.3.3 — Audit Log hiển thị REPLAY_ATTACK với reason: TIMESTAMP_EXPIRED*

---

## 3.3.6 Scenario 3 — Brute Force → Auto Block

### Mô tả Tấn Công

Kẻ tấn công gửi liên tiếp 6 request với HMAC ngẫu nhiên (random 32 bytes mỗi lần). Kịch bản này kiểm tra cơ chế `fail_count` và auto-block.

### Luồng Tấn Công vs Phòng Thủ

```
Kẻ tấn công:
  Lần 1: gw_hmac = openssl rand -hex 32  → random
  Lần 2: gw_hmac = openssl rand -hex 32  → random mới
  ...  (mỗi lần random khác nhau, xác suất đúng = 1/2^256 ≈ 0)
  Lần 6: gw_hmac = openssl rand -hex 32  → random

Hệ thống phòng thủ (validateDevice.ts):
┌─────────────────────────────────────────────────────┐
│  const BLOCK_THRESHOLD = 5;                         │
│                                                     │
│  mỗi lần HMAC fail:                                │
│    fail_count = fail_count + 1                      │
│    nếu fail_count >= 5:                             │
│      status = 'blocked'                             │
│      INSERT audit_log('DEVICE_BLOCKED')             │
└─────────────────────────────────────────────────────┘

  Lần 1: HMAC_MISMATCH → fail_count=1 → 401  [S1 đã tăng 1 lần]
  Lần 2: HMAC_MISMATCH → fail_count=2 → 401  [S2 đã tăng 1 lần]
  Lần 3: HMAC_MISMATCH → fail_count=3 → 401
  Lần 4: HMAC_MISMATCH → fail_count=4 → 401
  Lần 5: HMAC_MISMATCH → fail_count=5 ← ĐẠT NGƯỠNG
                        → blockDevice() → status='blocked'
                        → DEVICE_BLOCKED ghi vào audit
                        → 401
  Lần 6: HMAC_MISMATCH → 401  (hoặc 403 tuỳ thứ tự check)

Dashboard: Gateway hiển thị badge đỏ 🔴 BLOCKED
```

### Kết Quả Thực Tế

```
  ℹ fail_count tăng mỗi lần fail, đạt BLOCK_THRESHOLD=5 → status='blocked'
  Lần 1: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 2: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 3: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 4: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 5: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}
  Lần 6: HTTP 401 | {"error":"GATEWAY_AUTH_FAIL","reason":"HMAC_MISMATCH"}

  ✓ Lần 5: fail_count ≥ 5 → blockDevice() → DEVICE_BLOCKED ghi audit
  ℹ Gateway ESP32-GW-33D1954D hiện status='blocked'
```

> 📸 *Hình 3.3.4 — Dashboard Devices: Gateway hiện badge đỏ "Blocked"*
> 📸 *Hình 3.3.5 — Audit Log: DEVICE_BLOCKED event sau 5 lần GATEWAY_AUTH_FAIL*

**Kết quả:** Sau 5 lần thất bại liên tiếp, Gateway bị tự động khóa. Mọi request tiếp theo — kể cả HMAC đúng — đều bị từ chối cho đến khi Admin mở khóa thủ công.

---

## 3.3.7 Scenario 4 — Privilege Escalation (Leo Thang Đặc Quyền)

### Mô tả Tấn Công

Sensor Node có `secret_key` hợp lệ của chính mình. Kẻ tấn công (hoặc Sensor bị compromise) cố gạt qua vai trò Gateway bằng cách đặt `sensor_id` của mình vào trường `gateway_id`. HMAC tính từ `SN_SECRET` hoàn toàn **đúng kỹ thuật** — nhưng sai vai trò.

### Luồng Tấn Công vs Phòng Thủ

```
Tấn công: Sensor (SN_ID="ESP32-SN-7402D02D") giả làm Gateway

Payload gửi:
  gateway_id  = "ESP32-SN-7402D02D"   ← SN_ID thay vì GW_ID!
  gw_timestamp = <now>
  gw_hmac     = HMAC(SN_SECRET, "ESP32-SN-7402D02D:<ts>")  ← đúng kỹ thuật!
  sensor_id   = "ESP32-SN-7402D02D"
  sn_hmac     = HMAC(SN_SECRET, "ESP32-SN-7402D02D:<ts>")  ← đúng kỹ thuật!

Hệ thống xử lý từng lớp:

  ┌─── LAYER 1: HMAC Gateway ──────────────────────────────────┐
  │  fetchDevice("ESP32-SN-7402D02D") → tìm thấy (sensor)    │
  │  timingSafeEqual(expected, gw_hmac) → TRUE ✓ (HMAC đúng!) │
  └──────────────────────────────── PASS ──────────────────────┘
                │
  ┌─── LAYER 2: HMAC Sensor ───────────────────────────────────┐
  │  fetchDevice("ESP32-SN-7402D02D") → tìm thấy             │
  │  timingSafeEqual(expected, sn_hmac) → TRUE ✓ (HMAC đúng!) │
  └──────────────────────────────── PASS ──────────────────────┘
                │
  ┌─── LAYER 3: RBAC device_type check ────────────────────────┐
  │  gwRow.device_type = 'sensor'   ← lấy từ DB               │
  │  'sensor' !== 'gateway' → TRUE                             │
  │                                                            │
  │  // data.routes.ts:36-43                                   │
  │  log("PRIVILEGE_ESCALATION", ip, {gateway_id: SN_ID})     │
  │  res.status(403).json({                                    │
  │    error: "INVALID_DEVICE_TYPE",                           │
  │    detail: "gateway_id must be a gateway device"           │
  │  })                                                        │
  └──────────────────────── BLOCKED ───────────────────────────┘
                │
                ▼
        403 INVALID_DEVICE_TYPE  ← HTTP 403 (có danh tính, sai quyền)
```

> **Phân biệt 401 vs 403:**
> - `401 Unauthorized` = chưa xác thực được danh tính (HMAC sai, timestamp hết hạn)
> - `403 Forbidden` = đã xác thực được danh tính (HMAC đúng), nhưng không có quyền thực hiện hành động này

### Kết Quả Thực Tế

```
→ Gửi request privilege escalation...
✗ HTTP 403
  Response: {"error":"INVALID_DEVICE_TYPE",
             "detail":"gateway_id must be a gateway device"}

  ✓ HMAC Layer1+Layer2: PASS | RBAC: device_type='sensor' ≠ 'gateway' → 403 PRIVILEGE_ESCALATION
```

**Kết quả:** `403 PRIVILEGE_ESCALATION` — HMAC đúng nhưng device_type sai. Audit log ghi `PRIVILEGE_ESCALATION`.

> 📸 *Hình 3.3.6 — Audit Log: PRIVILEGE_ESCALATION event với gateway_id là SN_ID*

---

## 3.3.8 Tổng Kết Kết Quả Kiểm Thử

### Kết Quả 5 Scenarios (Chạy Thực Tế)

```
╔══════════════════════════════════════════════════════╗
║   IoT Security – Core Attack Demo (5 Scenarios)     ║
║   Backend : http://localhost:5000                    ║
║   Gateway : ESP32-GW-33D1954D                        ║
║   Sensor  : ESP32-SN-7402D02D                        ║
╚══════════════════════════════════════════════════════╝

══════════════════════════════════════════════════
  TỔNG KẾT – CORE 5 SCENARIOS
══════════════════════════════════════════════════
  S0  Baseline (hợp lệ)           → ✓ 200 DATA_RECV
  S1  Device Spoofing (HMAC fake) → ✗ 401 GATEWAY_AUTH_FAIL (HMAC_MISMATCH)
  S2  Replay Attack (−700s)        → ✗ 401 REPLAY_ATTACK (TIMESTAMP_EXPIRED)
  S3  Brute Force → Auto Block     → ✗ 401×5 GATEWAY_AUTH_FAIL + DEVICE_BLOCKED
  S4  Privilege Escalation (type)  → ✗ 403 PRIVILEGE_ESCALATION
```

### Bảng Đánh Giá Chi Tiết

| Scenario | Loại tấn công | HTTP | Audit Event | Cơ chế phòng vệ kích hoạt | Kết quả |
|---|---|---|---|---|---|
| S0 | Baseline hợp lệ | `200` | `DATA_RECV` | — | ✅ Hoạt động đúng |
| S1 | Device Spoofing | `401` | `GATEWAY_AUTH_FAIL` | HMAC-SHA256 + timingSafeEqual() | ✅ Chặn thành công |
| S2 | Replay Attack | `401` | `REPLAY_ATTACK` | Timestamp window ±300s | ✅ Chặn thành công |
| S3 | Brute Force | `401`×5 + block | `DEVICE_BLOCKED` | fail_count ≥ 5 → auto-block | ✅ Chặn + khóa thiết bị |
| S4 | Privilege Escalation | `403` | `PRIVILEGE_ESCALATION` | RBAC device_type check | ✅ Chặn thành công |

### Cơ Chế Phòng Vệ Được Kích Hoạt

```
HMAC-SHA256          ─── chống Spoofing (S1) và Tampering
timingSafeEqual()    ─── chống Timing Attack
Timestamp ±300s      ─── chống Replay Attack (S2)
fail_count + block   ─── chống Brute Force (S3) — tự động, không cần can thiệp
device_type RBAC     ─── chống Privilege Escalation (S4)
requireRole() JWT    ─── chống Elevation of Privilege qua REST API (S10)
```

### Audit Log Sau Demo

Truy cập `http://localhost:3000/audit` sẽ thấy đủ các event:

| Event Type | Từ Scenario | Màu Badge |
|---|---|---|
| `DATA_RECV` | S0 | 🟢 Xanh |
| `GATEWAY_AUTH_FAIL` (HMAC_MISMATCH) | S1, S3 | 🔴 Đỏ |
| `REPLAY_ATTACK` (TIMESTAMP_EXPIRED) | S2 | 🟠 Cam |
| `DEVICE_BLOCKED` | S3 | 🔴 Đỏ đậm |
| `PRIVILEGE_ESCALATION` | S4 | 🟣 Tím |

> 📸 *Hình 3.3.7 — Toàn bộ Audit Log sau khi chạy demo: 5 loại event đầy đủ*

---

## 3.3.9 Điểm Yếu Còn Tồn Tại

Mặc dù 5 kịch bản kiểm thử đều cho thấy hệ thống phòng vệ hiệu quả, vẫn còn một số điểm yếu cần cải tiến trong môi trường sản xuất:

| Điểm yếu | Mức độ | Mô tả | Hướng cải tiến |
|---|---|---|---|
| MQTT broker anonymous | 🔴 Cao | Bất kỳ host nào đều kết nối được Broker 1/2 | Thêm `password_file` + ACL |
| Không có TLS | 🔴 Cao | MQTT plaintext — nghe lén được payload + HMAC | TLS Mosquitto + `WiFiClientSecure` |
| Replay trong ±300s | 🟡 Trung bình | Cùng packet có thể phát lại nhiều lần trong 5 phút | Thêm nonce + Redis TTL 300s |
| Secret_key plaintext trong DB | 🟡 Trung bình | Nếu DB bị dump, toàn bộ key bị lộ | AES-256 encrypt tại application layer |
| Không có rotate key API | 🟡 Trung bình | Khi secret bị lộ, phải block + reflash firmware | Endpoint `POST /api/devices/:id/rotate-key` |

---

*Kiểm thử thực hiện ngày 2026-06-22 trên môi trường local Docker. Script: `scripts/attack_demo.sh`. Backend: `http://localhost:5000`.*
