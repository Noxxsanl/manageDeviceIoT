# Threat Model & Security

> **Phạm vi phân tích:** Toàn bộ hệ thống IoT — bao gồm Firmware ESP32 (Sensor Node + Gateway Node), MQTT Broker 1/2, Backend Node.js/TypeScript, MySQL Database, Frontend Next.js, Nginx Reverse Proxy và Docker infrastructure.
>
> **Phương pháp:** Phân tích bám sát source code thực tế trong workspace. Mọi kết luận đều có dẫn chiếu đến file/function/API cụ thể.

---

## 1. Tổng Quan Tài Sản Cần Bảo Vệ

### 1.1 Device ID

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Định danh công khai của từng thiết bị; dùng làm khóa tra cứu trong DB khi xác thực HMAC; embedded trong MQTT client ID (`sn-ESP32-SN-XXXXXXXX`, `gw-ESP32-GW-XXXXXXXX`) và trong payload gửi lên |
| **Lưu ở đâu** | Cột `device_id VARCHAR(64)` trong bảng `devices` (DB); hardcode trong firmware header `config_1.h` / `config_gw.h`; in ra Serial console lúc khởi động |
| **Nếu bị lộ** | Device ID là thông tin **nửa công khai** — attacker biết Device ID vẫn chưa thể xác thực nếu không có secret key tương ứng. Tuy nhiên nếu kết hợp với secret key bị lộ thì attacker có thể giả mạo hoàn toàn thiết bị |

### 1.2 Secret Key (HMAC Key)

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Khóa bí mật trong thuật toán HMAC-SHA256 để tạo chữ ký xác thực cho từng gói tin; mỗi thiết bị có 1 secret key riêng |
| **Lưu ở đâu** | Cột `secret_key VARCHAR(64)` trong bảng `devices` — lưu **dưới dạng plaintext hex**; hardcode trong firmware header (`firmware/sensor-node/include/config_1.h`, `firmware/gateway-node/include/config_gw.h`); chỉ được trả về một lần duy nhất qua response API đăng ký |
| **Nếu bị lộ** | **Rủi ro cao nhất.** Attacker nắm secret key có thể: tạo HMAC hợp lệ cho bất kỳ payload nào, gửi dữ liệu cảm biến giả mạo, giả danh thiết bị hoàn toàn. Không có cơ chế revoke tức thời hay rotate key |

### 1.3 JWT / Session Cookie

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Xác thực phiên đăng nhập Dashboard; chứa `{ id, username, role }` được ký bằng `JWT_SECRET`; thời hạn 8 giờ |
| **Lưu ở đâu** | Cookie HttpOnly trên browser, ký bằng `JWT_SECRET` trong biến môi trường backend; không lưu server-side |
| **Nếu bị lộ** | Attacker có thể gọi mọi API được phép theo role tương ứng trong 8 giờ. Không có cơ chế blacklist hay revoke token trước hạn. Sau khi hết hạn, token tự vô hiệu |

### 1.4 Dữ Liệu Cảm Biến

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Dữ liệu nhiệt độ/độ ẩm từ DHT22, lưu kèm `device_id`, `gateway_id`, `payload JSON`, `received_at` |
| **Lưu ở đâu** | Bảng `sensor_data` trong MySQL; tối đa 150 bản ghi gần nhất cho mỗi sensor |
| **Nếu bị lộ / sửa đổi** | Lộ dữ liệu môi trường; nếu bị inject dữ liệu giả → hệ thống đưa ra quyết định sai dựa trên đầu vào sai. Không có mã hóa payload tại DB |

### 1.5 API Backend

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | REST API phục vụ Dashboard (CRUD thiết bị, user, audit log) và thiết bị IoT (POST /api/device/data, GET /api/device/sensors) |
| **Lưu ở đâu** | Express.js server, port 5000 (internal Docker); public qua Nginx port 80 tại `/api/*` |
| **Nếu bị lộ / tấn công** | Gọi API không xác thực → 401/403 (tốt). Nếu bypass được middleware → toàn quyền với DB. API `/api/health` không có auth — lộ thông tin server đang chạy |

### 1.6 MQTT Topic

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Kênh truyền dữ liệu bất đồng bộ: `local/sensors/<id>/data` (Broker 1), `gateway/<id>/data` (Broker 2) |
| **Lưu ở đâu** | Eclipse Mosquitto, expose port 1883 (host) và 1884 (host) qua Docker Compose |
| **Nếu bị lộ / tấn công** | Cả 2 broker đều `allow_anonymous true` — bất kỳ host nào có thể kết nối và publish/subscribe. Không có ACL. Attacker có thể inject payload trực tiếp vào `gateway/+/data` — tuy nhiên backend vẫn verify HMAC |

### 1.7 Database (MySQL)

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Lưu toàn bộ trạng thái hệ thống: users, devices, sensor_data, audit_log, device_tokens |
| **Lưu ở đâu** | MySQL 8.0 Docker container, port 3308 mapped ra host; volume `mysql_data` |
| **Nếu bị lộ** | Lộ `password_hash` (bcrypt cost 12 — khó crack), lộ `secret_key` plaintext của tất cả thiết bị → toàn hệ thống xác thực thiết bị bị phá vỡ |

### 1.8 Tài Khoản Người Dùng (Admin / Operator / Viewer)

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Quản lý hệ thống qua Dashboard; phân quyền RBAC 3 cấp |
| **Lưu ở đâu** | Bảng `users` với `password_hash VARCHAR(255)` (bcrypt cost=12) |
| **Nếu bị lộ** | Admin bị chiếm → toàn quyền hệ thống. Operator bị chiếm → quản lý thiết bị, xem log. Viewer → chỉ đọc. Mặc định trong `.env.example` là `admin/admin123` — nếu không đổi thì rủi ro rất cao |

