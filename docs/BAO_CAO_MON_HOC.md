
## Mục lục

- [Chương 1. Tổng quan đề tài](#chương-1-tổng-quan-đề-tài)
- [Chương 2. Cơ sở lý thuyết](#chương-2-cơ-sở-lý-thuyết)
- [Chương 3. Phân tích, thiết kế và triển khai](#chương-3-phân-tích-thiết-kế-và-triển-khai)
- [Chương 4. Threat Model & Demo kiểm thử bảo mật](#chương-4-threat-model--demo-kiểm-thử-bảo-mật)
- [Chương 5. Kết luận và hướng phát triển](#chương-5-kết-luận-và-hướng-phát-triển)
- [Phụ lục](#phụ-lục)
- [Tài liệu tham khảo](#tài-liệu-tham-khảo)

---

# Chương 1. Tổng quan đề tài

## 1.1. Lý do chọn đề tài

Các hệ thống IoT hiện nay thường gồm nhiều thiết bị nhúng gửi dữ liệu liên tục về server. Nếu không có cơ chế quản lý danh tính thiết bị, xác thực dữ liệu và phân quyền truy cập, hệ thống có thể bị giả mạo thiết bị, gửi dữ liệu sai, replay request cũ hoặc truy cập trái phép API quản trị.

Đề tài **"Hệ thống quản lý thiết bị IoT và phân quyền truy cập"** được xây dựng nhằm mô phỏng một hệ thống IoT hoàn chỉnh gồm **IoT Device – Server – Database – Dashboard**, tập trung vào ba vấn đề chính:

- Quản lý danh tính thiết bị IoT.
- Xác thực thiết bị khi gửi dữ liệu.
- Kiểm soát quyền truy cập đối với người dùng và thiết bị.

## 1.2. Mục tiêu tổng quát

Xây dựng một hệ thống IoT **lấy bảo mật làm trọng tâm thiết kế (Security by Design)**, có khả năng đăng ký thiết bị, xác thực thiết bị khi gửi dữ liệu, kiểm soát thiết bị được phép truy cập và hiển thị trạng thái thiết bị trên dashboard. Hệ thống đảm bảo chỉ các thiết bị hợp lệ, đã đăng ký và có token/secret key đúng mới được phép gửi dữ liệu vào server.

## 1.3. Mục tiêu cụ thể

| # | Mục tiêu | Tiêu chí đánh giá |
|---|----------|-------------------|
| 1 | Xây dựng mô hình IoT đầy đủ | Sensor Node, Gateway Node, Backend Server, MySQL, Dashboard |
| 2 | Xác thực danh tính thiết bị | Mỗi thiết bị có `device_id` duy nhất và `secret_key` riêng |
| 3 | Đăng ký thiết bị | API đăng ký sensor/gateway, auto-generate `device_id` |
| 4 | Xác thực dữ liệu truyền | Mọi gói tin mang chữ ký HMAC-SHA256 |
| 5 | Chống replay attack | Timestamp validation ±300 giây |
| 6 | Kiểm soát quyền truy cập | RBAC 3 cấp (admin/operator/viewer) bằng JWT |
| 7 | Cơ chế tự phục hồi | Thiết bị tự block sau 5 lần xác thực thất bại |
| 8 | Audit trail | Mọi sự kiện bảo mật ghi log với IP, thời gian, chi tiết |
| 9 | Dashboard quản trị | Giao diện trực quan giám sát thiết bị, dữ liệu cảm biến |
| 10 | Threat Model | Xác định, phân tích và kiểm thử các kịch bản tấn công |

## 1.4. Phạm vi đề tài

```
Sensor ESP32 ──MQTT──► Broker 1 (:1883) ──MQTT──► Gateway ESP32 ──MQTT──► Broker 2 (:1884) ──MQTT──► Backend
(Sensor Node)          (Sensor↔Gateway)            (DOIT V1)               (Gateway→Backend)          (Express + MySQL)
                                                                                                            ◄── Nginx (:80) ──► Browser / Dashboard (Next.js)
```

## 1.5. Đối tượng sử dụng

| Đối tượng | Vai trò |
|-----------|---------|
| **Quản trị viên (`admin`)** | Toàn quyền: quản lý người dùng, thiết bị, audit log, xóa thiết bị |
| **Kỹ thuật viên (`operator`)** | Đăng ký, khóa/mở khóa, theo dõi thiết bị |
| **Người giám sát (`viewer`)** | Xem danh sách thiết bị, trạng thái, dữ liệu cảm biến (chỉ đọc) |
| **Thiết bị IoT** | Sensor/Gateway gửi dữ liệu cảm biến sau khi được xác thực |

---

# Chương 2. Cơ sở lý thuyết

## 2.1. Tổng quan IoT và các mối đe dọa bảo mật

### 2.1.1. Kiến trúc điển hình của hệ thống IoT

```
Tầng nhận thức (Perception Layer)  → Thiết bị cảm biến, actuator, thu thập dữ liệu vật lý
Tầng mạng (Network Layer)          → MQTT, CoAP, HTTP, WiFi/BLE truyền dữ liệu lên cloud
Tầng ứng dụng (Application Layer)  → Backend xử lý, lưu trữ, phân tích, dashboard hiển thị
```

### 2.1.2. Các mối đe dọa đặc thù của IoT

| Đặc điểm IoT | Hệ quả bảo mật |
|--------------|----------------|
| Thiết bị có tài nguyên giới hạn (CPU, RAM, flash) | Không thể dùng TLS đầy đủ trên mọi thiết bị giá rẻ |
| Thiết bị hoạt động không có người giám sát | Kẻ tấn công có thể can thiệp vật lý |
| Số lượng thiết bị lớn, phân tán | Khó quản lý key tập trung, dễ bị tấn công diện rộng |
| Giao tiếp qua mạng cục bộ (LAN) | Dữ liệu có thể bị sniff nếu mạng không mã hóa |
| Vòng đời thiết bị dài | Firmware cũ chứa lỗ hổng không được vá |

Các loại tấn công phổ biến: **Device Spoofing**, **Replay Attack**, **Man-in-the-Middle**, **Brute Force**, **Privilege Escalation**.

## 2.2. Giao thức MQTT và mô hình Pub/Sub

MQTT (Message Queuing Telemetry Transport) là giao thức messaging nhẹ, dựa trên mô hình **Publish/Subscribe**, thiết kế cho môi trường mạng không ổn định và thiết bị tài nguyên giới hạn: overhead nhỏ (header 2 bytes), hoạt động tốt trên băng thông thấp, có 3 mức QoS.

```
Publisher (Sensor Node)        Broker (Mosquitto)        Subscriber (Gateway)
        │── PUBLISH ─────────────►│                            │
        │  topic: local/sensors/  │──── DELIVER (wildcard) ───►│
        │  {sensor_id}/data       │                            │
        │  payload: {temp,humid,hmac}                          │
```

**Rủi ro bảo mật trong demo:** port 1883 không có TLS, broker cho phép anonymous access. **Biện pháp đối phó:** ký HMAC-SHA256 trên payload — dù bị sniff, kẻ tấn công không thể tạo payload hợp lệ mới hoặc sửa dữ liệu mà không bị phát hiện.

## 2.3. HMAC-SHA256 – Xác thực thông điệp

### 2.3.1. Nguyên lý

```
HMAC-SHA256(K, m) = H((K ⊕ opad) || H((K ⊕ ipad) || m))

K    = secret key (64 bytes, padding nếu ngắn hơn)
m    = message cần ký
H    = SHA-256 hash function
opad = 0x5c5c5c...   ipad = 0x363636...
||   = concatenation  ⊕ = XOR
```

Đầu ra: 256-bit (32 bytes), biểu diễn hex 64 ký tự.

### 2.3.2. Tính chất bảo mật

| Tính chất | Ý nghĩa |
|-----------|---------|
| Giả mạo không thể | Không có secret key → không thể tạo HMAC hợp lệ |
| Toàn vẹn dữ liệu | Thay đổi bất kỳ bit nào trong message → HMAC khác hoàn toàn |
| Chống rò rỉ key | Từ HMAC không thể suy ngược ra secret key |
| Deterministic | Cùng key + message luôn cho cùng HMAC |

### 2.3.3. Thiết kế message trong đề tài

```
message    = device_id + ":" + unix_timestamp
secret_key = "a3f9d2c1b4e8765..."  (64-char hex)
hmac       = HMAC-SHA256(secret_key, message)

Ví dụ:
  device_id = "ESP32-SN-A1B2C3D4"
  timestamp = 1749479198
  message   = "ESP32-SN-A1B2C3D4:1749479198"
  hmac      = "c4d8e2f1a9b3..."
```

**Lý do đưa timestamp vào message:** mỗi giây timestamp thay đổi → HMAC thay đổi → replay attack với cùng payload trở nên vô nghĩa sau khi cửa sổ thời gian đóng lại.

### 2.3.4. Thư viện sử dụng

- **Firmware (C++):** `mbedTLS` – thư viện crypto chuẩn, tích hợp sẵn trong ESP-IDF
- **Backend (Node.js):** module `crypto` built-in (wraps OpenSSL)

## 2.4. Timestamp và chống Replay Attack

### 2.4.1. Kịch bản tấn công

```
T=0    [Gateway]   POST /api/device/data  {hmac="abc...", timestamp=1000}   ✓ Hợp lệ
T=10s  [Attacker]  sniff → lưu lại payload
T=30s  [Attacker]  POST /api/device/data  {hmac="abc...", timestamp=1000}   ← Replay!
```

### 2.4.2. Phương pháp phòng chống: Timestamp Window

```
|T_server - T_device| ≤ W,   với W = 300 giây (5 phút)
```

Nếu timestamp cách thời điểm hiện tại quá 300 giây → từ chối với lỗi `TIMESTAMP_EXPIRED`.

**Đánh đổi (trade-off):** W nhỏ → bảo mật tốt hơn nhưng dễ bị từ chối do lệch đồng hồ; W lớn → dễ chịu hơn nhưng cửa sổ replay rộng hơn. **Hạn chế còn lại:** trong cửa sổ 300 giây, payload vẫn có thể bị replay — giải pháp hoàn chỉnh hơn là dùng nonce (số dùng một lần).

## 2.5. JWT và xác thực người dùng

### 2.5.1. Cấu trúc JWT

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9    ← Header (Base64URL)
.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbi...  ← Payload (Base64URL)
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV...  ← Signature (HS256)
```

**Payload của đề tài:**
```json
{ "id": 1, "username": "admin", "role": "admin", "iat": 1749479000, "exp": 1749507800 }
```

### 2.5.2. Lưu trữ JWT an toàn – httpOnly Cookie

| Phương pháp lưu trữ | Rủi ro |
|--------------------|--------|
| `localStorage` / `sessionStorage` | JavaScript đọc được → dễ bị XSS |
| **httpOnly Cookie** | **JavaScript không thể đọc → an toàn hơn trước XSS** |

```
Set-Cookie: token=<jwt>; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800
```

- `HttpOnly`: browser không cho JavaScript đọc cookie
- `SameSite=Strict`: không gửi cookie theo request cross-site → chống CSRF
- `Max-Age=28800`: hết hạn sau 8 giờ

## 2.6. RBAC – Role-Based Access Control

```
Người dùng ──gán──► Vai trò ──có──► Quyền hạn ──áp dụng vào──► Tài nguyên
```

| Vai trò | Quyền hạn | Trường hợp sử dụng |
|---------|-----------|---------------------|
| `admin` | Toàn quyền hệ thống | Kỹ sư hệ thống, quản trị viên |
| `operator` | Quản lý thiết bị, xem dữ liệu | Kỹ thuật viên vận hành |
| `viewer` | Chỉ đọc | Nhân viên giám sát, khách hàng |

**Nguyên tắc least privilege:** mỗi vai trò chỉ được cấp quyền tối thiểu cần thiết để thực hiện công việc.

## 2.7. Timing Attack và Constant-Time Comparison

### 2.7.1. Nguyên lý timing attack

So sánh chuỗi thông thường dừng vòng lặp khi gặp ký tự đầu tiên không khớp → thời gian thực thi tiết lộ thông tin:

```
compare("aaaa", "baaa") → dừng ở ký tự 1 → nhanh (0.5µs)
compare("aaaa", "aaab") → dừng ở ký tự 4 → chậm hơn (2µs)
```

### 2.7.2. Giải pháp: Constant-Time Comparison

```cpp
// Firmware (C++) – safeEq64()
bool safeEq64(const char* a, const char* b) {
    uint8_t diff = 0;
    for (int i = 0; i < 64; i++)
        diff |= (uint8_t)(a[i] ^ b[i]);  // LUÔN lặp đủ 64 lần
    return diff == 0;
}
```

```typescript
// Backend (Node.js) – crypto.timingSafeEqual()
import { timingSafeEqual, createHmac } from 'crypto';
const expected = Buffer.from(computedHmac, 'hex');
const received = Buffer.from(receivedHmac, 'hex');
const isValid = expected.length === received.length && timingSafeEqual(expected, received);
```

## 2.8. Audit Log

Audit log ghi lại các sự kiện quan trọng liên quan đến bảo mật: `DATA_RECV`, `DEVICE_REGISTER`, `DEVICE_DELETE`, `DEVICE_STATUS_CHANGE`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`. Audit log giúp truy vết sự cố, phát hiện hành vi bất thường và hỗ trợ trình bày threat model.

---

# Chương 3. Phân tích, thiết kế và triển khai

## 3.1. Chức năng của project

### 3.1.1. Ma trận quyền truy cập

| Chức năng | admin | operator | viewer |
|-----------|:-----:|:--------:|:------:|
| Xem danh sách / chi tiết thiết bị | ✅ | ✅ | ✅ |
| Đăng ký thiết bị mới | ✅ | ✅ | ❌ |
| Thay đổi trạng thái thiết bị (active/blocked) | ✅ | ✅ | ❌ |
| Xóa thiết bị | ✅ | ❌ | ❌ |
| Quản lý người dùng | ✅ | ❌ | ❌ |
| Xem audit log / dashboard stats | ✅ | ✅ | ✅ |
| Xoá DATA_RECV logs | ✅ | ✅ | ❌ |
| Reset mật khẩu người dùng | ✅ | ❌ | ❌ |

### 3.1.2. Bốn nhóm chức năng chính

**Nhóm 1 – Quản lý danh tính thiết bị:** đăng ký thiết bị mới (sensor/gateway) với auto-generate `device_id`; tạo và hiển thị `secret_key` một lần duy nhất; quản lý trạng thái `inactive → active → blocked`; xóa thiết bị (cascade).

**Nhóm 2 – Thu thập và xác thực dữ liệu cảm biến:** sensor node đọc nhiệt độ/độ ẩm và ký HMAC trên firmware; gateway node xác thực chữ ký sensor, ký lại và chuyển tiếp lên backend; backend xác thực 2 lớp HMAC (gateway + sensor) trước khi lưu; tự động block thiết bị sau 5 lần xác thực thất bại.

**Nhóm 3 – Dashboard quản trị:** thống kê tổng quan (tổng thiết bị, online, tổng điểm dữ liệu); danh sách thiết bị lọc theo trạng thái, online/offline; chi tiết thiết bị với biểu đồ nhiệt độ/độ ẩm; audit log tra cứu theo bộ lọc.

**Nhóm 4 – Quản lý người dùng và phân quyền:** đăng nhập/đăng xuất JWT httpOnly cookie; tạo/xóa tài khoản (operator/viewer); đổi mật khẩu; RBAC 3 cấp.

## 3.2. Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MẠNG NỘI BỘ (LAN)                                      │
│                                                                                            │
│  ┌─────────────┐   MQTT :1883   ┌──────────────────┐   MQTT :1884   ┌──────────────────┐  │
│  │ Sensor Node │  ────────────► │  MQTT Broker 1   │               │  MQTT Broker 2   │  │
│  │  ESP32 DOIT │  local/sensors │  Mosquitto :1883  │               │  Mosquitto :1884  │  │
│  │  V1 + DHT22 │  /{id}/data   │  (Sensor↔Gateway)│               │  (Gateway→Backend)│  │
│  └─────────────┘               └────────┬─────────┘               └────────┬─────────┘  │
│                                          │ subscribe                         │ subscribe   │
│                                          │ local/sensors/+/data              │ gateway/+/  │
│                                          ▼                                   │ data        │
│                                 ┌───────────────┐   MQTT publish             │             │
│                                 │ Gateway Node  │  ─────────────────────────►│             │
│                                 │  ESP32 DOIT   │  gateway/{gw_id}/data      │             │
│                                 │  DevKit V1    │                            ▼             │
│                                 │  Validate +   │                ┌──────────────────────┐  │
│                                 │  Re-sign HMAC │                │    Backend           │  │
│                                 └───────────────┘                │  Express.js :5000    │  │
│                                                                  └──────────┬───────────┘  │
│                                                                             │              │
│  ┌────────────────────┐   ┌────────────────────┐   ┌──────────────────────┘              │
│  │   MySQL 8.0        │   │   Frontend Next.js  │   │   Nginx (Port 80)                   │
│  │   Port: 3306       │◄──│   Port: 3000        │◄──│   /api/* → backend                 │
│  └────────────────────┘   └────────────────────┘   │   /*    → frontend                  │
│                                                     └─────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                                    ▲
                                                                    │ HTTP (Port 80)
                                                             ┌──────┴──────┐
                                                             │ Admin/Oper/ │
                                                             │   Viewer    │
                                                             └─────────────┘
```

### 3.2.1. Lý do dùng 2 MQTT Broker riêng biệt

| | Broker 1 (Port 1883) | Broker 2 (Port 1884) |
|---|---|---|
| **Vai trò** | Sensor ↔ Gateway | Gateway ↔ Backend |
| **Topic** | `local/sensors/{id}/data` | `gateway/{id}/data` |
| **Mục đích** | Cô lập mạng cảm biến nội bộ | Kênh tin cậy Gateway→Backend |
| **Lợi ích** | Hỏng Broker 1 không ảnh hưởng Backend | Dễ debug, phân tích riêng biệt |

**Quan trọng hơn:** nếu kẻ tấn công xâm nhập Broker 1, họ vẫn không thể giả mạo dữ liệu lên Backend vì phải vượt qua HMAC cấp Gateway trên Broker 2 — đây là nguyên tắc **defense in depth**.

**Vai trò Nginx (single entry point):** chỉ expose port 80 ra ngoài; frontend/backend cùng origin → loại bỏ CORS trong production; dễ bổ sung TLS/HTTPS, caching, rate limiting tại tầng proxy.

### 3.2.2. Luồng dữ liệu end-to-end

```
[ESP32 Sensor]                                                [Browser Dashboard]
     │                                                                ▲
     │ B1. Đọc DHT22 mỗi 5 giây                                       │ B15. SWR refresh ~10s
     │ B2. HMAC-SHA256(sensor_secret, "id:ts")                         │
     │ B3. MQTT Publish → Broker 1 (:1883)                             │
     ↓                                                                │
[MQTT Broker 1 — Mosquitto :1883]                                     │
     │ B4. Deliver message đến subscriber (wildcard topic)             │
     ↓                                                                │
[ESP32 Gateway]                                                       │
     │ B5. Whitelist check sensor_id                                   │
     │ B6. Timestamp window ±300s                                      │
     │ B7. Verify sensor HMAC (constant-time safeEq64)                 │
     │ B8. Re-sign với gateway HMAC                                    │
     │ B9. MQTT Publish → Broker 2 (:1884): gateway/{gw_id}/data       │
     ↓                                                                │
[MQTT Broker 2 — Mosquitto :1884]                                     │
     │ B10. Backend subscribe: gateway/+/data                          │
     ↓                                                                │
[Backend Express.js – mqttDataService.ts]                             │
     │ B11. Verify gateway HMAC (DB lookup)                            │
     │ B12. Verify sensor HMAC (DB lookup, độc lập với B7)             │
     │ B13. INSERT sensor_data (MySQL)                                 │
     │ B14. UPDATE devices.last_seen, fail_count = 0                   │
     │ B15. INSERT audit_log (event: DATA_RECV)                        │
     └──────────────────────── MySQL ──────────────────────────────► │
```

| Bước | Tác nhân | Hành động | Điều kiện chuyển bước |
|------|----------|-----------|----------------------|
| B1 | Sensor | Đọc DHT22 qua GPIO4 | Nếu NaN → bỏ qua, thử lại sau 5s |
| B2 | Sensor | Lấy NTP timestamp, tính `sn_hmac` | Chuỗi hex 64 ký tự |
| B3 | Sensor | Publish JSON lên `local/sensors/{id}/data` | LED nhấp nháy 200ms |
| B4 | Broker 1 | Chuyển tiếp đến subscriber wildcard | Không kiểm tra payload |
| B5 | Gateway | Tra sensor_id trong whitelist | Không có → return |
| B6 | Gateway | `\|now() − timestamp\| ≤ 300s` | Quá hạn → return |
| B7 | Gateway | Xác thực sn_hmac bằng safeEq64 | Sai → return |
| B8 | Gateway | Tính gw_hmac với timestamp MỚI | Độc lập hoàn toàn với ts sensor |
| B9 | Gateway | Publish lên `gateway/{gw_id}/data` | LED forward nhấp nháy |
| B10 | Broker 2 | Chuyển tiếp đến backend subscribe | — |
| B11–B12 | Backend | 2-layer HMAC verify độc lập | Sai → tăng fail_count, log |
| B13–B15 | Backend | INSERT + UPDATE + audit | Hoàn thành |

**Thời gian xử lý đo thực tế (môi trường Docker local):** toàn bộ chuỗi B1→B14 ước tính ~15ms.

## 3.3. Công nghệ sử dụng

| Lớp | Thành phần | Công nghệ | Phiên bản | Lý do lựa chọn |
|-----|------------|-----------|-----------|----------------|
| Backend | Runtime | Node.js | 20 LTS | Async I/O tốt cho MQTT + REST đồng thời |
| Backend | Framework | Express.js | 5.2.1 | Nhẹ, linh hoạt, phù hợp REST API |
| Backend | Ngôn ngữ | TypeScript | 5.x | Type safety, tránh runtime errors |
| Backend | DB Driver | mysql2 | 3.22.3 | Native async/await với prepared statements |
| Backend | Auth | jsonwebtoken | 9.0.3 | JWT HS256 cho session người dùng |
| Backend | Hash | bcrypt | 5.1.1 | bcrypt cost=12, chống brute-force |
| Backend | MQTT | mqtt.js | 5.15.1 | Stable client cho MQTT v3.1.1 và v5 |
| Backend | Security headers | helmet | 7.2.0 | CSP, XSS, Clickjacking protection |
| Backend | Rate limit | express-rate-limit | 7.5.1 | Chống brute-force và DoS |
| Backend | WebSocket | ws | 8.20.1 | WebSocket support |
| Database | DBMS | MySQL | 8.0 | Hỗ trợ JSON column, Foreign Key, Window Functions |
| Messaging | Broker | Mosquitto | 2.x | Nhẹ, production-proven, Docker-friendly |
| Frontend | Framework | Next.js | 16.2.5 | SSR/CSR hybrid, App Router |
| Frontend | UI | React | 19.2.4 | Component-based, Hooks API |
| Frontend | Styling | TailwindCSS | 4.x | Utility-first, không cần custom CSS |
| Frontend | Charts | Recharts | 3.8.1 | React-native charts, responsive |
| Frontend | Fetching | SWR | 2.4.1 | Cache, revalidation, stale-while-revalidate |
| Frontend | Realtime | socket.io-client | 4.8.3 | WebSocket cho live updates |
| Frontend | Icon | Lucide React | 1.16.0 | Icon system nhất quán |
| Firmware | MCU | ESP32 DOIT DevKit V1 | — | WiFi tích hợp, đủ RAM cho TLS |
| Firmware | Sensor | DHT22 | — | Đo nhiệt độ (−40~80°C) & độ ẩm (0~100%) |
| Firmware | Build | PlatformIO | — | Quản lý dependencies, multi-board |
| Firmware | Crypto | mbedTLS | — | HMAC-SHA256, tích hợp sẵn ESP-IDF |
| Infra | Reverse Proxy | Nginx | Alpine | Nhẹ, hỗ trợ WebSocket upgrade |
| Infra | Container | Docker Compose | 24.x | Đơn giản hóa triển khai 6 services |

## 3.4. Thiết kế database

**File schema:** `database/migrations/001_schema.sql` — Encoding UTF8MB4 Unicode

### 3.4.1. Sơ đồ Entity-Relationship

```
┌─────────────────┐         ┌────────────────────────┐
│     users       │         │       devices          │
├─────────────────┤         ├────────────────────────┤
│ PK id           │◄────────┤ FK created_by          │
│    username     │         │ PK id                  │
│    password_hash│         │    device_id (UNIQUE)  │
│    role (ENUM)  │         │    device_name         │
│    created_at   │         │    device_type (ENUM)  │
│    last_login   │         │    secret_key          │
└─────────────────┘         │    status (ENUM)       │
                            │    fail_count          │
                            │    last_seen           │
                            │    last_ip             │
                            │    location            │
                            └────────────┬───────────┘
                                         │
                    ┌────────────────────┼──────────────────────┐
                    │                    │                       │
                    ▼                    ▼                       ▼
         ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────┐
         │   sensor_data    │  │   audit_log     │  │  device_tokens  │
         ├──────────────────┤  ├─────────────────┤  ├─────────────────┤
         │ PK id (BIGINT)   │  │ PK id (BIGINT)  │  │ PK id           │
         │ FK device_id     │  │    event_type   │  │ FK device_id    │
         │ FK gateway_id    │  │ FK device_id    │  │    token_hash   │
         │    payload (JSON)│  │    ip_address   │  │    expires_at   │
         │    received_at   │  │    user_agent   │  │    is_revoked   │
         └──────────────────┘  │    details(JSON)│  └─────────────────┘
                               │    created_at   │
                               └─────────────────┘
                               (+ internal _migrations table)
```

### 3.4.2. SQL Schema đầy đủ

```sql
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,             -- bcrypt cost=12
  role          ENUM('admin','operator','viewer') DEFAULT 'viewer',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME NULL
);

CREATE TABLE devices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(64)  UNIQUE NOT NULL,        -- ESP32-{SN|GW}-{HEX8}
  device_name VARCHAR(128) NOT NULL,
  device_type ENUM('sensor','gateway') NOT NULL,
  secret_key  VARCHAR(64)  NOT NULL,                -- 32-byte hex
  status      ENUM('inactive','active','blocked') DEFAULT 'inactive',
  location    VARCHAR(255) NULL,
  fail_count  TINYINT UNSIGNED DEFAULT 0,           -- tự block sau 5 lần thất bại
  last_seen   DATETIME NULL,
  last_ip     VARCHAR(45) NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_device_id (device_id)
);

CREATE TABLE sensor_data (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   INT UNSIGNED NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  gateway_id  INT UNSIGNED NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  payload     JSON NOT NULL,            -- {"temperature":27.5,"humidity":65.3}
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_data_device_received (device_id, received_at DESC)
);

CREATE TABLE device_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id  INT UNSIGNED NOT NULL REFERENCES devices(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) DEFAULT 0
);

CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  device_id  INT UNSIGNED NULL REFERENCES devices(id) ON DELETE SET NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  details    JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_log_event_created (event_type, created_at DESC)
);
```

### 3.4.3. Vòng đời trạng thái thiết bị

```
   [Đăng ký] → inactive
       │
       │ Admin/Operator kích hoạt
       ▼
    active ────────────────────────► blocked
       │      5 lần xác thực thất bại    │
       │                                 │
       │ Admin vô hiệu hoá               │ Admin kích hoạt lại
       ▼                                 │
    inactive ◄───────────────────────────┘
```

`secret_key` chỉ hiển thị **một lần duy nhất** khi đăng ký, không thể lấy lại sau đó. `audit_log` giữ nguyên khi thiết bị bị xóa nhờ `ON DELETE SET NULL`.

### 3.4.4. Data Retention Policy

Sau mỗi INSERT, hệ thống chỉ giữ 150 bản ghi gần nhất mỗi sensor:

```sql
DELETE FROM sensor_data
WHERE device_id = ?
  AND id NOT IN (
    SELECT id FROM sensor_data
    WHERE device_id = ?
    ORDER BY received_at DESC
    LIMIT 150
  );
```

### 3.4.5. Chiến lược Migration (Idempotent)

```typescript
// backend/src/migrations/runner.ts
async function runMigrations(pool: Pool): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  for (const migration of migrations) {
    const [rows] = await pool.execute(
      'SELECT name FROM _migrations WHERE name = ?', [migration.name]
    );
    if ((rows as []).length === 0) {
      await migration.up(pool);
      await pool.execute('INSERT INTO _migrations (name) VALUES (?)', [migration.name]);
    }
  }
}
```

## 3.5. API Backend

**Base URL (qua Nginx):** `http://localhost` · **Direct (debug):** `http://localhost:5000`

### 3.5.1. Cấu trúc ứng dụng Express

```typescript
// app.ts - Khởi tạo middleware theo thứ tự
app.use(helmet());            // 1. Security headers
app.use(corsMiddleware);      // 2. CORS với credentials
app.use(express.json());      // 3. Parse JSON body
app.use(morgan('combined'));  // 4. HTTP logging
app.use(generalRateLimit);    // 5. Rate limit 100 req/15min

// Routes
app.use('/api/auth',       authLimiter,      authRouter);
app.use('/api/devices',    verifyJWT,        devicesRouter);
app.use('/api/users',      verifyJWT,        usersRouter);
app.use('/api/dashboard',  verifyJWT,        dashboardRouter);
app.use('/api/audit-log',  verifyJWT,        auditRouter);
app.use('/api/device',     deviceApiLimiter, deviceApiRouter);
app.get('/api/health',     healthCheck);
```

### 3.5.2. Bảng API Endpoints đầy đủ

| Module | Method/Endpoint | Vai trò / Xác thực | Mô tả |
|--------|-----------------|---------------------|-------|
| Auth | `POST /api/auth/login` | Không | Đăng nhập, trả JWT trong httpOnly cookie (8h). Rate limit 10/15min/IP |
| Auth | `POST /api/auth/logout` | JWT | Xóa cookie xác thực |
| Auth | `GET /api/auth/me` | JWT | Lấy thông tin user hiện tại |
| Devices | `POST /api/devices/register` | admin, operator | Đăng ký thiết bị mới, trả `secret_key` 1 lần |
| Devices | `GET /api/devices` | Tất cả | Danh sách thiết bị + trạng thái online (`last_seen ≤ 60s`) |
| Devices | `GET /api/devices/:id` | Tất cả | Chi tiết + 10 điểm dữ liệu gần nhất |
| Devices | `GET /api/devices/:id/data` | Tất cả | Lịch sử cảm biến (phân trang: page, limit) |
| Devices | `PATCH /api/devices/:id/status` | admin, operator | Đổi trạng thái: active / blocked / inactive |
| Devices | `DELETE /api/devices/:id` | admin | Xóa thiết bị (cascade sensor_data) |
| Data | `POST /api/device/data` | HMAC-SHA256 (2 lớp) | HTTP fallback. **Luồng chính qua MQTT**. Rate limit 60/phút/IP |
| Data | `GET /api/device/sensors` | Gateway HMAC | Gateway lấy danh sách sensor active + secret keys |
| Dashboard | `GET /api/dashboard/stats` | Tất cả | Thống kê tổng quan |
| Users | `GET /api/users` | admin | Danh sách users |
| Users | `POST /api/users` | admin | Tạo user (operator/viewer) |
| Users | `PATCH /api/users/:id/password` | admin | Reset mật khẩu |
| Users | `DELETE /api/users/:id` | admin | Xoá user |
| Audit | `GET /api/audit-log` | Tất cả | Tra cứu log (lọc + phân trang, limit 500) |
| Audit | `DELETE /api/audit-log/data-recv` | admin, operator | Xoá hàng loạt DATA_RECV |
| Health | `GET /api/health` | Không | `{ "status": "ok" }` |

**Request/Response mẫu:**

```json
// POST /api/auth/login
{ "username": "admin", "password": "admin123" }
// Response 200:
{ "user": { "id": 1, "username": "admin", "role": "admin" } }
// Set-Cookie: token=<JWT>; HttpOnly; Secure; SameSite=Strict; Max-Age=28800

// POST /api/devices/register
{ "device_id": "ESP32-SN-00A1B2C3", "device_name": "Cảm biến phòng A",
  "device_type": "sensor", "location": "Tầng 1" }
// Response 201:
{ "device": { "id": 7, "device_id": "ESP32-SN-00A1B2C3", ... },
  "secret_key": "a3f9d2e1b4c7..." }  ← CHỈ HIỂN THỊ MỘT LẦN DUY NHẤT

// GET /api/dashboard/stats
{ "total_gateway": 2, "online_gateway": 1,
  "total_sensor": 5,  "online_sensor": 3,
  "total_data_points": 12480 }
```

**Payload MQTT `gateway/{gw_id}/data`** (cũng là payload của HTTP fallback):
```json
{
  "gateway_id": "ESP32-GW-F1E2D3C4",
  "gw_timestamp": 1749479200,
  "gw_hmac": "3a7f9b2c...",
  "gateway_ip": "192.168.1.x",
  "sensor_payload": {
    "sensor_id": "ESP32-SN-A1B2C3D4",
    "sn_timestamp": 1749479198,
    "sn_hmac": "c4d8e2f1...",
    "sensor_ip": "192.168.1.x",
    "data": { "temperature": 27.5, "humidity": 65.3 }
  }
}
```

```
GET /api/audit-log?event_type=DEVICE_BLOCKED&device_id=3&from=2026-01-01&to=2026-06-30&limit=100
```

### 3.5.3. Rate Limiting

```typescript
// Đăng nhập: 10 req / 15 phút / IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút' }
});

// Device data API: 60 req / phút / IP
const deviceApiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

// API chung: 100 req / 15 phút / IP (bỏ qua /api/device/data)
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  skip: (req) => req.path.startsWith('/api/device/data')
});
```

## 3.6. Giải pháp thiết kế

### 3.6.1. Xác thực thiết bị – Dual-Layer HMAC

```
Lớp 1 – Sensor → Gateway:  HMAC₁ = HMAC-SHA256(sensor_secret, "sensor_id:timestamp")
Lớp 2 – Gateway → Backend: HMAC₂ = HMAC-SHA256(gateway_secret, "gateway_id:timestamp")

Backend xác thực cả HMAC₁ và HMAC₂ độc lập với nhau.
```

| Phương án | Ưu điểm | Nhược điểm |
|-----------|---------|------------|
| Gửi secret key thẳng | Đơn giản | Key bị lộ → giả mạo vĩnh viễn |
| HMAC một lớp (chỉ gateway) | Bảo vệ đường truyền gateway↔backend | Không xác thực danh tính sensor |
| **HMAC hai lớp (đề tài)** | **Xác thực cả sensor lẫn gateway** | **Cần lưu sensor key trên gateway** |
| mTLS (mutual TLS) | Rất mạnh | Phức tạp, tốn tài nguyên firmware |

**Sequence diagram đầy đủ:**

```
Sensor              Gateway                          Backend (validateDevice)
  │                    │                                       │
  │ sn_hmac = HMAC(sensor_secret, "sensor_id:ts1")              │
  │───── MQTT publish (sensor_id, ts1, sn_hmac, data) ─────────►│
  │                    │ verify sn_hmac (whitelist nội bộ)      │
  │                    │ gw_hmac = HMAC(gateway_secret,         │
  │                    │            "gateway_id:ts2")           │
  │                    │─── MQTT publish gateway/{gw_id}/data ─►│
  │                    │    {gw_id, ts2, gw_hmac, gateway_ip,   │
  │                    │     sensor_payload:{sensor_id, ts1,    │
  │                    │      sn_hmac, sensor_ip, data}}        │
  │                    │                            ▼ Backend (mqttDataService.ts)
  │                    │                           │ verify gw_hmac (DB lookup gateway_secret)
  │                    │                           │ verify sn_hmac (DB lookup sensor_secret)
  │                    │                           │ cả 2 hợp lệ → INSERT sensor_data
```

**Vì sao backend vẫn verify lại `sn_hmac` dù gateway đã verify?** Gateway có thể bị compromise. Việc backend xác thực độc lập cả hai lớp đảm bảo **no implicit trust** vào bất kỳ thiết bị trung gian nào — đúng nguyên tắc *defense in depth*.

### 3.6.2. Phân quyền – Middleware chain

```
Request
   │
   ├── verifyJWT()        → Kiểm tra cookie có JWT hợp lệ không?
   │       ↓ pass
   ├── rbac(['admin'])    → req.user.role có trong allowed roles không?
   │       ↓ pass
   └── handler()          → Xử lý nghiệp vụ
```

```typescript
// rbac.ts
export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      return res.status(403).json({
        error: `Không đủ quyền. Yêu cầu: ${roles.join(' hoặc ')}`
      });
    }
    next();
  };
}

// Sử dụng trong routes:
router.delete('/:id', requireRole('admin'), deleteDeviceHandler);
router.patch('/:id/status', requireRole('admin', 'operator'), updateStatusHandler);
```

### 3.6.3. Audit trail – Immutable log

```sql
-- audit_log không có endpoint DELETE
-- Khi device bị xóa: ON DELETE SET NULL → log vẫn tồn tại
device_id INT UNSIGNED NULL REFERENCES devices(id) ON DELETE SET NULL
```

### 3.6.4. One-time secret key reveal

```
Khi đăng ký thiết bị:
  1. Backend tạo secret_key = randomBytes(32).toString('hex')
  2. Lưu vào DB: devices.secret_key = secret_key
  3. Trả về trong response: { secret_key: "..." }

Sau request đó:
  - GET /api/devices/:id   → KHÔNG trả về secret_key
  - GET /api/devices       → KHÔNG trả về secret_key
  - Không có endpoint nào lấy lại secret_key
```

## 3.7. Middleware bảo mật backend

### 3.7.1. Pseudocode validateDevice (2 lớp đầy đủ)

```typescript
async function validateDevice(req, res, next) {
  // === LỚP 1: Xác thực Gateway ===
  const { gateway_id, gw_timestamp, gw_hmac } = req.body;
  const gateway = await db.query(
    'SELECT * FROM devices WHERE device_id = ? AND device_type = "gateway"', [gateway_id]
  );
  if (!gateway) return res.status(401).json({ error: 'Gateway not found' });
  if (gateway.status !== 'active') return res.status(403).json({ error: 'Gateway blocked' });
  if (Math.abs(Date.now()/1000 - gw_timestamp) > 300)
    return res.status(401).json({ error: 'Gateway timestamp expired' });

  const expectedGwHmac = computeHmac(gateway.secret_key, `${gateway_id}:${gw_timestamp}`);
  if (!timingSafeEqual(expectedGwHmac, gw_hmac)) {
    await incrementFailCount(gateway.id);
    await auditLog('GATEWAY_AUTH_FAIL', gateway.id, req.ip);
    return res.status(401).json({ error: 'Gateway HMAC invalid' });
  }

  // === LỚP 2: Xác thực Sensor (độc lập) ===
  const { sensor_id, sn_timestamp, sn_hmac } = req.body.sensor_payload;
  const sensor = await db.query(
    'SELECT * FROM devices WHERE device_id = ? AND device_type = "sensor"', [sensor_id]
  );
  if (!sensor) return res.status(401).json({ error: 'Sensor not found' });
  if (sensor.status !== 'active') return res.status(403).json({ error: 'Sensor blocked' });
  if (Math.abs(Date.now()/1000 - sn_timestamp) > 300)
    return res.status(401).json({ error: 'Sensor timestamp expired' });

  const expectedSnHmac = computeHmac(sensor.secret_key, `${sensor_id}:${sn_timestamp}`);
  if (!timingSafeEqual(expectedSnHmac, sn_hmac)) {
    await incrementFailCount(sensor.id);
    await auditLog('SENSOR_AUTH_FAIL', sensor.id, req.ip);
    return res.status(401).json({ error: 'Sensor HMAC invalid' });
  }

  req.deviceContext = { gateway, sensor };
  next();
}
```

### 3.7.2. Cơ chế tự block

```typescript
async function incrementFailCount(deviceId: number) {
  await db.execute('UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?', [deviceId]);
  const [[device]] = await db.execute('SELECT fail_count FROM devices WHERE id = ?', [deviceId]);
  if (device.fail_count >= 5) {
    await db.execute("UPDATE devices SET status = 'blocked' WHERE id = ?", [deviceId]);
    await auditLog('DEVICE_BLOCKED', deviceId, null);
  }
}
```

Để mở khóa: admin/operator gọi `PATCH /api/devices/:id/status` với `{ "status": "active" }`.

### 3.7.3. JWT Middleware

```typescript
// verifyJWT.ts
export function verifyJWT(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}
```

## 3.8. Bảo mật bổ sung tầng ứng dụng / hạ tầng

| Tính năng | Cấu hình | Ý nghĩa |
|-----------|----------|---------|
| Rate limiting | 10/15min login, 60/phút device data, 100/15min API khác | Làm chậm brute-force, DoS |
| Helmet.js | CSP, X-Content-Type-Options, X-Frame-Options, HSTS | Chặn injection/clickjacking |
| `client_max_body_size 10M` (Nginx) | nginx.conf | Chặn request body quá lớn |
| `proxy_read_timeout 60s` | nginx.conf | Tránh slow-loris, fail-fast nếu backend treo |
| Header forwarding `X-Real-IP` | nginx.conf | Rate limit đúng IP thực của client |
| Parameterized queries (mysql2) | toàn backend | Chống SQL Injection |
| `ON DELETE SET NULL` | schema | Audit log không mất khi xóa thiết bị |

**Helmet HTTP Security Headers:**

| Header | Giá trị | Mục đích |
|--------|---------|---------|
| `X-Content-Type-Options` | `nosniff` | Chặn MIME sniffing |
| `X-Frame-Options` | `DENY` | Chặn Clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Bật XSS filter trình duyệt |
| `Strict-Transport-Security` | `max-age=31536000` | Bắt buộc HTTPS |
| `Content-Security-Policy` | Cấu hình theo ứng dụng | Chặn inline scripts, XSS |

**SQL Injection Prevention:**
```typescript
// ✅ ĐÚNG - Parameterized query
const [rows] = await pool.execute(
  'SELECT * FROM devices WHERE device_id = ? AND status = ?',
  [deviceId, 'active']
);
// ❌ SAI - String concatenation (không bao giờ dùng)
// `SELECT * FROM devices WHERE device_id = '${deviceId}'`
```

**Nginx config tóm tắt:**
```nginx
upstream backend  { server backend:5000; }
upstream frontend { server frontend:3000; }

server {
    listen 80;
    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket / HMR
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
```

## 3.9. Firmware thiết bị nhúng

### 3.9.1. Sensor Node – ESP32 DOIT V1

**Phần cứng:** ESP32 DOIT DevKit V1 (30 chân), dual-core Xtensa LX6 @240MHz; DHT22 (AM2302) – nhiệt độ ±0.5°C, độ ẩm ±2–5%RH; GPIO4 (DHT data), GPIO2 (LED gửi), GPIO0 (LED WiFi).

**Luồng `setup()`:**
```
Serial.begin(115200)
  ├─ WiFi.begin(SSID, PASS) → retry 20 lần (500ms/lần), LED_WIFI nhấp nháy
  ├─ NTP sync: configTime(UTC+7, "pool.ntp.org") → retry đến khi epoch > 1700000000
  ├─ dht.begin()
  └─ mqttClient.connect(MQTT_HOST, MQTT_PORT)
```

**Luồng `loop()` [chạy lại mỗi `SEND_INTERVAL` = 5000ms]:**
```
1. maintainWiFi()       → nếu WiFi.status() != WL_CONNECTED: reconnect
2. maintainMQTT()       → nếu !mqttClient.connected(): reconnect
3. float temp = dht.readTemperature()
   float humi = dht.readHumidity()
      └─ Nếu isnan(temp) || isnan(humi) → bỏ qua, chờ vòng kế tiếp
4. time_t now = time(nullptr)
5. computeHMAC(SECRET_KEY, DEVICE_ID + ":" + now) → hmac[65]
6. snprintf(payload, ...) → dựng JSON
7. mqttClient.publish("local/sensors/" + DEVICE_ID + "/data", payload)
      └─ Thành công → LED_SEND nhấp nháy 200ms
```

**JSON Payload:**
```json
{
  "sensor_id": "ESP32-SN-A1B2C3D4",
  "sn_timestamp": 1749479198,
  "sn_hmac": "c4d8e2f1...",
  "sensor_ip": "192.168.1.101",
  "data": { "temperature": 27.5, "humidity": 65.3 }
}
```

**Cấu hình `config_1.h`:**
```cpp
#define DEVICE_ID     "ESP32-SN-00A1B2C3"
#define SECRET_KEY    "a3f9d2e1b4c7f8a2..."  // 32-byte hex key
#define WIFI_SSID     "MyNetwork"
#define WIFI_PASS     "MyPassword"
#define MQTT_HOST     "192.168.1.100"
#define MQTT_PORT     1883
#define READ_INTERVAL 5000  // ms
```

### 3.9.2. Gateway Node – ESP32 DOIT DevKit V1

**Phần cứng:** ESP32 DOIT DevKit V1 (ESP32-WROOM-32), dual-core @240MHz — đóng vai trò security validator và MQTT forwarder. Không có cảm biến; có LED WiFi và LED forward.

**Luồng khởi động:** kết nối WiFi → đồng bộ NTP → kết nối Broker 1 :1883 (`subscribe("local/sensors/+/data")`) → kết nối Broker 2 :1884 (publish channel). Gateway duy trì **2 MQTT clients** song song.

**Luồng xử lý mỗi message `onMqttMessage()`:**
```
[1] Parse JSON: sensor_id, timestamp, hmac, temperature, humidity
      └─ Parse lỗi → LOG("Invalid JSON"), return

[2] Whitelist check: tìm sensor_id trong KNOWN_SENSORS[]
      └─ Không có → LOG("Unknown sensor"), return

[3] Timestamp window: |time(nullptr) − timestamp| ≤ 300s
      └─ Quá hạn → LOG("Timestamp expired"), return

[4] Verify sensor HMAC:
      expected = HMAC-SHA256(sensor_secret, "sensor_id:timestamp")
      safeEq64(expected, received_hmac)   ← constant-time
      └─ Sai → LOG("HMAC mismatch"), return

[5] Tính gateway HMAC:
      gw_timestamp = time(nullptr)        ← timestamp MỚI
      gw_hmac = HMAC-SHA256(GATEWAY_SECRET, "gateway_id:gw_timestamp")

[6] Build payload JSON (outer + sensor_payload lồng bên trong)

[7] MQTT publish lên topic "gateway/<GW_DEVICE_ID>/data" → Broker 2 :1884
      └─ Publish OK → LED_FWD nhấp nháy
```

**Cấu hình `config_gw.h`:**
```cpp
struct SensorCredential { const char* sensor_id; const char* secret_key; };
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-11223344", "aabbccdd..." },
    { "ESP32-SN-AABBCCDD", "11223344..." },
};
#define GATEWAY_ID         "ESP32-GW-FF001122"
#define GATEWAY_SECRET_KEY "b5e8f3a2c9d1..."
#define BROKER1_HOST       "192.168.1.100"
#define BROKER1_PORT       1883
#define BROKER2_HOST       "192.168.1.100"
#define BROKER2_PORT       1884
```

### 3.9.3. So sánh 2 loại firmware

| Đặc điểm | Sensor Node | Gateway Node |
|-----------|-------------|--------------|
| Số MQTT client | 1 (publish) | 2 (subscribe + publish) |
| Xác thực | Ký HMAC outgoing | Xác thực inbound + ký outgoing |
| NTP | Cần (để có timestamp) | Cần (để có timestamp riêng) |
| Whitelist | Không | Có (mảng static trong firmware) |
| RAM cần thiết | ~50 KB | ~150 KB (2 clients + whitelist) |
| LED | WiFi + Send | WiFi + Forward |

## 3.10. Frontend Dashboard

**Stack:** Next.js 16 (App Router) + React 19 + TailwindCSS 4 + SWR + Recharts + next-themes.

### 3.10.1. Cấu trúc routing (App Router)

```
src/app/
├── (auth)/
│   └── login/page.tsx          ← Trang đăng nhập public
└── (private)/
    ├── layout.tsx               ← Protected layout: JWT guard + navigation
    ├── dashboard/page.tsx       ← Tổng quan thống kê
    ├── devices/
    │   ├── page.tsx             ← Danh sách thiết bị
    │   └── [id]/page.tsx        ← Chi tiết + biểu đồ + lịch sử
    ├── users/page.tsx           ← Quản lý users (admin only)
    └── audit-log/page.tsx       ← Nhật ký sự kiện
```

### 3.10.2. Luồng xác thực Frontend chi tiết

```
[1] Người dùng mở /login → form nhập username + password → submit
      ├─ POST /api/auth/login  (credentials: 'include')
      │     ├─ 200 OK → Set-Cookie: token=<jwt>; HttpOnly; SameSite=Strict
      │     │           router.push('/dashboard')
      │     └─ 401   → Hiển thị lỗi chung "Sai tên đăng nhập hoặc mật khẩu"

[2] Truy cập bất kỳ route (private)/*
      ├─ GET /api/auth/me  (browser tự gửi cookie httpOnly)
      │     ├─ 200 OK → setUser(user), render trang con
      │     └─ 401   → router.push('/login')

[3] Mọi API call tiếp theo
      ├─ fetch(url, { credentials: 'include' }) → cookie tự động gửi kèm
      └─ Cùng origin qua Nginx → KHÔNG cần CORS

[4] Đăng xuất
      ├─ POST /api/auth/logout → Backend xóa cookie
      └─ Clear AuthContext state → router.push('/login')
```

Frontend không bao giờ đọc trực tiếp giá trị JWT — toàn bộ vòng đời cookie do browser quản lý.

### 3.10.3. Mô tả các trang chính

**Dashboard:** 4 thẻ thống kê (Tổng Gateway, Gateway online, Tổng Sensor, Sensor online), tổng data points, SWR auto-refresh 30 giây.

**Danh sách thiết bị:** bảng với badge màu trạng thái (xanh: active+online, vàng: active+offline, đỏ: blocked, xám: inactive); modal đăng ký (Admin/Operator); SWR refresh 10 giây.

**Chi tiết thiết bị:** biểu đồ đường Recharts nhiệt độ/độ ẩm; bảng 10 bản ghi gần nhất; nút đổi trạng thái (Admin/Operator); nút xoá (Admin).

**Quản lý Users (admin only):** CRUD users với validation; route guard redirect nếu không phải Admin.

**Audit Log:** bảng log color-coded theo event_type; filter theo event_type, device_id, khoảng thời gian; nút xoá DATA_RECV hàng loạt.

```typescript
// Protected route guard
export default async function PrivateLayout({ children }) {
  const user = await getCurrentUser(); // GET /api/auth/me
  if (!user) redirect('/login');
  return (
    <AuthContext.Provider value={{ user }}>
      <Navigation user={user} />
      <main>{children}</main>
    </AuthContext.Provider>
  );
}
```

## 3.11. Hạ tầng triển khai – Docker Compose

```yaml
# docker-compose.yml – 6 services
services:
  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_DATABASE: iot_managerDeviceIoT
      MYSQL_USER: iot_managerIoT
      MYSQL_PASSWORD: iot_managerIoTpassword
    volumes: [mysql_data:/var/lib/mysql]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  mqtt-broker-1:
    image: eclipse-mosquitto:2
    ports: ["1883:1883"]
    volumes: [./mosquitto/broker1:/mosquitto/config]

  mqtt-broker-2:
    image: eclipse-mosquitto:2
    ports: ["1884:1883"]
    volumes: [./mosquitto/broker2:/mosquitto/config]

  backend:
    build: ./backend
    ports: ["5000:5000"]
    environment: { DB_HOST: mysql, MQTT_HOST: mqtt-broker-2, MQTT_PORT: 1883 }
    depends_on:
      mysql: { condition: service_healthy }
      mqtt-broker-2: { condition: service_started }

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    depends_on: [backend, frontend]
    volumes: [./nginx/nginx.conf:/etc/nginx/nginx.conf]
```

| URL | Mô tả |
|-----|-------|
| `http://localhost` | Dashboard qua Nginx (chính thức) |
| `http://localhost/api/health` | Health check qua Nginx |
| `http://localhost:5000` / `:3000` | Backend / Frontend trực tiếp (debug) |

**Biến môi trường Backend (`backend/.env`):**
```env
PORT=5000
DB_HOST=mysql              # Docker: "mysql" | Local: "localhost"
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=<chuỗi ngẫu nhiên ≥32 ký tự>
MQTT_HOST=mqtt-broker-2    # Docker: "mqtt-broker-2" | Local: "localhost"
MQTT_PORT=1883             # Docker: 1883 | Local: 1884
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## 3.12. Phương pháp & quy trình thực hiện

| Giai đoạn | Nội dung | Công cụ | Đầu ra |
|-----------|----------|---------|--------|
| 1. Phân tích yêu cầu | Xác định yêu cầu chức năng + phi chức năng | Phân tích đề bài | Danh sách mục tiêu (mục 1.3) |
| 2. Thiết kế database | Vẽ ERD, 5 bảng, quan hệ khóa ngoại | MySQL Workbench | `001_schema.sql` |
| 3. Backend core | Express app, middleware, route `/api/auth`, `/api/devices` | TypeScript + Express, Postman | Backend chạy `npm run dev` |
| 4. Cơ chế bảo mật | `verifyJWT`, `rbac`, `validateDevice`, `hmacService.ts` | module `crypto`, bcrypt, jsonwebtoken | Middleware bảo mật hoàn chỉnh |
| 5. Firmware sensor | wifi_manager, ntp_sync, DHT22, HMAC, MQTT publish | PlatformIO, MQTT Explorer | Sensor flash được lên ESP32 |
| 6. Firmware gateway | MQTT dual client, whitelist, verify+re-sign | PlatformIO, giả lập qua MQTT Explorer | Gateway forward đúng |
| 7. Dashboard | Next.js App Router, AuthContext, biểu đồ Recharts, SWR | Next.js 16 + React 19 | Dashboard đầy đủ chức năng |
| 8. Container hóa | Dockerfile, docker-compose.yml, nginx.conf | Docker Compose | 1 lệnh khởi động toàn bộ |
| 9. Kiểm thử | Chức năng + bảo mật (Threat Model Ch.4) | Postman, MQTT Explorer | Bảng kết quả (mục 3.13, 4.5) |

**Nguyên tắc:** kiểm thử ngay sau mỗi giai đoạn — không dồn kiểm thử về cuối.

## 3.13. Kết quả đạt được

| # | Chức năng | Kết quả | Ghi chú |
|---|-----------|:-------:|---------|
| 1 | Đăng nhập JWT + httpOnly cookie | ✅ Đạt | Cookie không đọc được bằng JavaScript |
| 2 | RBAC 3 cấp admin/operator/viewer | ✅ Đạt | Viewer không thể đăng ký/xóa thiết bị |
| 3 | Đăng ký thiết bị, auto-generate `device_id` | ✅ Đạt | Format `ESP32-{SN\|GW}-{HEX8}` |
| 4 | Secret key one-time reveal | ✅ Đạt | Không có API lấy lại key |
| 5 | HMAC-SHA256 ký payload tại firmware | ✅ Đạt | mbedTLS, constant-time compare |
| 6 | Gateway whitelist + timestamp validation | ✅ Đạt | Chặn replay cũ hơn 300s |
| 7 | Backend xác thực 2 lớp HMAC | ✅ Đạt | `validateDevice` middleware |
| 8 | Auto-block sau 5 lần thất bại | ✅ Đạt | `fail_count`, log `DEVICE_BLOCKED` |
| 9 | Lưu dữ liệu, cập nhật `last_seen` | ✅ Đạt | `sensor_data` + `devices` |
| 10 | Dashboard thống kê + biểu đồ Recharts | ✅ Đạt | Online count, LineChart nhiệt độ/độ ẩm |
| 11 | Audit log tra cứu sự kiện bảo mật | ✅ Đạt | Filter theo `event_type`, `device_id` |
| 12 | Nginx reverse proxy single entry point | ✅ Đạt | Port 80, CORS-free |
| 13 | Docker Compose 6 services (2 MQTT broker) | ✅ Đạt | One-command deployment |
| 14 | Rate limiting + Helmet headers | ✅ Đạt | express-rate-limit, CSP/HSTS |
| 15 | Parameterized SQL queries | ✅ Đạt | mysql2/promise prepared statements |

**Hiệu suất đo trong môi trường local Docker:**

| Metric | Giá trị |
|--------|---------|
| Thời gian xử lý 1 request data (end-to-end) | ~15ms |
| Độ trễ MQTT Sensor → Dashboard | ~200–500ms |
| Throughput tối đa `/api/device/data` | 60 req/phút (rate limit) |
| Dung lượng dữ liệu mỗi thiết bị | ~3.5 MB/tháng (5s interval) |
| Thời gian khởi động `docker compose up` | ~25 giây |
| bcrypt hash time (cost=12) | ~250ms → ≤4 hash/giây brute-force |
| Kích thước Docker image backend | ~350 MB |
| Kích thước Docker image frontend | ~400 MB |

---

# Chương 4. Threat Model & Demo kiểm thử bảo mật

## 4.1. Tài sản cần bảo vệ (Assets)

| Tài sản | Mức độ nhạy cảm | Hậu quả nếu bị xâm phạm |
|---------|----------------|--------------------------|
| Mật khẩu người dùng | Cao | Chiếm tài khoản admin → toàn quyền hệ thống |
| Device Secret Key | Cao | Giả mạo thiết bị → gửi dữ liệu giả |
| JWT Token | Trung bình | Truy cập trái phép trong 8 giờ |
| Dữ liệu cảm biến | Trung bình | Sai lệch thông tin môi trường |
| Audit Log | Trung bình | Xóa bằng chứng tấn công |

## 4.2. Mục tiêu demo

- Thiết bị hợp lệ gửi dữ liệu thành công; thiết bị chưa đăng ký / sai token bị từ chối.
- Replay attack bị từ chối; thiết bị brute-force HMAC bị tự động khóa.
- User không đủ quyền không truy cập được API quản trị.
- Dashboard hiển thị đúng danh sách thiết bị và trạng thái online/offline.

**Khởi động:** `docker compose up -d --build`, kiểm tra 6 service đều `running`/`healthy`. Truy cập `http://localhost`, `http://localhost/api/health`.

## 4.3. Các kịch bản tấn công, kết quả kiểm thử và biện pháp phòng thủ

### 4.3.1. Brute-Force Login

**Mô tả:** kẻ tấn công thử nhiều mật khẩu để đăng nhập.

**Biện pháp:** rate limit 10 request/15 phút/IP; bcrypt cost=12 (~250ms/hash → tối đa ~4 hash/giây); thông báo lỗi chung (không tiết lộ username có tồn tại hay không).

**Điểm còn thiếu:** chưa có CAPTCHA, chưa lockout theo username.

### 4.3.2. Device Spoofing (giả mạo thiết bị)

**Demo – HMAC sai:**
```json
// POST /api/device/data với gw_hmac sai
{ "error": "GATEWAY_AUTH_FAIL", "reason": "HMAC_MISMATCH" }
// HTTP 401 — fail_count +1, audit log ghi nhận device_id + ip_address
```

**Biện pháp:** HMAC-SHA256 không thể tái tạo nếu thiếu `secret_key`; `fail_count` tự block sau 5 lần sai; so sánh timing-safe. **Còn tồn tại nếu** secret key bị lộ (xem 4.3.4).

### 4.3.3. Replay Attack

**Demo – timestamp cũ hơn 300 giây:**
```json
{ "error": "GATEWAY_AUTH_FAIL", "reason": "TIMESTAMP_EXPIRED" }
// HTTP 401
```

**Biện pháp:** timestamp window ±300s; HMAC bao gồm timestamp nên mỗi payload có chữ ký khác nhau. **Còn tồn tại:** trong cửa sổ 300 giây vẫn có thể replay — cần nonce/sequence number để hoàn thiện.

### 4.3.4. Secret Key Compromise (rò rỉ secret key)

**Hậu quả:** kẻ tấn công tạo HMAC hợp lệ bất kỳ lúc nào; không thể phát hiện trừ khi phân tích dữ liệu bất thường. **Điểm yếu:** `secret_key` không thể rotate mà không re-register thiết bị.

**Biện pháp hiện tại:** admin có thể block thiết bị ngay; audit log ghi mọi lần submit.
**Khuyến nghị:** key rotation, mTLS, hoặc device certificate.

### 4.3.5. SQL Injection

**Demo:**
```http
POST /api/auth/login
{ "username": "admin' OR '1'='1", "password": "x" }
```
**Kết quả mong đợi:** HTTP 401, không bypass đăng nhập.

**Biện pháp:** `mysql2/promise` Prepared Statements — `pool.execute('SELECT * FROM users WHERE username = ?', [username])` — không có dynamic SQL construction trong codebase.

### 4.3.6. Sensor giả làm Gateway

**Demo:** gửi request với `gateway_id` thực chất là ID của một sensor:
```json
{ "error": "INVALID_DEVICE_TYPE", "detail": "gateway_id must be a gateway device" }
```
Hệ thống không chỉ kiểm tra HMAC mà còn kiểm tra đúng `device_type`.

### 4.3.7. XSS (Cross-Site Scripting)

**Biện pháp:** React tự động escape HTML khi render; Helmet CSP chặn inline script; httpOnly cookie không đọc được bằng JavaScript.

### 4.3.8. Man-in-the-Middle (MitM)

**Điểm yếu:** MQTT Broker 1 (:1883) và Broker 2 (:1884) không TLS → dữ liệu plain text trên LAN.

**Biện pháp:** HMAC authentication khiến dữ liệu bị sniff vẫn không thể sửa mà không bị phát hiện; kiến trúc 2 broker tách biệt làm giảm blast radius; Helmet HSTS ép browser dùng HTTPS.

**Còn tồn tại:** cả 2 MQTT broker chưa TLS — cần triển khai Mosquitto TLS trong production.

### 4.3.9. Unauthorized Access / Privilege Escalation

**Demo:**
```http
DELETE /api/devices/1   (JWT role=viewer)
→ HTTP 403 "Insufficient permissions"
```

**Biện pháp:** RBAC middleware kiểm tra role trước route nhạy cảm; JWT payload chứa role, không sửa được nếu không có signing key; admin không thể tự xóa bản thân.

### 4.3.10. Large Body / Upload Bomb

**Biện pháp:** Nginx `client_max_body_size 10M` reject ngay tại proxy, request không chạm tới application.

### 4.3.11. Brute force HMAC / tự động khóa thiết bị

**Demo:**
```
Lần 1–4: fail_count tăng dần, HTTP 401
Lần 5:   devices.status = 'blocked', audit_log: DEVICE_BLOCKED
Sau đó:  mọi request → HTTP 403 "Gateway is blocked"
         Chỉ admin/operator unblock qua PATCH /api/devices/:id/status
```

## 4.4. Bảng tổng hợp Threat Model

| Tấn công | Khả năng xảy ra | Mức độ nghiêm trọng | Trạng thái phòng thủ |
|----------|:---------------:|:--------------------:|---------------------|
| Brute-force login | Cao | Cao | Giảm thiểu (rate limit + bcrypt) |
| Device spoofing | Trung bình | Cao | Giảm thiểu (HMAC + fail_count) |
| Replay attack | Trung bình | Trung bình | Giảm thiểu* (timestamp ±300s) |
| Secret key lộ | Thấp–Trung bình | Rất cao | Một phần (block device, chưa key rotation) |
| SQL Injection | Thấp | Rất cao | Loại bỏ (parameterized queries) |
| XSS | Thấp | Trung bình | Loại bỏ (React + Helmet CSP) |
| Man-in-the-Middle | Thấp (LAN) | Cao | Một phần** (HMAC integrity, cần TLS MQTT) |
| Privilege Escalation | Thấp | Rất cao | Loại bỏ (RBAC + JWT) |
| Sensor giả làm Gateway | Thấp | Cao | Loại bỏ (kiểm tra `device_type`) |
| DoS / Large body | Trung bình | Trung bình | Loại bỏ (rate limit + Nginx body limit) |
| Timing attack | Rất thấp | Trung bình | Loại bỏ (constant-time comparison) |

\* Còn cửa sổ 300 giây — cần nonce để hoàn thiện.

\*\* MQTT Broker 1 & 2 chưa TLS trên LAN — cần Mosquitto TLS cho production.

## 4.5. Kết quả kiểm thử chức năng

### Kịch bản 1: Luồng dữ liệu hoàn chỉnh

| Bước | Hành động | Kết quả kỳ vọng | Kết quả thực tế |
|------|-----------|----------------|----------------|
| 1 | Đăng nhập `admin/admin123` | JWT cookie, redirect dashboard | ✅ Pass |
| 2 | Đăng ký Gateway Node | Trả về `secret_key` 1 lần | ✅ Pass |
| 3 | Đăng ký Sensor, kích hoạt `active` | Trạng thái `active` | ✅ Pass |
| 4 | Flash firmware cho Gateway, Sensor | Kết nối WiFi + MQTT | ✅ Pass |
| 5 | Sensor gửi dữ liệu | Dashboard Sensor online | ✅ Pass |
| 6 | Xem chi tiết thiết bị | Biểu đồ nhiệt độ/độ ẩm | ✅ Pass |
| 7 | Kiểm tra audit log | Có sự kiện `DATA_RECV` | ✅ Pass |

### Kịch bản 2: Kiểm tra RBAC

| Hành động | Admin | Operator | Viewer |
|-----------|:-----:|:--------:|:------:|
| `GET /api/users` | 200 OK | 403 Forbidden | 403 Forbidden |
| `DELETE /api/devices/:id` | 200 OK | 403 Forbidden | 403 Forbidden |
| `POST /api/devices/register` | 201 Created | 201 Created | 403 Forbidden |
| `GET /api/dashboard/stats` | 200 OK | 200 OK | 200 OK |
| `DELETE /api/audit-log/data-recv` | 200 OK | 200 OK | 403 Forbidden |

### Kịch bản 3: Đánh giá sau demo

| Tiêu chí | Kết quả |
|----------|---------|
| Thiết bị hợp lệ gửi dữ liệu | ✅ Đạt |
| Thiết bị chưa đăng ký / sai token bị từ chối | ✅ Đạt |
| Replay attack bị từ chối | ✅ Đạt |
| Brute force bị giảm thiểu bằng auto-block | ✅ Đạt |
| API quản trị có JWT/RBAC | ✅ Đạt |
| Dashboard hiển thị danh sách và online/offline | ✅ Đạt |
| Audit log ghi nhận đầy đủ sự kiện bảo mật | ✅ Đạt |

---

# Chương 5. Kết luận và hướng phát triển

## 5.1. Tổng kết đạt được

Đề tài đã xây dựng thành công một hệ thống IoT hoàn chỉnh, lấy bảo mật làm nguyên tắc thiết kế cốt lõi (**Security by Design**), với 4 lớp bảo vệ độc lập:

```
┌───────────────────────────────────────────────┐
│ Lớp 4 – Dữ liệu (Database)                     │
│ Parameterized queries, Audit immutable log     │
├───────────────────────────────────────────────┤
│ Lớp 3 – Ứng dụng (Backend)                     │
│ JWT, bcrypt, RBAC, Rate Limit, Helmet           │
├───────────────────────────────────────────────┤
│ Lớp 2 – Proxy (Nginx)                          │
│ Single entry point, body limit, IP forwarding   │
├───────────────────────────────────────────────┤
│ Lớp 1 – Thiết bị & Mạng (Firmware/Transport)   │
│ HMAC-SHA256, Timestamp window, Whitelist        │
└───────────────────────────────────────────────┘
```

## 5.2. Đánh giá mức độ đáp ứng yêu cầu

| Yêu cầu | Kết quả |
|---------|---------|
| Xây dựng IoT Device – Server – Database – Dashboard | ✅ Hoàn thành |
| Thiết bị có Device ID duy nhất + secret key | ✅ Hoàn thành |
| Server hỗ trợ đăng ký và xác thực thiết bị | ✅ Hoàn thành |
| Kiểm soát thiết bị (active/inactive/blocked) | ✅ Hoàn thành |
| Dashboard hiển thị danh sách + online/offline | ✅ Hoàn thành |
| Từ chối thiết bị không đăng ký hoặc sai token | ✅ Hoàn thành |
| Chống giả mạo thiết bị và truy cập trái phép (RBAC) | ✅ Hoàn thành |
| Threat model và kiểm thử bảo mật | ✅ Hoàn thành |
| Reverse Proxy tập trung (Nginx) | ✅ Hoàn thành |

## 5.3. Điểm mạnh nổi bật

1. **Defense in depth:** không có single point of failure về bảo mật — mỗi lớp bảo vệ độc lập.
2. **Cryptographically sound:** HMAC-SHA256 + constant-time comparison áp dụng đúng nguyên tắc mật mã học.
3. **Least privilege:** RBAC đảm bảo mỗi người dùng chỉ có quyền tối thiểu cần thiết.
4. **Audit trail đầy đủ, bất biến:** không thể xóa log; mọi sự kiện ghi nhận với IP, User-Agent, JSON details.
5. **Fail-safe default:** thiết bị mới luôn ở trạng thái `inactive`, phải kích hoạt thủ công.
6. **Single Entry Point (Nginx):** quản lý traffic tập trung, loại bỏ CORS, dễ bổ sung TLS.
7. **Container hóa đầy đủ:** Docker Compose 6 services triển khai nhất quán bằng 1 lệnh.

## 5.4. Hạn chế hiện tại

| Hạn chế | Mức độ ảnh hưởng | Hướng cải tiến |
|---------|:---------------:|----------------|
| MQTT Broker 1 & 2 chưa TLS | Cao | Cấu hình Mosquitto TLS + client certificate |
| Nginx/API chưa bắt buộc HTTPS | Cao | Tích hợp Let's Encrypt / self-signed TLS |
| Replay vẫn khả thi trong 300s | Trung bình | Thêm nonce/sequence number dùng một lần |
| Secret key không thể rotate | Trung bình | Endpoint `/api/devices/:id/rotate-key` |
| Chưa có CAPTCHA cho login | Thấp | Tích hợp reCAPTCHA |
| Không có account lockout theo username | Thấp | Lockout sau N lần thất bại / username |
| Secret key trên ESP32 có thể bị dump flash | Trung bình | ESP32 Secure Boot + Flash Encryption |
| Chưa có WebSocket push | Trung bình | Socket.IO để push dữ liệu real-time |
| Device Tokens chưa triển khai | Thấp | Bảng `device_tokens` đã tạo, cần implement |

## 5.5. Hướng phát triển tiếp theo

| Tính năng | Mô tả | Ưu tiên |
|-----------|-------|:-------:|
| MQTT TLS | Mosquitto TLS cho cả 2 broker + HTTPS cho Nginx | Cao |
| Nonce/request-id | Chống replay triệt để trong cửa sổ 300s | Trung bình |
| Key rotation | Endpoint rotate-key + mã hóa secret_key at-rest | Trung bình |
| ESP32 Secure Boot | Bảo vệ secret key trên phần cứng | Trung bình |
| WebSocket Push | Socket.IO push dữ liệu sensor mới real-time | Trung bình |
| Alerting | Cảnh báo khi nhiều `*_AUTH_FAIL` liên tiếp | Trung bình |
| Device Token API | Triển khai `device_tokens` cho firmware auth HTTP | Thấp |
| Firmware OTA | Over-the-air update firmware qua MQTT | Thấp |
| Multi-tenant | Phân chia không gian thiết bị theo tổ chức | Thấp |
| Export dữ liệu | Xuất CSV/Excel lịch sử cảm biến | Thấp |

## 5.6. Bài học kinh nghiệm

1. **Bảo mật phải thiết kế từ đầu** — retrofit bảo mật vào hệ thống đã xây xong thường tốn kém và kém hiệu quả hơn nhiều.
2. **Nguyên tắc Kerckhoffs:** an toàn hệ thống không nên dựa vào việc giữ bí mật thuật toán (security through obscurity) mà dựa vào việc giữ bí mật key.
3. **Constant-time comparison là bắt buộc** trong mọi so sánh mật mã — lỗi timing attack thường bị bỏ qua nhưng có thể bị khai thác trong production.
4. **Audit log là tài sản bảo mật** không kém gì dữ liệu nghiệp vụ — không thể phát hiện tấn công nếu không có log đầy đủ.
5. **Container hóa** giúp đảm bảo tính nhất quán môi trường phát triển/production, giảm thiểu lỗi môi trường.

## 5.7. Kết luận chung

Project đã chứng minh được cách xây dựng một hệ thống IoT có quản lý danh tính thiết bị và kiểm soát truy cập đúng nguyên tắc bảo mật cơ bản. Với kiến trúc **Sensor – Gateway – Nginx – Backend – Database – Dashboard**, hệ thống vừa đáp ứng đầy đủ yêu cầu chức năng, vừa có các lớp bảo vệ cần thiết trước các tấn công phổ biến: giả mạo thiết bị, replay attack, brute force token, SQL Injection, XSS và truy cập API trái phép. Đây là nền tảng phù hợp để tiếp tục phát triển thành một hệ thống IoT an toàn hơn trong thực tế.

---

# Phụ lục

## A. Hướng dẫn cài đặt nhanh

```bash
# Yêu cầu: Docker Desktop đã cài và đang chạy
git clone <repo>
cd managerDeviceIoT-RBAC

# Tạo file biến môi trường
cp backend/.env.example backend/.env
# Sửa JWT_SECRET thành chuỗi ngẫu nhiên ≥ 32 ký tự

# Khởi động toàn bộ hệ thống
docker compose up -d --build

# Truy cập Dashboard
# http://localhost  (qua Nginx)
# Tài khoản mặc định: admin / admin123

# Xem logs
docker compose logs -f backend
docker compose logs -f mqtt-broker-2

# Dừng hệ thống
docker compose down

# Môi trường production
docker compose -f docker-compose.prod.yml up -d --build

# Xoá hoàn toàn kể cả dữ liệu (CẢNH BÁO: mất dữ liệu)
docker compose down -v
```

## B. Hướng dẫn flash firmware

```bash
# 1. Đăng ký thiết bị trên Dashboard (Admin hoặc Operator)
#    Lưu device_id và secret_key ngay khi modal hiển thị

# 2. Sensor Node: cập nhật firmware/sensor-node/include/config.h
#    DEVICE_ID  = "<device_id từ dashboard>"
#    SECRET_KEY = "<secret_key từ dashboard>"
#    WIFI_SSID  = "<tên WiFi>"
#    WIFI_PASS  = "<mật khẩu WiFi>"
#    MQTT_HOST  = "<IP máy chủ chạy Broker 1>"

# 3. Flash và monitor
cd firmware/sensor-node
pio run --target upload
pio device monitor --baud 115200

# 4. Gateway Node: cập nhật firmware/gateway-node/include/config_gw.h
#    GATEWAY_ID         = "<gateway device_id>"
#    GATEWAY_SECRET_KEY = "<gateway secret_key>"
#    Thêm sensor vào KNOWN_SENSORS[]
#    BROKER1_HOST / BROKER2_HOST

cd firmware/gateway-node
pio run --target upload
pio device monitor --baud 115200

# 5. Kích hoạt thiết bị trên Dashboard: PATCH status → "active"
```

## C. Cấu trúc thư mục dự án

```
managerDeviceIoT-RBAC/
├── backend/                         ← Express.js + TypeScript (Port 5000)
│   ├── src/
│   │   ├── server.ts                ← Entry point, khởi tạo DB, services
│   │   ├── app.ts                   ← Express app, middleware, routes
│   │   ├── db/index.ts              ← MySQL connection pool
│   │   ├── middleware/
│   │   │   ├── verifyJWT.ts         ← JWT authentication
│   │   │   ├── rbac.ts              ← Role-based access control
│   │   │   └── validateDevice.ts    ← 2-layer HMAC validation
│   │   ├── routes/
│   │   │   ├── auth.ts              ← /api/auth/*
│   │   │   ├── devices.ts           ← /api/devices/*
│   │   │   ├── users.ts             ← /api/users/*
│   │   │   ├── dashboard.ts         ← /api/dashboard/stats
│   │   │   ├── audit.ts             ← /api/audit-log/*
│   │   │   └── deviceApi.ts         ← /api/device/* (firmware)
│   │   └── services/
│   │       ├── mqttDataService.ts   ← MQTT subscriber + data ingestion
│   │       ├── hmacService.ts       ← HMAC-SHA256 verification
│   │       ├── deviceStatus.ts      ← Online/offline tracking (30s refresh)
│   │       └── auditLogger.ts       ← Non-blocking audit logging
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/                        ← Next.js 16 App Router (Port 3000)
│   ├── src/app/
│   │   ├── (auth)/login/            ← Trang đăng nhập
│   │   └── (private)/
│   │       ├── layout.tsx           ← Auth guard + navigation
│   │       ├── dashboard/           ← Tổng quan thống kê
│   │       ├── devices/             ← Danh sách + [id] chi tiết
│   │       ├── users/               ← Quản lý users (admin)
│   │       └── audit-log/           ← Nhật ký sự kiện
│   ├── package.json
│   └── Dockerfile
│
├── firmware/
│   ├── sensor-node/                 ← PlatformIO, ESP32 DOIT V1
│   │   ├── src/main.cpp
│   │   └── include/config_1.h
│   ├── sensor-node-2/               ← Sensor node thứ 2
│   └── gateway-node/                ← PlatformIO, ESP32 DOIT DevKit V1
│       ├── src/main.cpp
│       └── include/config_gw.h
│
├── database/migrations/
│   ├── 001_schema.sql               ← Full schema + seed admin user
│   └── 002_*.sql                    ← Incremental migrations
│
├── mosquitto/
│   ├── broker1/mosquitto.conf       ← Port 1883, Sensor↔Gateway
│   └── broker2/mosquitto.conf       ← Port 1884, Gateway→Backend
│
├── nginx/nginx.conf                 ← Reverse proxy config
├── docker-compose.yml               ← Development stack (6 services)
├── docker-compose.prod.yml          ← Production stack
├── scripts/setup.sh + setup.bat     ← Automation scripts
└── docs/BAO_CAO_MON_HOC.md          ← Báo cáo đồ án môn học (file này)
```

---

# Tài liệu tham khảo

## Tài liệu kỹ thuật chính thức

1. **MQTT Protocol Specification v3.1.1** — OASIS Standard, 2014.
   https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html

2. **Eclipse Mosquitto Documentation** — Eclipse Foundation.
   https://mosquitto.org/documentation/

3. **Express.js 5 Documentation** — OpenJS Foundation.
   https://expressjs.com/en/5x/api.html

4. **Next.js 16 Documentation** — Vercel.
   https://nextjs.org/docs

5. **MySQL 8.0 Reference Manual** — Oracle Corporation.
   https://dev.mysql.com/doc/refman/8.0/en/

6. **JSON Web Tokens (JWT)** — RFC 7519.
   https://datatracker.ietf.org/doc/html/rfc7519

7. **HMAC: Keyed-Hashing for Message Authentication** — RFC 2104.
   https://datatracker.ietf.org/doc/html/rfc2104

8. **ESP32 Technical Reference Manual** — Espressif Systems.
   https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf

9. **DHT22 Datasheet** — AOSONG Electronics.

10. **Docker Compose Documentation** — Docker Inc.
    https://docs.docker.com/compose/

## Thư viện và packages

11. **mqtt.js** — MQTT.js contributors. https://github.com/mqttjs/MQTT.js
12. **jsonwebtoken** — Auth0. https://github.com/auth0/node-jsonwebtoken
13. **bcrypt** — kelektiv. https://github.com/kelektiv/node.bcrypt.js
14. **helmet** — Express.js. https://helmetjs.github.io/
15. **Recharts** — Recharts Group. https://recharts.org/

## Tài liệu học thuật

16. Hammi, B., Khatoun, R., Zeadally, S., Fayad, A., & Khoukhi, L. (2018). *IoT Technologies for Smart Cities*. IET Networks.

17. Frustaci, M., Pace, P., Aloi, G., & Fortino, G. (2018). *Evaluating Critical Security Issues of the IoT World: Present and Future Challenges*. IEEE IoT Journal.

18. Stallings, W. (2017). *Cryptography and Network Security: Principles and Practice* (7th ed.). Pearson.

---

*Báo cáo đồ án môn học An Toàn Hệ Thống Nhúng và IoT*

*Sinh viên: Nguyễn Hoàng Đạt — nguyenhoangdat2608@gmail.com — Ngày 16/06/2026*