### 1.9 Audit Log

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Truy vết sự cố bảo mật: HMAC fail, replay attack, privilege escalation, block thiết bị, CRUD |
| **Lưu ở đâu** | Bảng `audit_log` trong MySQL; DATA_RECV bị prune giữ 150 bản/device |
| **Nếu bị xóa / sửa** | Mất bằng chứng tấn công. Admin có API `DELETE /api/audit-log/by-type` và `DELETE /api/audit-log/bulk` — không có immutable audit trail |

### 1.10 Dashboard Quản Trị

| Thuộc tính | Chi tiết |
|---|---|
| **Dùng để làm gì** | Giao diện quản lý thiết bị, user, log; điều khiển trạng thái thiết bị (active/blocked) |
| **Lưu ở đâu** | Next.js frontend, Docker container port 3000 |
| **Nếu bị chiếm** | Kiểm soát toàn bộ thiết bị trong hệ thống (block/unblock/delete), xem/xóa audit log, tạo user |

---

## 2. Mô Hình Luồng Dữ Liệu Bảo Mật

### 2.1 Sơ Đồ Tổng Thể

```
══════════════════════════════════════════════════════════════════════════

 [SENSOR NODE ESP32]
  - DEVICE_ID / SECRET_KEY hardcode trong config_1.h
  - NTP sync để lấy timestamp
  - Tính HMAC-SHA256(SECRET_KEY, "sensor_id:timestamp")
  - Publish JSON lên Broker 1

        │  [Kênh 1 - PLAINTEXT, anonymous]
        │  ⚠️ Không có TLS, không auth MQTT, không ACL
        │  Topic: local/sensors/<sensor_id>/data
        ▼

 [MQTT BROKER 1 – port 1883]
  - Eclipse Mosquitto 2, allow_anonymous true
  - Bất kỳ host nào trong mạng đều có thể kết nối, publish/subscribe
  - ⚠️ ĐIỂM YẾU: Không xác thực ở tầng MQTT

        │  Subscribe: local/sensors/+/data
        ▼

 [GATEWAY NODE ESP32]
  - GW_DEVICE_ID / GW_SECRET_KEY hardcode trong config_gw.h
  - ✅ BẢO VỆ #1: Xác thực sensor HMAC tại firmware (forwarder.cpp)
  - ✅ BẢO VỆ #2: Kiểm tra timestamp window ±300s
  - Tra cứu sensor secret từ registry (dynamic/static fallback)
  - Ký HMAC gateway bổ sung vào payload
  - Publish JSON wrapped lên Broker 2

        │  [Kênh 2 - PLAINTEXT, anonymous]
        │  ⚠️ Không có TLS, không auth MQTT, không ACL
        │  ⚠️ Attacker có secret key có thể bypass gateway và inject thẳng vào đây
        │  Topic: gateway/<gateway_id>/data
        ▼

 [MQTT BROKER 2 – port 1884]
  - Eclipse Mosquitto 2, allow_anonymous true
  - Bất kỳ host đến được port 1884 có thể publish gateway/+/data
  - ⚠️ ĐIỂM YẾU: Bypass hoàn toàn gateway firmware nếu có secret key

        │  Subscribe: gateway/+/data (mqttDataService.ts)
        ▼

 [BACKEND SERVER – Node.js/Express – port 5000]
  - ✅ BẢO VỆ #3: verifyGatewayHMAC() (hmacService.ts)
  - ✅ BẢO VỆ #4: verifyDeviceHMAC()  (hmacService.ts)
  - ✅ BẢO VỆ #5: Timestamp window ±300s
  - ✅ BẢO VỆ #6: timingSafeEqual() (chống timing attack)
  - ✅ BẢO VỆ #7: Kiểm tra status (active/blocked/inactive)
  - ✅ BẢO VỆ #8: Kiểm tra device_type (chống privilege escalation)
  - ✅ BẢO VỆ #9: Rate limiting 60 req/min per IP (app.ts)
  - Ghi audit_log cho mọi sự kiện bảo mật

        │  ✅ Parameterized SQL queries (không SQL injection)
        ▼

 [MySQL 8.0 Database – port 3308]
  - users.password_hash: bcrypt cost=12          ✅ Tốt
  - devices.secret_key:  plaintext hex            ⚠️ Rủi ro nếu DB bị lộ
  - sensor_data.payload: JSON không mã hóa        ⚠️ Lộ dữ liệu môi trường
  - audit_log: có thể bị xóa bởi admin           ⚠️ Không immutable

        ▲  Proxy: /api/* → backend (Nginx)
        │  ✅ BẢO VỆ #10: verifyJWT() + requireRole() (middleware)

 [NGINX – port 80]
  - Reverse proxy: /api/* → backend, / → frontend
  - ⚠️ HTTP only, chưa có HTTPS/TLS

        ▲
 [FRONTEND – Next.js – port 3000]
  - ✅ JWT HttpOnly Cookie + SameSite strict
  - ✅ usePermissions() hook ẩn/hiện UI theo role
  - Proxy route: /api/[...path]/route.ts → forward đến backend

══════════════════════════════════════════════════════════════════════════
```

### 2.2 Đánh Giá Từng Chặng

| Chặng | Giao thức | Xác thực tầng mạng | TLS | Xác thực tầng ứng dụng | Nguy cơ chính |
|---|---|---|---|---|---|
| Sensor → Broker 1 | MQTT | ❌ Anonymous | ❌ | HMAC trong payload | Nghe lén payload + HMAC |
| Broker 1 → Gateway | MQTT subscribe | ❌ Anonymous | ❌ | Gateway verify HMAC (firmware) | Bất kỳ ai publish fake sensor data |
| Gateway → Broker 2 | MQTT | ❌ Anonymous | ❌ | HMAC trong payload | Bypass gateway với secret key |
| Broker 2 → Backend | MQTT internal | ❌ Anonymous | ❌ (Docker internal) | Backend verify HMAC | Giới hạn hơn do Docker network |
| Backend → Database | TCP | User/pass | ❌ (Docker internal) | Parameterized queries | Giới hạn trong Docker network |
| Browser → Nginx → Backend | HTTP | Cookie JWT | ❌ Không HTTPS | verifyJWT + requireRole | MITM nếu deploy ra public internet |

---

## 3. Cơ Chế Xác Thực Thiết Bị Hoạt Động Như Thế Nào

### 3.1 Định Danh Thiết Bị

Mỗi thiết bị có cặp định danh:
- **Device ID**: Định danh công khai, format `ESP32-SN-XXXXXXXX` hoặc `ESP32-GW-XXXXXXXX`
- **Secret Key**: 64 ký tự hex (32 bytes random), HMAC key bí mật

### 3.2 Nơi Sinh Ra và Lưu Trữ

**Sinh ra:** [backend/src/routes/devices.ts:37-41](../backend/src/routes/devices.ts)
```typescript
const suffix     = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
const typeTag    = device_type === "sensor" ? "SN" : "GW";
const device_id  = `ESP32-${typeTag}-${suffix}`;            // ESP32-SN-CBF05770
const secret_key = crypto.randomBytes(32).toString("hex");  // 64 hex chars
```

**Lưu trữ tại DB:** `INSERT INTO devices (..., secret_key, ...)` — plaintext vì HMAC cần key gốc.

**Lưu trữ tại Firmware:** Operator copy thủ công vào `config_1.h` / `config_gw.h` sau khi đăng ký.

**Cấp phát:** Response API đăng ký trả về `secret_key` **một lần duy nhất** — comment trong code ghi rõ: `"Return credentials exactly once – secret_key is never returned again"`.

### 3.3 Flow Xác Thực Từng Bước

```
BƯỚC 1 – SENSOR NODE tạo chữ ký
─────────────────────────────────────────────────────────────────────────
File: firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp

  timestamp = getCurrentTimestamp()              // NTP Unix timestamp
  message   = "ESP32-SN-CBF05770:1718876543"
  sn_hmac   = HMAC-SHA256(SECRET_KEY, message)  // mbedTLS

  Publish JSON → Broker 1, topic: local/sensors/ESP32-SN-CBF05770/data
  {
    "sensor_id":    "ESP32-SN-CBF05770",
    "sn_timestamp": 1718876543,
    "sn_hmac":      "a3f8c2d1...64hex...",
    "sensor_ip":    "192.168.1.25",
    "data": { "temperature": 28.5, "humidity": 72.3 }
  }


BƯỚC 2 – GATEWAY xác thực sensor và ký lại
─────────────────────────────────────────────────────────────────────────
File: firmware/gateway-node/lib/forwarder/forwarder.cpp

  2a. Tra cứu secret của sensor_id trong sensor_registry:
      → Dynamic: từ GET /api/device/sensors (xác thực bằng GW HMAC, refresh mỗi 5 phút)
      → Static fallback: KNOWN_SENSORS[] trong config_gw.h

  2b. Kiểm tra timestamp:
      timeDiff = getCurrentTimestamp() - sn_timestamp
      IF timeDiff < -300 OR timeDiff > 300
        → Serial.println("[FWD] REJECT – timestamp out of window")
        → return false (packet bị drop, không forward)

  2c. Verify HMAC sensor:
      expected = HMAC-SHA256(sensorSecret, "sensor_id:sn_timestamp")
      safeEq64(expected, sn_hmac)   // constant-time compare (64 byte fixed)
      IF mismatch → REJECT

  2d. Ký HMAC gateway:
      gw_message   = "ESP32-GW-78867B14:1718876544"
      gw_hmac      = HMAC-SHA256(GW_SECRET_KEY, gw_message)

  2e. Publish lên Broker 2: gateway/ESP32-GW-78867B14/data
  {
    "gateway_id":   "ESP32-GW-78867B14",
    "gateway_ip":   "192.168.1.10",
    "gw_timestamp": 1718876544,
    "gw_hmac":      "d7e9a1b2...64hex...",
    "sensor_payload": { ...toàn bộ JSON sensor nguyên vẹn... }
  }


BƯỚC 3 – BACKEND xác thực hai lớp
─────────────────────────────────────────────────────────────────────────
File: backend/src/services/hmacService.ts
File: backend/src/middleware/validateDevice.ts
File: backend/src/services/mqttDataService.ts  (cho luồng MQTT)

  3a. verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac):
      → SELECT id, secret_key, status, fail_count FROM devices WHERE device_id = ?
      → IF không tìm thấy: return { ok: false, error: "NOT_FOUND" }
      → isTimestampValid(): |Date.now()/1000 - gw_timestamp| <= 300
      → expected = HMAC-SHA256(secret_key, "gateway_id:gw_timestamp").hex
      → crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(gw_hmac))
      → IF FAIL: log GATEWAY_AUTH_FAIL hoặc REPLAY_ATTACK; fail_count++
      → IF fail_count >= 5: status='blocked'; log DEVICE_BLOCKED

  3b. verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac):
      → Tương tự, query DB theo sensor_id
      → IF FAIL: log SENSOR_AUTH_FAIL; fail_count++

  3c. Kiểm tra device_type + status (data.routes.ts):
      → gwRow.device_type === "gateway"   // chống privilege escalation → log PRIVILEGE_ESCALATION
      → snRow.device_type === "sensor"
      → gwRow.status === "active"         // chặn inactive/blocked
      → snRow.status === "active"


BƯỚC 4 – Lưu dữ liệu và cập nhật trạng thái
─────────────────────────────────────────────────────────────────────────
  → INSERT INTO sensor_data (device_id, gateway_id, payload)
  → Giữ 150 bản ghi gần nhất (DELETE cũ hơn)
  → UPDATE devices SET last_seen=NOW(), fail_count=0, last_ip=?
  → logDataRecvWithPrune(): log DATA_RECV, giữ 150 bản/device
```

**Nếu xác thực sai → xử lý như sau:**

| Lỗi | HTTP Code | Log Event | Tăng fail_count | Auto-block |
|---|---|---|---|---|
| Thiếu trường | 400 | — | ❌ | ❌ |
| Device ID không tìm thấy | 401 | GATEWAY/SENSOR_AUTH_FAIL | ❌ (không có DB ID) | ❌ |
| Timestamp > ±300s | 401 | REPLAY_ATTACK | ✅ | Nếu ≥ 5 |
| HMAC không khớp | 401 | GATEWAY/SENSOR_AUTH_FAIL | ✅ | Nếu ≥ 5 |
| Status blocked | 403 | — | ❌ | — |
| Status inactive | 403 | — | ❌ | — |
| Device type sai | 403 | PRIVILEGE_ESCALATION | ❌ | ❌ |

---

## 4. Threat Model – Các Tấn Công Có Thể Xảy Ra

### A. Giả Mạo Thiết Bị (Device Spoofing)

**Kịch bản 1 – Dùng Device ID không đăng ký:**
```
Attacker publish với device_id = "ESP32-SN-FAKE0001"
→ fetchDevice("ESP32-SN-FAKE0001") → NULL
→ Return { ok: false, error: "NOT_FOUND" }
→ 401; fail_count không tăng (không có DB row)
```
**Đánh giá:** Chặn hiệu quả — thiết bị không có trong DB bị từ chối tức thì.

**Kịch bản 2 – Biết Device ID, không có secret key:**
```
Attacker biết "ESP32-SN-CBF05770" (từ MQTT sniff, Serial output, hay config file lộ)
Attacker đoán ngẫu nhiên sn_hmac (64 hex chars = 256-bit không gian)
→ Gửi sai HMAC: HMAC_MISMATCH, fail_count tăng mỗi lần
→ Sau 5 lần: status='blocked', log DEVICE_BLOCKED
```
**Đánh giá:** Không thể brute-force HMAC-256. Auto-block sau 5 lần gây bất tiện cho attacker.

**Kịch bản 3 – Biết cả Device ID lẫn secret key:**
```
Attacker dump firmware ESP32 qua JTAG → đọc config_1.h / config_gw.h
→ Có DEVICE_ID + SECRET_KEY
→ Tự tính HMAC hợp lệ cho payload tùy ý
→ Kết nối thẳng Broker 2 (anonymous), publish gateway/+/data
→ Backend verifyGatewayHMAC() → PASS; verifyDeviceHMAC() → PASS
→ Dữ liệu giả được lưu vào sensor_data nếu status='active'
```
**Đánh giá:** Không có lớp bảo vệ nào ngăn được kịch bản này. Đây là điểm yếu cốt lõi khi secret bị lộ.

---

### B. Lộ Token / Secret Key

**Nguồn rò rỉ tiềm năng trong code:**

1. **Firmware bị dump:** Secret key hardcode dưới dạng C string literal trong `config_1.h`/`config_gw.h` — plaintext trong ESP32 flash. JTAG hoặc esptool.py có thể extract firmware dump.

2. **Serial console:** `Serial.printf("  Device ID  : %s\n", DEVICE_ID)` in ra UART khi khởi động — bất kỳ ai có serial cable đọc được Device ID.

3. **Database bị truy cập:** `SELECT secret_key FROM devices` — lộ toàn bộ secret key của mọi thiết bị vì lưu plaintext (bắt buộc do thiết kế HMAC cần key gốc).

4. **Response API bị cache:** Secret key được trả về trong HTTP response `201 Created` khi đăng ký — nếu proxy hoặc browser cache response này thì secret bị lộ.

**Hậu quả nếu secret key bị lộ:**
```
Attacker có device_id + secret_key của gateway + sensor:
  1. Kết nối Broker 2 (port 1884, anonymous)
  2. Tính: gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "ESP32-GW-78867B14:<timestamp>")
  3. Tính: sn_hmac = HMAC-SHA256(SENSOR_SECRET, "ESP32-SN-CBF05770:<timestamp>")
  4. Publish payload với temperature=-50, humidity=0 (dữ liệu giả)
  5. Backend chấp nhận, lưu vào DB, Dashboard hiển thị sai

Tiếp tục cho đến khi:
  → Admin thủ công PATCH /api/devices/:id/status → status='blocked'
  Không có: rotate key tự động, phát hiện IP anomaly, alert tự động
```

**Cơ chế ứng phó hiện có:**
- ✅ Secret key chỉ trả về 1 lần khi đăng ký
- ✅ Admin/Operator có thể block thiết bị thủ công qua Dashboard
- ❌ Không có API rotate/regenerate secret key
- ❌ Không có phát hiện bất thường (nhiều IP khác nhau dùng cùng device ID)
- ❌ Không có revoke tức thì — phải thực hiện thủ công
- ❌ Secret key lưu plaintext trong DB

---

### C. Replay Attack

**Cơ chế phòng vệ hiện tại:**

File: [backend/src/services/hmacService.ts](../backend/src/services/hmacService.ts)
```typescript
const TIMESTAMP_WINDOW_SECONDS = 300;  // ±5 phút

function isTimestampValid(timestamp: number): boolean {
  return Math.abs(Date.now() / 1000 - timestamp) <= TIMESTAMP_WINDOW_SECONDS;
}
```

Tương tự tại firmware Gateway ([firmware/gateway-node/lib/forwarder/forwarder.cpp](../firmware/gateway-node/lib/forwarder/forwarder.cpp)):
```cpp
#define TIMESTAMP_WINDOW_SEC 300  // config_gw.h

long timeDiff = (long)now - (long)sn_timestamp;
if (timeDiff < -TIMESTAMP_WINDOW_SEC || timeDiff > TIMESTAMP_WINDOW_SEC) {
    Serial.printf("[FWD] └─ REJECT – timestamp out of window\n");
    return false;
}
```

**Kịch bản tấn công:**
```
T=0s:   Sensor publish packet hợp lệ
         { sn_timestamp: 1718876543, sn_hmac: "abc...", data: {temp:28.5} }
T=60s:  Attacker sniff được packet trên Broker 1 (MQTT plaintext, anonymous)
T=120s: Attacker replay packet cũ lên Broker 2:
         1718876543 vs now=1718876663 → diff=120s < 300s → TRONG CỬA SỔ
         → Backend chấp nhận → dữ liệu cũ được lưu lại
T=300s: Attacker replay lần nữa với diff=300s → vẫn trong cửa sổ
T=301s: diff=301s > 300s → TIMESTAMP_EXPIRED → log REPLAY_ATTACK → từ chối
```

**Điểm yếu cụ thể:**
- Cửa sổ 300 giây đủ rộng để replay nhiều lần
- Không có nonce hay sequence number — cùng một `(device_id, timestamp)` có thể được chấp nhận nhiều lần trong cửa sổ
- Backend không lưu danh sách timestamp đã xử lý để phát hiện trùng lặp

---

### D. Man-in-the-Middle Attack (MITM)

**Trạng thái TLS toàn hệ thống (từ docker-compose.yml và nginx.conf):**

| Kết nối | Giao thức | TLS |
|---|---|---|
| Sensor Node → Broker 1 | MQTT | ❌ Plaintext |
| Gateway Node → Broker 2 | MQTT | ❌ Plaintext |
| Browser → Nginx | HTTP | ❌ Không HTTPS |
| Nginx → Backend | HTTP (internal Docker) | ❌ Plaintext |
| Backend → MySQL | TCP (internal Docker) | ❌ Plaintext |

**Hậu quả:**

**Nghe lén MQTT (Broker 1/2):** Attacker đọc được `sensor_id`, `sn_hmac`, `sn_timestamp`, toàn bộ payload cảm biến. HMAC captured này có thể dùng để replay trong 300 giây.

**Sửa dữ liệu MQTT:** Attacker sửa `temperature: 28.5` thành `temperature: -999` trong packet đang transit → HMAC ban đầu được tính trên payload gốc → `HMAC_MISMATCH` tại Backend/Gateway → **HMAC bảo vệ tính toàn vẹn dữ liệu hiệu quả ngay cả khi không có TLS.**

**Nghe lén Dashboard HTTP:** Nếu deploy ra public internet (HTTP), JWT cookie truyền qua wire không mã hóa → attacker trong cùng mạng hoặc trên đường truyền có thể bắt cookie → chiếm session Dashboard.

---

### E. Unauthorized API Access

**Endpoint không cần xác thực:**

| API | Auth | Rủi ro |
|---|---|---|
| `GET /api/health` | ❌ Không auth | Lộ thông tin backend đang chạy |
| `POST /api/auth/login` | ❌ Không auth (public) | Rate limited 10 req/15min — brute force chậm |
| `POST /api/device/data` | HMAC thiết bị (không JWT) | Đã phân tích ở trên |
| `GET /api/device/sensors` | HMAC gateway (không JWT) | Trả secret sensor chỉ cho gateway xác thực |

**Kiểm tra leo thang đặc quyền:**

```
Viewer gọi DELETE /api/devices/:id:
→ verifyJWT()         → OK (token hợp lệ)
→ requireRole("admin") → user.role="viewer" → 403 FORBIDDEN

Không có JWT gọi GET /api/devices:
→ parseCookie(cookie, "token") → null
→ 401 NO_TOKEN

Frontend ẩn nút "Xóa" khi canDeleteDevice=false:
→ Nếu bypass UI và POST thẳng đến API
→ Backend vẫn trả 403 — Backend là tuyến phòng thủ thực sự
```

Middleware được chain nhất quán theo thứ tự: `verifyJWT` → `requireRole(...)` trong [devices.ts](../backend/src/routes/devices.ts), [users.ts](../backend/src/routes/users.ts), [audit.ts](../backend/src/routes/audit.ts).

---

### F. MQTT Topic Abuse

**Cấu hình thực tế của cả 2 broker:**
```
# mosquitto/broker1/mosquitto.conf  &  mosquitto/broker2/mosquitto.conf
allow_anonymous true   ← BẤT KỲ AI CŨNG CÓ THỂ KẾT NỐI
# Không có: password_file, acl_file
```

**Kịch bản 1 – Inject vào Broker 1:**
```
Attacker publish: local/sensors/ESP32-SN-REAL/data với HMAC giả
→ Gateway verify HMAC tại forwarder.cpp → FAIL → DROP
→ Không ảnh hưởng đến backend
```
Kết luận: Broker 1 injection bị chặn bởi Gateway firmware verification.

**Kịch bản 2 – Inject vào Broker 2 với secret key bị lộ:**
```
Attacker kết nối Broker 2 (port 1884), publish:
  topic: gateway/ESP32-GW-78867B14/data
  payload: { ...HMAC hợp lệ được tính từ secret key bị lộ... }
→ Backend mqttDataService xử lý
→ verifyGatewayHMAC() → PASS (HMAC đúng)
→ verifyDeviceHMAC()  → PASS (HMAC đúng)
→ status check → PASS (device active)
→ Dữ liệu giả lưu vào DB
```
Kết luận: **Đây là tấn công nghiêm trọng nhất nếu secret key bị lộ.**

**Kịch bản 3 – Nghe lén (Subscribe):**
```
Attacker subscribe "gateway/+/data" trên Broker 2
→ Đọc được mọi dữ liệu cảm biến và HMAC signature
→ HMAC có thể dùng cho replay trong 300 giây
→ Dữ liệu cảm biến (nhiệt độ, độ ẩm) bị lộ hoàn toàn
```

---

### G. Database Attack

**SQL Injection:** Toàn bộ backend dùng parameterized queries với `pool.execute(sql, [params])`. Không có string concatenation vào SQL. **SQL Injection được ngăn chặn hiệu quả.**

**Lộ dữ liệu nếu DB bị truy cập trực tiếp:**

| Bảng | Trường nhạy cảm | Bảo vệ hiện tại |
|---|---|---|
| `users` | `password_hash` | bcrypt cost=12 — khó crack offline |
| `devices` | `secret_key` **plaintext** | ❌ Không có mã hóa — lộ DB = lộ toàn bộ secret |
| `sensor_data` | `payload` JSON | ❌ Plaintext |
| `audit_log` | `ip_address`, `user_agent`, `details` | ❌ Plaintext |

**Tại sao secret_key không thể hash:** HMAC-SHA256 cần key gốc để tính toán — không thể dùng bcrypt hash. Đây là trade-off cố hữu của thiết kế HMAC. Giải pháp thay thế: mã hóa đối xứng AES-256 (encrypt trong DB, decrypt trước khi dùng), nhưng chưa được triển khai trong code hiện tại.

**Phân quyền DB:** Từ `.env.example`, chỉ dùng 1 user `iot_managerIoT` cho toàn bộ operations. Không có least-privilege separation (ví dụ: read-only user cho frontend, write user cho backend data ingestion).

---

### H. Audit Log Tampering

**API xóa audit log** — chỉ admin có quyền:

```typescript
// audit.ts
DELETE /api/audit-log/by-type?event_type=GATEWAY_AUTH_FAIL  // Xóa toàn bộ log 1 loại
DELETE /api/audit-log/bulk  { ids: [1,2,3,...] }              // Xóa nhiều log theo ID
DELETE /api/audit-log/data-recv                               // Xóa toàn bộ DATA_RECV
```

**Tự động prune DATA_RECV** ([backend/src/services/auditLogger.ts:39-55](../backend/src/services/auditLogger.ts)):
```typescript
// Giữ chỉ 150 bản ghi DATA_RECV gần nhất cho mỗi device
DELETE FROM audit_log WHERE event_type = 'DATA_RECV' AND device_id = ?
AND id NOT IN (SELECT id FROM (...) ORDER BY id DESC LIMIT 150)
```

**Kịch bản:**
```
1. Attacker brute-force HMAC → fail 4 lần → audit log ghi 4 GATEWAY_AUTH_FAIL
2. Admin account bị compromise (mật khẩu yếu hoặc JWT bị stolen)
3. Attacker dùng admin quyền gọi: DELETE /api/audit-log/by-type?event_type=GATEWAY_AUTH_FAIL
4. Toàn bộ bằng chứng tấn công bị xóa
5. Không truy vết được sự cố
```

**Điều hệ thống làm tốt:**
- Ghi log đầy đủ 9 loại sự kiện bảo mật
- Phân quyền xem log theo role (viewer chỉ thấy subset)
- Ghi kèm IP, user agent, details JSON

**Điểm yếu:**
- Không có immutable/append-only audit trail
- Admin có thể xóa mọi log
- Login/Logout tạo notification nhưng không tạo audit log riêng
- DATA_RECV bị prune tự động — lịch sử dữ liệu lâu dài bị ghi đè

---

## 5. Bảng Threat Model

| Mối đe dọa | Kịch bản tấn công | Tài sản bị ảnh hưởng | Cơ chế phòng vệ hiện tại | Mức độ rủi ro | Hạn chế còn tồn tại | Hướng cải tiến |
|---|---|---|---|---|---|---|
| **Giả mạo thiết bị** | Attacker dùng device_id không đăng ký hoặc đoán ngẫu nhiên | Device ID, API | fetchDevice → NOT_FOUND → 401; auto-block sau 5 HMAC fail | **Thấp** | Không có fail_count cho device NOT_FOUND; IP không bị block | Thêm IP-based rate limit cho xác thực fail |
| **Lộ secret key** | Dump firmware ESP32 → đọc config_1.h / config_gw.h → forge HMAC hợp lệ | Secret Key, sensor_data, audit_log | Secret chỉ trả về 1 lần; admin block thủ công | **Cao** | Không có rotate key API; không phát hiện IP anomaly; DB lưu plaintext | API rotate-key; mã hóa secret_key bằng AES trong DB; alert khi cùng device_id từ nhiều IP |
| **Replay attack** | Sniff MQTT packet hợp lệ → gửi lại trong cửa sổ 300s | sensor_data | Timestamp window ±300s → REPLAY_ATTACK log; auto-block | **Trung bình** | Cửa sổ 300s rộng; không có nonce; packet có thể replay nhiều lần trong cửa sổ | Thu hẹp window 60s; thêm nonce + Redis TTL để từ chối duplicate |
| **MITM – nghe lén MQTT** | Ở cùng mạng LAN, sniff MQTT plaintext traffic | Secret HMAC, sensor_data | HMAC bảo vệ tính toàn vẹn; cửa sổ timestamp giới hạn replay | **Cao** (đặc biệt khi deploy public) | Không có TLS cho MQTT; traffic hoàn toàn plaintext | TLS Mosquitto; mTLS cho thiết bị |
| **Gửi dữ liệu giả (có secret)** | Biết secret → tính HMAC hợp lệ → inject vào Broker 2 bypass gateway | sensor_data | Backend verify HMAC + type check + status check | **Cao (nếu có secret)** | Nếu secret bị lộ, không có lớp bảo vệ nào ngăn được | Rotate secret; phát hiện anomaly giá trị/tần suất/IP |
| **Gọi API trái phép** | Không có JWT gọi protected API; role thấp gọi admin API | API, users, devices, audit_log | verifyJWT → 401; requireRole → 403; rate limit | **Thấp** | API `/api/health` không auth (info disclosure nhỏ) | Thêm auth cho `/api/health` trong production |
| **Leo thang đặc quyền người dùng** | Operator gọi DELETE /api/users hoặc DELETE /api/audit-log | users, audit_log | requireRole("admin") → 403 trên toàn bộ user/audit delete API | **Thấp** | Thao tác admin không được ghi vào audit_log | Log mọi destructive action của admin vào audit_log |
| **Publish MQTT trái phép** | Kết nối Broker 2 không cần auth, publish gateway/+/data với HMAC giả | sensor_data | Backend HMAC verification vẫn chặn nếu không có secret | **Trung bình** | Brokers hoàn toàn anonymous; không có ACL; dễ spam | MQTT username/password + ACL file; restrict write theo topic |
| **Lộ dữ liệu DB** | MySQL credential bị lộ → SELECT secret_key FROM devices | secret_key (plaintext), sensor_data | bcrypt cho password; Docker network isolation | **Cao** | secret_key không thể hash với HMAC design; chỉ 1 DB user | Application-level AES encrypt cho secret_key; readonly replica user |
| **Xóa/sửa audit log** | Admin bị compromise → DELETE /api/audit-log/by-type | audit_log | Chỉ admin được xóa; filter theo role khi xem | **Trung bình** | Không có immutable log; DATA_RECV bị prune tự động; không có offsite backup | Ghi log ra external syslog/SIEM; append-only logging |

---

## 6. Phân Tích Điểm Yếu Khi Bị Lộ Thông Tin Xác Thực

### 6.1 Nếu Device Secret Key Bị Lộ

> *"Nếu Device Secret / Token bị lộ, attacker có thể giả danh thiết bị hợp lệ để gửi dữ liệu giả lên hệ thống. Nếu hệ thống chỉ kiểm tra Device ID và token tĩnh, attacker có thể tiếp tục gửi dữ liệu cho đến khi token bị thu hồi hoặc thiết bị bị disable. Nếu không có timestamp/nonce, attacker còn có thể thực hiện replay attack bằng cách gửi lại payload cũ."*

**Đánh giá theo code thực tế:**

**Secret có cố định không?**

Có — sinh một lần tại `devices.ts:41`, lưu tĩnh trong DB và firmware. Không có endpoint nào update hay tái sinh secret key.

**Có cơ chế thu hồi không?**

Gián tiếp — Admin/Operator gọi `PATCH /api/devices/:id/status` với `{ status: "blocked" }`. Sau đó:
```typescript
// data.routes.ts:57-58
if (gwRow.status === "blocked") {
  res.status(403).json({ error: "DEVICE_BLOCKED" });
}
```
Nhưng phải thực hiện thủ công, không có tự động phát hiện.

**Có cơ chế cấp lại key không?**

Chưa thấy triển khai trong source code — không có endpoint `POST /api/devices/:id/rotate-key` hay `POST /api/devices/:id/regenerate-secret`.

**Có kiểm tra timestamp không?**

Có — `TIMESTAMP_WINDOW_SECONDS = 300` trong [hmacService.ts](../backend/src/services/hmacService.ts) và `TIMESTAMP_WINDOW_SEC = 300` trong [config_gw.h](../firmware/gateway-node/include/config_gw.h). Firmware sensor cũng chỉ gửi khi `ntpIsSynced()` ([sensor-node/src/main.cpp:64](../firmware/sensor-node/src/main.cpp)).

**Có chống replay không?**

Có một phần — timestamp window từ chối packet quá 300 giây. Tuy nhiên trong cửa sổ 300 giây, cùng một `(sensor_id, timestamp)` tuple có thể được gửi và chấp nhận nhiều lần.

**Có ghi log khi xác thực sai không?**

Có và được triển khai nhất quán ở cả HTTP path ([validateDevice.ts:59-68](../backend/src/middleware/validateDevice.ts)) và MQTT path ([mqttDataService.ts:43-48](../backend/src/services/mqttDataService.ts)):
```typescript
await log("GATEWAY_AUTH_FAIL", deviceDbId, ip, userAgent, { gateway_id, reason: gwResult.error });
await log("REPLAY_ATTACK",     deviceDbId, ip, userAgent, { gateway_id, reason });
await log("DEVICE_BLOCKED",    deviceDbId, ip, userAgent, { fail_count });
```

**Điểm yếu:** Log ghi được, nhưng không có alert tự động; admin phải chủ động vào xem; không có phân tích pattern để phát hiện tấn công đang diễn ra.

### 6.2 Nếu JWT Admin Bị Lộ

JWT không có server-side session store — token hợp lệ trong 8 giờ kể từ khi phát. Logout chỉ clear cookie phía client, không invalidate token server-side. Nếu JWT cookie bị stolen qua HTTP sniff:
- Attacker có 8 giờ toàn quyền admin (tạo user, xóa device, xóa audit log, xem mọi secret)
- Không có cơ chế blacklist token trước hạn

---

## 7. Đánh Giá Cơ Chế Bảo Mật Hiện Tại

### 7.1 Phần Đã Làm Tốt

**HMAC-SHA256 two-layer authentication:** Gateway xác thực HMAC sensor trước khi forward; Backend xác thực cả HMAC gateway lẫn HMAC sensor. Thiết kế phù hợp với constraint IoT (không cần PKI/certificate phức tạp).

**Timing-safe comparison ở cả hai tầng:**
- Backend: `crypto.timingSafeEqual()` — [hmacService.ts:29-37](../backend/src/services/hmacService.ts)
- Firmware: `safeEq64()` constant-time loop — [forwarder.cpp:13-17](../firmware/gateway-node/lib/forwarder/forwarder.cpp)

Cả hai chống timing attack — attacker không thể đo thời gian để đoán từng byte HMAC đúng.

**Auto-block brute-force:** `BLOCK_THRESHOLD = 5`, áp dụng nhất quán ở cả HTTP và MQTT path. Khi block, `status='blocked'` trong DB → mọi request tiếp theo bị từ chối kể cả HMAC đúng.

**RBAC được enforce ở backend:** `verifyJWT` + `requireRole` được chain đúng trên mọi protected route — bypass UI không giúp gì cho attacker.

**Anti-timing attack trong login:**
```typescript
// Chạy bcrypt.compare dù user không tồn tại để tránh timing-based enumeration
const valid = user
  ? await bcrypt.compare(password, user.password_hash)
  : await bcrypt.compare(password, dummyHash).then(() => false);
```

**Parameterized SQL:** Không có string concatenation vào SQL — SQL injection không thể thực hiện.

**JWT trong HttpOnly + SameSite strict:** Cookie không accessible từ JavaScript (chống XSS đọc token); SameSite strict ngăn CSRF.

**Rate limiting 3 tầng:** Auth 10/15min, device data 60/min, API 100/15min — giảm hiệu quả brute-force và DoS.

**Helmet.js + CORS giới hạn origin:** XSS protection headers; CORS chỉ accept từ `FRONTEND_URL`.

**Body size limit 10kb:** `express.json({ limit: "10kb" })` — ngăn payload-based DoS.

**Audit logging 9 sự kiện bảo mật:** GATEWAY_AUTH_FAIL, SENSOR_AUTH_FAIL, REPLAY_ATTACK, PRIVILEGE_ESCALATION, DATA_RECV, DEVICE_REGISTER, DEVICE_BLOCKED, DEVICE_STATUS_CHANGE, DEVICE_DELETE.

**Dynamic sensor registry với HMAC auth:** Gateway lấy danh sách sensor active từ backend qua HMAC-authenticated HTTP request — không hardcode toàn bộ sensor và backend chỉ trả sensor có `status='active'`.

### 7.2 Phần Còn Ở Mức Cơ Bản

**MQTT brokers hoàn toàn anonymous:** `allow_anonymous true` ở cả Broker 1 và Broker 2; không có ACL. Tuyến bảo vệ duy nhất là HMAC verification trong payload.

**Không có TLS ở bất kỳ đâu:** MQTT plaintext, HTTP không có HTTPS. Dữ liệu cảm biến, HMAC signature, JWT cookie đều truyền không mã hóa.

**Secret key plaintext trong DB:** Bắt buộc về mặt thiết kế HMAC (cần key gốc). Nếu DB bị lộ, toàn bộ xác thực thiết bị bị phá vỡ.

**Secret key hardcode trong firmware:** Plaintext C string trong header file — firmware dump = secret key.

**Không có refresh token:** JWT cố định 8 giờ, không có server-side session store, không thể revoke trước hạn.

**Không có rotate secret key:** Khi nghi ngờ secret bị lộ, phải block thiết bị, đăng ký lại với ID mới, reflash firmware — quy trình thủ công và gián đoạn hoạt động.

**Replay trong cửa sổ 300 giây:** Không có nonce — packet hợp lệ có thể replay nhiều lần trong 5 phút.

**Audit log có thể bị xóa:** Không có immutable trail. DATA_RECV bị prune tự động về 150 bản.

### 7.3 Phần Nên Cải Tiến

| Ưu tiên | Cải tiến | Mô tả |
|---|---|---|
| 🔴 Cao | **TLS cho MQTT** | Mosquitto với cafile/certfile/keyfile; ESP32 dùng `WiFiClientSecure` |
| 🔴 Cao | **MQTT Auth + ACL** | `password_file` trong mosquitto.conf; ACL: thiết bị chỉ publish/subscribe topic của chính mình |
| 🔴 Cao | **HTTPS cho Dashboard** | Let's Encrypt hoặc self-signed CA; Nginx terminate TLS; bắt buộc nếu deploy ra internet |
| 🟡 Trung bình | **Rotate Secret Key API** | `POST /api/devices/:id/rotate-key` — sinh secret mới, trả về cho operator flash vào firmware |
| 🟡 Trung bình | **Refresh Token** | Access token 15 phút + refresh token 7 ngày lưu DB; cho phép revoke session server-side |
| 🟡 Trung bình | **Nonce Anti-Replay** | Lưu `(device_id, timestamp, hmac)` đã xử lý trong Redis với TTL 300s; từ chối duplicate |
| 🟡 Trung bình | **AES encrypt secret_key trong DB** | `AES-256-GCM(APP_ENCRYPTION_KEY, secret_key)` — DB bị dump không lộ secret key nguyên bản |
| 🟢 Thấp | **Phát hiện IP Anomaly** | Alert khi cùng `device_id` authenticate từ nhiều IP khác nhau trong thời gian ngắn |
| 🟢 Thấp | **Immutable Audit Log** | Forward log ra external syslog / S3 / Elasticsearch — không thể xóa qua DB |
| 🟢 Thấp | **Thu hẹp timestamp window** | Giảm từ 300s xuống 60s sau khi thêm nonce; yêu cầu NTP độ chính xác cao hơn |

---

## 8. Kết Luận

Hệ thống đã triển khai nền tảng bảo mật phù hợp với quy mô IoT prototype: xác thực HMAC-SHA256 hai lớp, timestamp anti-replay cơ bản, auto-block brute-force, RBAC đầy đủ và audit logging cho 9 loại sự kiện bảo mật. Đây là mức bảo mật vượt trội so với các hệ thống IoT đơn giản chỉ kiểm tra device ID tĩnh.

Ba điểm yếu có tính hệ thống cần giải quyết trước khi production:

1. **MQTT brokers anonymous** — Không có xác thực và ACL ở tầng transport. Mọi thiết bị trong mạng đều có thể kết nối và publish. Tuyến bảo vệ duy nhất là HMAC trong payload.

2. **Không có TLS** — Mọi traffic đều plaintext. HMAC bảo vệ tính toàn vẹn nhưng không bảo vệ tính bí mật. Không chấp nhận được nếu triển khai ra ngoài mạng LAN kiểm soát.

3. **Không có cơ chế rotate/revoke secret key** — Khi secret bị lộ, khả năng ứng phó duy nhất là block thủ công và reflash firmware. Trong môi trường thiết bị thực tế ở nhiều vị trí địa lý khác nhau, đây là điểm yếu vận hành nghiêm trọng.

---

*Báo cáo được phân tích từ source code thực tế trong workspace `e:/WorkSpace/managerDeviceIoT-RBAC`. Ngày phân tích: 2026-06-20.*
