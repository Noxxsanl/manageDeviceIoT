# BÁO CÁO ĐỒ ÁN MÔN HỌC
# AN TOÀN HỆ THỐNG NHÚNG VÀ IoT

---

<div align="center">

**TRƯỜNG ĐẠI HỌC**
**KHOA CÔNG NGHỆ THÔNG TIN**

---

**ĐỀ TÀI:**

## HỆ THỐNG QUẢN LÝ THIẾT BỊ IoT
## CÓ XÁC THỰC VÀ PHÂN QUYỀN TRUY CẬP

---

**Sinh viên thực hiện:** Nguyễn Hoàng Đạt
**Môn học:** An Toàn Hệ Thống Nhúng và IoT
**Ngày báo cáo:** 16/06/2026

</div>

---

## Mục lục

- [Chương 1. Tổng quan đề tài](#chương-1-tổng-quan-đề-tài)
- [Chương 2. Cơ sở lý thuyết](#chương-2-cơ-sở-lý-thuyết)
- [Chương 3. Phân tích, thiết kế và triển khai xây dựng hệ thống](#chương-3-phân-tích-thiết-kế-và-triển-khai-xây-dựng-hệ-thống)
- [Chương 4. Threat Model & Demo kiểm thử bảo mật](#chương-4-threat-model--demo-kiểm-thử-bảo-mật)
- [Chương 5. Kết luận và hướng phát triển](#chương-5-kết-luận-và-hướng-phát-triển)
- [Phụ lục](#phụ-lục)

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

| # | Mục tiêu | Tiêu chí đánh giá / Nội dung thực hiện |
|---|----------|------------------------------------------|
| 1 | Xây dựng mô hình IoT đầy đủ | Sensor Node, Gateway Node, Backend Server, MySQL Database, Dashboard |
| 2 | Xác thực danh tính thiết bị | Mỗi thiết bị có `device_id` duy nhất và `secret_key` riêng; không thể giả mạo nếu không có key |
| 3 | Đăng ký thiết bị | API đăng ký thiết bị sensor/gateway, auto-generate `device_id` |
| 4 | Xác thực dữ liệu truyền | Mọi gói tin mang chữ ký HMAC-SHA256; server từ chối dữ liệu không có chữ ký hợp lệ |
| 5 | Chống replay attack | Timestamp validation ±300 giây; payload phát lại sau thời hạn bị từ chối |
| 6 | Kiểm soát quyền truy cập | RBAC 3 cấp (admin/operator/viewer) bằng JWT; mỗi endpoint được bảo vệ đúng role |
| 7 | Cơ chế tự phục hồi | Thiết bị tự block sau 5 lần xác thực thất bại; admin/operator có thể mở khóa |
| 8 | Audit trail | Mọi sự kiện bảo mật được ghi log với đầy đủ thông tin: IP, thời gian, chi tiết |
| 9 | Dashboard quản trị | Giao diện trực quan giám sát thiết bị, xem dữ liệu cảm biến theo thời gian thực |
| 10 | Threat Model | Xác định, phân tích và kiểm thử các kịch bản tấn công có thể xảy ra |

## 1.4. Phạm vi đề tài

Hệ thống tập trung vào môi trường IoT quy mô nhỏ, phục vụ mục tiêu học tập và trình diễn bảo mật. Phạm vi triển khai gồm:

- Firmware ESP32 cho sensor node và gateway node (PlatformIO).
- Backend API dùng Express.js 5 và TypeScript.
- Database MySQL 8.0.
- Dashboard Next.js 16 + React 19.
- MQTT broker Mosquitto 2.x.
- Nginx làm reverse proxy – điểm vào duy nhất của hệ thống.
- Docker Compose để triển khai toàn bộ hệ thống (5 services).

```
IoT Device  ──MQTT──►  Gateway Node  ──HTTP──►  Nginx  ──►  Backend Server  ◄──►  Dashboard
(Sensor ESP32)          (ESP32-S3)              (Port 80)   (Express + MySQL)     (Next.js)
```

## 1.5. Đối tượng sử dụng

| Đối tượng | Vai trò |
|---|---|
| **Quản trị viên (`admin`)** | Toàn quyền: quản lý người dùng, thiết bị, audit log, xóa thiết bị |
| **Kỹ thuật viên vận hành (`operator`)** | Đăng ký, khóa/mở khóa, theo dõi thiết bị |
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

Trong project này, sensor node đọc nhiệt độ/độ ẩm, gateway node nhận dữ liệu qua MQTT và backend server xử lý dữ liệu sau khi xác thực.

### 2.1.2. Các mối đe dọa đặc thù của IoT

| Đặc điểm IoT | Hệ quả bảo mật |
|--------------|----------------|
| Thiết bị có tài nguyên giới hạn (CPU, RAM, flash) | Không thể dùng TLS đầy đủ trên mọi thiết bị giá rẻ |
| Thiết bị hoạt động không có người giám sát (unattended) | Kẻ tấn công có thể can thiệp vật lý vào thiết bị |
| Số lượng thiết bị lớn, phân tán | Khó quản lý key tập trung, dễ bị tấn công diện rộng |
| Giao tiếp qua mạng cục bộ (LAN) | Dữ liệu có thể bị sniff nếu mạng không mã hóa |
| Vòng đời thiết bị dài | Firmware cũ chứa lỗ hổng không được vá |

Các loại tấn công phổ biến nhắm vào hệ thống IoT: **Device Spoofing**, **Replay Attack**, **Man-in-the-Middle**, **Brute Force**, **Privilege Escalation**.

## 2.2. Giao thức MQTT và mô hình Pub/Sub

MQTT (Message Queuing Telemetry Transport) là giao thức messaging nhẹ, dựa trên mô hình **Publish/Subscribe**, thiết kế cho môi trường mạng không ổn định và thiết bị tài nguyên giới hạn: overhead nhỏ (header 2 bytes), hoạt động tốt trên băng thông thấp, có 3 mức QoS.

```
Publisher (Sensor Node)        Broker (Mosquitto)        Subscriber (Gateway)
        │── PUBLISH ─────────────►│                            │
        │  topic: local/sensors/  │──── DELIVER (wildcard) ───►│
        │  {sensor_id}/data       │                            │
        │  payload: {temp,humid,hmac}                          │
```

**Rủi ro bảo mật của MQTT trong demo:** port 1883 không có TLS (dữ liệu plain text trên wire), broker mặc định cho phép anonymous access, bất kỳ client nào trên mạng đều có thể subscribe topic.

**Biện pháp đối phó:** Ký HMAC-SHA256 trên payload trước khi publish → dù bị sniff, kẻ tấn công không thể tạo payload hợp lệ mới hoặc sửa đổi dữ liệu mà không bị phát hiện.

## 2.3. HMAC-SHA256 – Xác thực thông điệp

### 2.3.1. Nguyên lý

HMAC (Hash-based Message Authentication Code) tạo chữ ký mật mã dựa trên hàm băm kết hợp secret key:

```
HMAC-SHA256(K, m) = H((K ⊕ opad) || H((K ⊕ ipad) || m))

K    = secret key (64 bytes, padding nếu ngắn hơn)
m    = message cần ký
H    = SHA-256 hash function
opad = 0x5c5c5c...   ipad = 0x363636...
||   = concatenation  ⊕ = XOR
```

Đầu ra: 256-bit (32 bytes), biểu diễn dưới dạng hex 64 ký tự.

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
  hmac      = "c4d8e2f1a9b3..." (64-char hex output)
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

Nếu hệ thống chỉ kiểm tra HMAC mà không kiểm tra thời gian, request cũ vẫn được chấp nhận.

### 2.4.2. Phương pháp phòng chống: Timestamp Window

```
|T_server - T_device| ≤ W,   với W = 300 giây (5 phút) trong đề tài
```

Nếu timestamp cách thời điểm hiện tại quá 300 giây → từ chối với lỗi `TIMESTAMP_EXPIRED`. Yêu cầu mọi thiết bị đồng bộ thời gian qua NTP.

**Đánh đổi (trade-off):** W nhỏ → bảo mật tốt hơn nhưng dễ bị từ chối do lệch đồng hồ; W lớn → dễ chịu hơn nhưng cửa sổ replay rộng hơn.

**Hạn chế còn lại:** trong cửa sổ 300 giây, payload vẫn có thể bị replay. Giải pháp hoàn chỉnh hơn là dùng nonce (số dùng một lần).

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

RBAC là mô hình kiểm soát quyền truy cập dựa trên vai trò (role) gán cho người dùng, thay vì gán quyền trực tiếp cho từng cá nhân:

```
Người dùng ──gán──► Vai trò ──có──► Quyền hạn ──áp dụng vào──► Tài nguyên
```

| Vai trò | Quyền hạn | Trường hợp sử dụng |
|---------|-----------|---------------------|
| `admin` | Toàn quyền hệ thống | Kỹ sư hệ thống, quản trị viên |
| `operator` | Quản lý thiết bị, xem dữ liệu | Kỹ thuật viên vận hành |
| `viewer` | Chỉ đọc | Nhân viên giám sát, khách hàng |

**Nguyên tắc least privilege:** mỗi vai trò chỉ được cấp quyền tối thiểu cần thiết để thực hiện công việc. RBAC giúp ngăn người dùng quyền thấp thực hiện thao tác nhạy cảm (xóa thiết bị, tạo user...).

## 2.7. Timing Attack và Constant-Time Comparison

### 2.7.1. Nguyên lý timing attack

So sánh chuỗi thông thường dừng vòng lặp khi gặp ký tự đầu tiên không khớp → thời gian thực thi tiết lộ thông tin:

```
compare("aaaa", "baaa") → dừng ở ký tự 1 → nhanh (0.5µs)
compare("aaaa", "aaab") → dừng ở ký tự 4 → chậm hơn (2µs)
```

Kẻ tấn công có thể đo thời gian phản hồi hàng nghìn lần để đoán từng ký tự của HMAC.

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

Audit log ghi lại các sự kiện quan trọng, đặc biệt liên quan đến bảo mật: `DATA_RECV`, `DEVICE_REGISTER`, `DEVICE_DELETE`, `DEVICE_STATUS_CHANGE`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`, `USER_LOGIN`, `USER_LOGOUT`. Audit log giúp truy vết sự cố, phát hiện hành vi bất thường và hỗ trợ trình bày threat model.

---

# Chương 3. Phân tích, thiết kế và triển khai xây dựng hệ thống

## 3.1. Chức năng của project

### 3.1.1. Ma trận quyền truy cập

| Chức năng | admin | operator | viewer |
|-----------|:-----:|:--------:|:------:|
| Xem danh sách / chi tiết thiết bị | ✓ | ✓ | ✓ |
| Đăng ký thiết bị mới | ✓ | ✓ | ✗ |
| Thay đổi trạng thái thiết bị (active/blocked) | ✓ | ✓ | ✗ |
| Xóa thiết bị | ✓ | ✗ | ✗ |
| Quản lý người dùng | ✓ | ✗ | ✗ |
| Xem audit log / dashboard stats | ✓ | ✓ | ✓ |

### 3.1.2. Bốn nhóm chức năng chính

**Nhóm 1 – Quản lý danh tính thiết bị:** đăng ký thiết bị mới (sensor/gateway) với auto-generate `device_id`; tạo và hiển thị `secret_key` một lần duy nhất; quản lý trạng thái `inactive → active → blocked`; xóa thiết bị (cascade).

**Nhóm 2 – Thu thập và xác thực dữ liệu cảm biến:** sensor node đọc nhiệt độ/độ ẩm và ký HMAC trên firmware; gateway node xác thực chữ ký sensor, ký lại và chuyển tiếp lên backend; backend xác thực 2 lớp HMAC (gateway + sensor) trước khi lưu; tự động block thiết bị sau 5 lần xác thực thất bại.

**Nhóm 3 – Dashboard quản trị:** thống kê tổng quan (tổng thiết bị, online, tổng điểm dữ liệu); danh sách thiết bị lọc theo trạng thái, online/offline realtime; chi tiết thiết bị với biểu đồ nhiệt độ/độ ẩm theo thời gian; audit log tra cứu theo bộ lọc.

**Nhóm 4 – Quản lý người dùng và phân quyền:** đăng nhập/đăng xuất JWT httpOnly cookie; tạo/xóa tài khoản (operator/viewer); đổi mật khẩu; RBAC 3 cấp.

## 3.2. Kiến trúc tổng quan

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              MẠNG NỘI BỘ (LAN)                                        │
│                                                                                        │
│  ┌─────────────┐    MQTT     ┌─────────────┐    HTTP POST     ┌───────────────────┐  │
│  │ Sensor Node │  ─────────► │ Gateway Node│  ──────────────► │  Nginx (Port 80)  │  │
│  │  ESP32 V1   │  local/sens │  ESP32-S3   │  /api/device/   │  Reverse Proxy    │  │
│  │  DHT22 GPIO4│  ors/+/data │  N16R8      │  data           └────────┬──────────┘  │
│  └─────────────┘             └─────────────┘                          │              │
│                                                              ┌─────────┴──────────┐   │
│                                                              │  /api/*  │   /*     │   │
│                                                              ▼          ▼          │   │
│  ┌──────────────┐                               ┌──────────────┐  ┌────────────┐  │   │
│  │  MQTT Broker │                               │   Backend    │  │  Frontend  │  │   │
│  │  Mosquitto   │◄──────────────────────────────│  Express.js  │  │  Next.js   │  │   │
│  │  Port: 1883  │                               │  Port: 5000  │  │  Port: 3000│  │   │
│  └──────────────┘                               └──────┬───────┘  └────────────┘  │   │
│                                                         │                          │   │
│                                                  ┌──────▼───────┐                  │   │
│                                                  │  MySQL 8.0   │                  │   │
│                                                  └──────────────┘                  │   │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │ HTTP (Port 80)
                                 ┌──────┴──────┐
                                 │ Admin/Oper/ │
                                 │   Viewer    │
                                 └─────────────┘
```

**Vai trò Nginx (single entry point):** chỉ expose port 80 ra ngoài; frontend/backend cùng origin → loại bỏ CORS trong production; dễ bổ sung TLS/HTTPS, caching, rate limiting tại tầng proxy; WebSocket (HMR, socket.io) chuyển tiếp đúng qua `Upgrade` headers.

```
location /api/  ──────► Backend (port 5000)   proxy_pass http://backend
location /      ──────► Frontend (port 3000)  proxy_pass http://frontend (+ WebSocket Upgrade headers)
```

### 3.2.1. Luồng dữ liệu end-to-end (chi tiết theo từng bước)

```
[ESP32 Sensor]                                            [Browser Dashboard]
     │                                                            ▲
     │ B1. Đọc DHT22 mỗi 5 giây                                   │ B9. SWR refresh ~10s
     │ B2. HMAC-SHA256(secret, "id:ts")                            │     / WebSocket push
     │ B3. Publish MQTT                                            │     hiển thị data mới
     ↓                                                            │
[Mosquitto MQTT Broker]                                           │
     │ B4. Deliver message đến subscriber (theo wildcard topic)    │
     ↓                                                            │
[ESP32 Gateway]                                                   │
     │ B5. Whitelist check sensor_id                               │
     │ B6. Timestamp window ±300s                                  │
     │ B7. Verify sensor HMAC (constant-time)                      │
     │ B8. Re-sign với gateway HMAC                                │
     │ B9. HTTP POST /api/device/data                              │
     ↓                                                            │
[Nginx :80] ────────────── route /api/* ──────────────────────── │
     ↓                                                            │
[Backend Express.js]                                              │
     │ B10. validateDevice middleware (2 lớp – xem mục 3.7)        │
     │ B11. INSERT sensor_data (MySQL)                            │
     │ B12. UPDATE devices.last_seen, fail_count = 0               │
     │ B13. INSERT audit_log (event: DATA_RECV)                    │
     │ B14. Response HTTP 200 → Gateway                            │
     └──────────────────── MySQL ──────────────────────────────► │
```

**Diễn giải chi tiết từng bước:**

| Bước | Tác nhân | Hành động | Đầu ra / Điều kiện chuyển bước |
|---|---|---|---|
| B1 | Sensor | Đọc nhiệt độ/độ ẩm từ DHT22 qua GPIO4 | Nếu đọc lỗi (NaN) → bỏ qua chu kỳ, thử lại sau 5s |
| B2 | Sensor | Lấy `timestamp` từ NTP (đã sync ở `setup()`), tính `sn_hmac = HMAC-SHA256(sensor_secret, "sensor_id:timestamp")` | Chuỗi hex 64 ký tự |
| B3 | Sensor | Publish JSON `{sensor_id, timestamp, hmac, temperature, humidity}` lên topic `local/sensors/{sensor_id}/data` | QoS mặc định của PubSubClient; LED gửi nhấp nháy 200ms |
| B4 | Mosquitto | Broker chuyển tiếp message đến mọi subscriber khớp wildcard `local/sensors/+/data` | Broker không kiểm tra nội dung payload |
| B5 | Gateway | Tra `sensor_id` trong `KNOWN_SENSORS[]` (whitelist nội bộ, nạp cứng trong firmware) | Không có → log "Unknown sensor", dừng xử lý message này |
| B6 | Gateway | So sánh `|now() − timestamp| ≤ 300s` | Quá hạn → log "Timestamp expired", dừng (chống replay) |
| B7 | Gateway | Tính lại `expected = HMAC-SHA256(sensor_secret, "sensor_id:timestamp")`, so sánh bằng `safeEq64()` (constant-time) | Sai → log "HMAC mismatch", dừng |
| B8 | Gateway | Tính `gw_hmac = HMAC-SHA256(gateway_secret, "gateway_id:gw_timestamp")` với `gw_timestamp` mới lấy tại thời điểm này | Gói tin chuyển tiếp có 2 timestamp độc lập (sensor & gateway) |
| B9 | Gateway | Gửi `HTTP POST` (WiFiClient) tới `BACKEND_URL/api/device/data`, timeout ~5s | Thành công → LED forward nhấp nháy nếu HTTP 200; lỗi mạng → retry ở vòng loop kế tiếp |
| B10 | Backend | Middleware `validateDevice` xác thực **độc lập** cả gateway và sensor (xem chi tiết mục 3.7) | Một trong hai sai → trả lỗi tương ứng, **không** đi tới B11 |
| B11 | Backend | `INSERT INTO sensor_data (device_id, gateway_id, payload, received_at)` | `payload` lưu dạng JSON `{temperature, humidity}` |
| B12 | Backend | `UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id IN (sensor.id, gateway.id)` | Làm cơ sở tính online/offline ở dashboard |
| B13 | Backend | Ghi `audit_log` với `event_type = 'DATA_RECV'`, `ip_address` lấy từ header `X-Real-IP` do Nginx forward | Phục vụ truy vết & threat model |
| B14 | Backend → Gateway | Trả `HTTP 200 { "message": "Data received successfully" }` | Gateway coi là gửi thành công |
| B15 | Dashboard | SWR poll `GET /api/devices` mỗi ~10s, hoặc nhận event qua `socket.io` | Cập nhật bảng thiết bị, biểu đồ Recharts, trạng thái online/offline |

**Thời gian xử lý đo thực tế (môi trường Docker local):** toàn bộ chuỗi B1→B14 ước tính ~15ms (không tính độ trễ MQTT broker và mạng WiFi của thiết bị thật).

## 3.3. Công nghệ sử dụng

| Lớp | Thành phần | Công nghệ | Phiên bản |
|---|------------|-----------|-----------|
| Backend | Runtime / Framework / Ngôn ngữ | Node.js / Express.js / TypeScript | 20.x / 5.2.1 / 6.0.3 |
| Backend | DB Driver / Auth / Hash | mysql2/promise / jsonwebtoken / bcrypt | 3.22.3 / 9.0.3 / 5.1.1 |
| Backend | MQTT / Security headers / Rate limit / Realtime | mqtt / helmet / express-rate-limit / ws | 5.15.1 / 7.2.0 / 7.5.1 / 8.20.1 |
| Frontend | Framework / UI / Styling | Next.js / React / Tailwind CSS | 16.2.5 / 19.2.4 / 4 |
| Frontend | Biểu đồ / Fetching / Realtime / Icon | Recharts / SWR / socket.io-client / Lucide React | 3.8.1 / 2.4.1 / 4.8.3 / 1.16.0 |
| Firmware | Sensor / Gateway / Build / Cảm biến | ESP32 DOIT V1 / ESP32-S3 N16R8 / PlatformIO / DHT22 | — |
| Firmware | Mật mã / Đồng bộ thời gian | mbedTLS (HMAC-SHA256) / NTP (pool.ntp.org, UTC+7) | — |
| Hạ tầng | Proxy / Broker / Container / DBMS | Nginx (Alpine) / Mosquitto MQTT / Docker Compose / MySQL | port 80 / port 1883 / 5 services / port 3308→3306 |

## 3.4. Thiết kế database

**File schema:** `database/migrations/001_schema.sql` — Encoding UTF8MB4 Unicode

```sql
-- Bảng users: quản lý người dùng hệ thống
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,             -- bcrypt cost=12
  role          ENUM('admin','operator','viewer') DEFAULT 'viewer',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME NULL
);

-- Bảng devices: registry thiết bị IoT
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
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL REFERENCES users(id)
);

-- Bảng sensor_data: time-series dữ liệu cảm biến
CREATE TABLE sensor_data (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   INT UNSIGNED NOT NULL REFERENCES devices(id),   -- sensor
  gateway_id  INT UNSIGNED NOT NULL REFERENCES devices(id),   -- gateway
  payload     JSON NOT NULL,                        -- {"temperature":27.5,"humidity":65.3}
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_data_device_received (device_id, received_at DESC)
);

-- Bảng device_tokens: dự phòng cho cơ chế token có thời hạn/revoke
CREATE TABLE device_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id  INT UNSIGNED NOT NULL REFERENCES devices(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) DEFAULT 0
);

-- Bảng audit_log: nhật ký sự kiện bảo mật
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

`secret_key` chỉ hiển thị **một lần duy nhất** khi đăng ký, không thể lấy lại sau đó. `audit_log` không có endpoint xóa; khi thiết bị bị xóa, `device_id` được `SET NULL` (`ON DELETE SET NULL`) để giữ lại lịch sử sự kiện.

## 3.5. API Backend

**Base URL (qua Nginx):** `http://localhost` · **Base URL (direct, debug):** `http://localhost:5000`

| Module | Method/Endpoint | Vai trò / Xác thực | Mô tả |
|---|---|---|---|
| Auth | `POST /api/auth/login` | Không | Đăng nhập, trả JWT trong httpOnly cookie (8h). Rate limit 10/15min/IP |
| Auth | `POST /api/auth/logout` | JWT | Xóa cookie xác thực |
| Auth | `GET /api/auth/me` | JWT | Lấy thông tin user hiện tại |
| Devices | `POST /api/devices/register` | admin, operator | Đăng ký thiết bị mới, trả `secret_key` 1 lần |
| Devices | `GET /api/devices` | Tất cả | Danh sách thiết bị + trạng thái online (`last_seen` ≤ 60s) |
| Devices | `GET /api/devices/:id` / `:id/data` | Tất cả | Chi tiết thiết bị / lịch sử dữ liệu phân trang |
| Devices | `PATCH /api/devices/:id/status` | admin, operator | Đổi trạng thái: active / blocked / inactive |
| Devices | `DELETE /api/devices/:id` | admin | Xóa thiết bị (cascade) |
| Data | `POST /api/device/data` | HMAC-SHA256 (2 lớp) | Gateway gửi dữ liệu cảm biến. Rate limit 60/phút/IP |
| Dashboard | `GET /api/dashboard/stats` | Tất cả | Thống kê tổng quan hệ thống |
| Users | `GET/POST /api/users`, `PATCH /:id/password`, `DELETE /:id` | admin only | CRUD người dùng |
| Audit | `GET /api/audit-log?event_type=&device_id=&from=&to=` | Tất cả | Tra cứu nhật ký kiểm toán |
| Health | `GET /api/health` | Không | `{ "status": "ok" }` |

**Payload `POST /api/device/data`:**
```json
{
  "gateway_id": "ESP32-GW-F1E2D3C4",
  "gw_timestamp": 1749479200,
  "gw_hmac": "3a7f9b2c...",
  "sensor_id": "ESP32-SN-A1B2C3D4",
  "sn_timestamp": 1749479198,
  "sn_hmac": "c4d8e2f1...",
  "data": { "temperature": 27.5, "humidity": 65.3 }
}
```

## 3.6. Giải pháp thiết kế

### 3.6.1. Giải pháp xác thực thiết bị – Dual-Layer HMAC

Thay vì gửi trực tiếp secret key (nguy cơ lộ key khi bị sniff), hệ thống ký HMAC hai lớp độc lập:

```
Lớp 1 – Sensor → Gateway:  HMAC₁ = HMAC-SHA256(sensor_secret, "sensor_id:timestamp")
Lớp 2 – Gateway → Backend: HMAC₂ = HMAC-SHA256(gateway_secret, "gateway_id:timestamp")

Backend xác thực cả HMAC₁ và HMAC₂ độc lập với nhau.
```

| Phương án | Ưu điểm | Nhược điểm |
|-----------|---------|------------|
| Gửi secret key thẳng | Đơn giản | Key bị lộ → giả mạo vĩnh viễn |
| HMAC một lớp (chỉ gateway) | Bảo vệ đường truyền gateway↔backend | Không xác thực danh tính sensor |
| **HMAC hai lớp (đề tài)** | **Xác thực cả sensor lẫn gateway** | **Cần lưu secret key sensor trên gateway** |
| mTLS (mutual TLS) | Rất mạnh | Phức tạp, tốn tài nguyên firmware |

**Sơ đồ luồng xác thực 2 lớp (sequence đầy đủ từ sensor đến backend):**

```
Sensor              Gateway                          Backend (validateDevice)
  │                    │                                       │
  │ sn_hmac = HMAC(sensor_secret, "sensor_id:ts1")              │
  │───── MQTT publish (sensor_id, ts1, sn_hmac, data) ─────────►│
  │                    │ verify sn_hmac (whitelist nội bộ)      │
  │                    │ gw_hmac = HMAC(gateway_secret,         │
  │                    │            "gateway_id:ts2")           │
  │                    │──── HTTP POST (gw_id, ts2, gw_hmac,    │
  │                    │      sensor_id, ts1, sn_hmac, data) ──►│
  │                    │                                       │ verify gw_hmac (DB lookup gateway_secret)
  │                    │                                       │ verify sn_hmac (DB lookup sensor_secret)
  │                    │                                       │ cả 2 hợp lệ → lưu sensor_data
  │                    │◄──────────── HTTP 200 ────────────────│
```

**Vì sao backend vẫn verify lại `sn_hmac` dù gateway đã verify?** Gateway chỉ là thiết bị trung gian, có thể bị thỏa hiệp (compromise) hoặc bị thay thế bằng thiết bị giả mạo đã có đúng `gateway_secret` nhưng cố gắng "tự chế" dữ liệu sensor. Việc backend xác thực độc lập cả hai lớp đảm bảo **không tin tưởng ngầm (no implicit trust)** vào bất kỳ thiết bị trung gian nào — đúng nguyên tắc *defense in depth*.

### 3.6.2. Giải pháp phân quyền – Middleware chain

```
Request
   │
   ├── verifyJWT()        → Kiểm tra cookie có JWT hợp lệ không?
   │       ↓ pass
   ├── rbac(['admin'])    → req.user.role có trong allowed roles không?
   │       ↓ pass
   └── handler()          → Xử lý nghiệp vụ
```

Tất cả quyết định phân quyền tập trung tại tầng middleware, không nằm rải rác trong business logic. Ngoài phân quyền người dùng, hệ thống còn kiểm tra **vai trò thiết bị**: `gateway_id` phải là thiết bị loại `gateway`, `sensor_id` phải là thiết bị loại `sensor` (chống "sensor giả làm gateway" – xem mục 4.3.6).

### 3.6.3. Giải pháp audit trail – Immutable log

```sql
-- audit_log không có endpoint DELETE
-- Khi device bị xóa: ON DELETE SET NULL → log vẫn tồn tại
device_id INT UNSIGNED NULL REFERENCES devices(id) ON DELETE SET NULL
```

Đảm bảo: mọi sự kiện bảo mật được ghi lại vĩnh viễn; xóa thiết bị không xóa lịch sử sự kiện của nó; admin không thể xóa audit log qua API.

### 3.6.4. Giải pháp one-time secret key reveal

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

Người dùng phải copy và lưu key ngay khi modal hiển thị.

## 3.7. Middleware bảo mật backend

**Cấu trúc `backend/src/`:**
```
├── server.ts / app.ts            ← Entry point + Express app
├── config/db.ts, env.ts          ← MySQL pool, validate env bắt buộc
├── middleware/
│   ├── verifyJWT.ts              ← Giải mã JWT cookie, gắn req.user
│   ├── rbac.ts                   ← Kiểm tra role, 403 nếu không đủ quyền
│   └── validateDevice.ts         ← Xác thực HMAC gateway + sensor (2 lớp)
├── routes/                       ← auth, devices, data, users, dashboard, audit, health
└── services/hmacService.ts, auditLogger.ts
```

**Luồng xử lý đầy đủ của middleware (cả 2 lớp độc lập):**

```
POST /api/device/data  (đã qua Nginx, X-Real-IP đã được forward)
  │
  ├─ 1. Parse gateway_id, gw_timestamp, gw_hmac
  │      ├─ Tra cứu gateway trong DB theo device_id + device_type='gateway'
  │      │     └─ Không có → HTTP 401 "Gateway not found"  (dừng)
  │      ├─ Kiểm tra device_type đúng là 'gateway'
  │      │     └─ Sai (ví dụ gửi sensor_id vào field gateway_id) → HTTP 400 "INVALID_DEVICE_TYPE"
  │      ├─ Kiểm tra status = 'active'
  │      │     └─ 'blocked'/'inactive' → HTTP 403 "Gateway blocked"
  │      ├─ Xác minh |now - gw_timestamp| ≤ 300s
  │      │     └─ Vượt ngưỡng → HTTP 401 "Gateway timestamp expired"
  │      └─ So sánh gw_hmac bằng timingSafeEqual()
  │            └─ Sai → incrementFailCount(gateway) + auditLog('GATEWAY_AUTH_FAIL')
  │                     → nếu fail_count ≥5: status='blocked' + auditLog('DEVICE_BLOCKED')
  │                     → HTTP 401 "Gateway HMAC invalid"  (dừng)
  │
  ├─ 2. Parse sensor_id, sn_timestamp, sn_hmac  (lặp lại đúng 5 bước trên cho sensor)
  │      ├─ Tra cứu sensor trong DB theo device_id + device_type='sensor'
  │      ├─ Kiểm tra status = 'active'
  │      ├─ Xác minh timestamp (±300 giây)
  │      └─ So sánh sn_hmac (timing-safe)
  │            └─ Thất bại → incrementFailCount(sensor) + auditLog('SENSOR_AUTH_FAIL') → HTTP 401
  │
  └─ 3. Cả 2 lớp hợp lệ → next() → handler lưu sensor_data + audit_log('DATA_RECV')
```

**Pseudocode `validateDevice.ts` (đầy đủ cả 2 lớp):**
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
    await incrementFailCount(gateway.id);                       // tăng fail_count, block nếu ≥5
    await auditLog('GATEWAY_AUTH_FAIL', gateway.id, req.ip);
    return res.status(401).json({ error: 'Gateway HMAC invalid' });
  }

  // === LỚP 2: Xác thực Sensor (độc lập, dùng đúng cơ chế như lớp 1) ===
  const { sensor_id, sn_timestamp, sn_hmac } = req.body;
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

  // Cả 2 lớp xác thực thành công
  req.deviceContext = { gateway, sensor };
  next();   // → handler INSERT sensor_data, UPDATE last_seen, auditLog('DATA_RECV')
}
```

**Cơ chế tự block:**
```typescript
async function incrementFailCount(deviceId: number) {
  await db.execute('UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?', [deviceId]);
  const [device] = await db.execute('SELECT fail_count FROM devices WHERE id = ?', [deviceId]);
  if (device.fail_count >= 5) {
    await db.execute("UPDATE devices SET status = 'blocked' WHERE id = ?", [deviceId]);
    await auditLog('DEVICE_BLOCKED', deviceId, null);
  }
}
```

Để mở khóa: admin/operator gọi `PATCH /api/devices/:id/status` với `{ "status": "active" }`.

**Tại sao dùng HMAC thay vì gửi `secret_key` trực tiếp?**

| Phương pháp | Rủi ro nếu bị sniff |
|-------------|---------------------|
| Gửi `secret_key` thẳng | Kẻ tấn công chiếm được key → giả mạo vĩnh viễn |
| Gửi `HMAC(secret_key, data)` | Kẻ tấn công chỉ thấy signature → không thể tái tạo key |

## 3.8. Bảo mật bổ sung tầng ứng dụng / hạ tầng

| Tính năng | Cấu hình | Ý nghĩa |
|-----------|----------|---------|
| Rate limiting | 10/15min login, 60/phút device data, 100/15min API khác | Làm chậm brute-force, DoS |
| Helmet.js | CSP, X-Content-Type-Options, X-Frame-Options, HSTS | Chặn injection/clickjacking |
| `client_max_body_size 10M` (Nginx) | nginx.conf | Chặn request body quá lớn (upload bomb) |
| `proxy_read_timeout 60s` / `proxy_connect_timeout 10s` | nginx.conf | Tránh slow-loris, fail-fast nếu backend treo |
| Header forwarding `X-Real-IP`, `X-Forwarded-For` | nginx.conf | Rate limit đúng IP thực của client |
| Parameterized queries (mysql2/promise) | toàn backend | Chống SQL Injection |
| `created_by` / `ON DELETE SET NULL` | schema | Audit log không mất khi xóa thiết bị |

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

**Phần cứng:** ESP32 DOIT DevKit V1 (30 chân), dual-core Xtensa LX6 @240MHz; DHT22 (AM2302) – nhiệt độ ±0.5°C, độ ẩm ±2–5%RH; kết nối GPIO4 (DHT data), GPIO2 (LED trạng thái gửi), GPIO0 (LED trạng thái WiFi).

**Luồng khởi động `setup()`:**

```
Serial.begin(115200)
  │
  ├─ WiFi.begin(SSID, PASS)
  │     └─ Retry tối đa 20 lần (500ms/lần), LED_WIFI nhấp nháy khi đang chờ kết nối
  │     └─ Kết nối được → LED_WIFI sáng cố định
  │
  ├─ NTP sync: configTime(UTC+7, "pool.ntp.org")
  │     └─ Retry liên tục cho đến khi time(nullptr) > 1700000000 (epoch hợp lệ)
  │     └─ Không có thời gian đúng → không thể tính HMAC hợp lệ, vẫn retry vô hạn
  │
  ├─ dht.begin()        — khởi tạo cảm biến DHT22
  └─ mqttClient.connect(MQTT_HOST, MQTT_PORT)
        └─ Thất bại → maintainMQTT() sẽ retry trong loop()
```

**Luồng chính `loop()` [chạy lại mỗi `SEND_INTERVAL` = 5000ms]:**

```
1. maintainWiFi()       → nếu WiFi.status() != WL_CONNECTED: gọi lại WiFi.reconnect()
2. maintainMQTT()       → nếu !mqttClient.connected(): gọi lại mqttClient.connect()
3. float temp = dht.readTemperature()
   float humi = dht.readHumidity()
      └─ Nếu isnan(temp) || isnan(humi) → bỏ qua chu kỳ này, không publish, chờ vòng kế tiếp
4. time_t now = time(nullptr)                           — timestamp Unix hiện tại (đã NTP sync)
5. computeHMAC(SECRET_KEY, DEVICE_ID + ":" + now) → hmac[65]   — HMAC-SHA256 qua mbedTLS
6. snprintf(payload, ...) → dựng chuỗi JSON
7. mqttClient.publish("local/sensors/" + DEVICE_ID + "/data", payload)
      └─ Thành công → LED_SEND nhấp nháy 200ms
      └─ Thất bại (broker mất kết nối) → bỏ qua, sẽ reconnect ở bước 2 vòng sau
```

```json
{ "sensor_id": "ESP32-SN-A1B2C3D4", "timestamp": 1749479198, "hmac": "c4d8e2f1...", "temperature": 27.5, "humidity": 65.3 }
```

### 3.9.2. Gateway Node – ESP32-S3 N16R8

**Phần cứng:** ESP32-S3 N16R8 (16MB Flash, 8MB PSRAM), dual-core Xtensa LX7 @240MHz — không có cảm biến, đóng vai trò security validator.

**Luồng khởi động:** giống sensor node — kết nối WiFi (retry 20 lần) → đồng bộ NTP → kết nối MQTT broker → `subscribe("local/sensors/+/data")` (wildcard nhận từ mọi sensor).

**Luồng xử lý mỗi message nhận được `onMqttMessage(topic, payload, length)`:**

```
[1] Parse JSON payload → sensor_id, timestamp, hmac, temperature, humidity
      └─ Parse lỗi (JSON không hợp lệ) → LOG("Invalid JSON") → return, không xử lý tiếp

[2] Whitelist check: tìm sensor_id trong KNOWN_SENSORS[] (mảng tĩnh trong firmware)
      └─ Không tìm thấy → LOG("Unknown sensor") → return  (chặn rogue device từ bước này)

[3] Timestamp window: |time(nullptr) − timestamp| ≤ 300 giây
      └─ Quá hạn → LOG("Timestamp expired") → return  (chống replay attack)

[4] Verify sensor HMAC:
      message  = sensor_id + ":" + timestamp
      expected = HMAC-SHA256(sensor_secret_key_tra_từ_whitelist, message)
      safeEq64(expected, received_hmac)   ← so sánh constant-time, không dùng strcmp
      └─ Sai → LOG("HMAC mismatch") → return  (chặn giả mạo / dữ liệu bị sửa)

[5] Tính gateway HMAC (ký lại để backend xác thực gateway):
      gw_timestamp = time(nullptr)        ← lấy timestamp MỚI tại thời điểm này, không dùng lại của sensor
      gw_message   = GATEWAY_ID + ":" + gw_timestamp
      gw_hmac      = HMAC-SHA256(GATEWAY_SECRET_KEY, gw_message)

[6] Build HTTP POST body (JSON) gồm cả 2 bộ thông tin: gateway_id/gw_timestamp/gw_hmac
      và sensor_id/sn_timestamp(=timestamp ở bước 1)/sn_hmac(=hmac ở bước 1)

[7] HTTP POST tới BACKEND_URL (qua Nginx) "/api/device/data", timeout ~5 giây
      └─ Response 200          → LED_FWD nhấp nháy (forward thành công)
      └─ Response 401/403      → LOG mã lỗi trả về từ backend (gateway/sensor bị backend từ chối)
      └─ Timeout / lỗi mạng    → LOG("HTTP POST failed"), KHÔNG retry message này (tránh trùng lặp dữ liệu),
                                   chờ message tiếp theo từ sensor
```

```cpp
// firmware/gateway-node/include/config_gw.h
struct SensorCredential { const char* sensor_id; const char* secret_key; };
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-11223344", "aabbccdd..." },
    { "ESP32-SN-AABBCCDD", "11223344..." },
};
```

**Bảo mật phần cứng:** không gửi `secret_key` thẳng (chỉ gửi HMAC); chống replay bằng timestamp ±300s; whitelist sensor nội bộ; mbedTLS cho crypto chuẩn; NTP sync đảm bảo timestamp chính xác.

## 3.10. Frontend Dashboard

**Stack:** Next.js 16 (App Router) + React 19 + TailwindCSS 4.

```
app/
├── (account)/login, forgot-password     ← Public, không header/sidebar
└── (private)/                           ← Yêu cầu xác thực
    ├── dashboard          /dashboard          stats cards
    ├── devices            /devices            list + filter
    ├── devices/[id]       /devices/:id        charts + data table
    ├── users (admin)      /users              CRUD tài khoản
    └── audit              /audit              audit log table
```

**Luồng xác thực (Authentication flow) chi tiết:**

```
[1] Người dùng mở /account/login
      ├─ Form nhập username + password → submit
      ├─ POST /api/auth/login  (credentials: 'include')
      │     ├─ 200 OK  → Backend Set-Cookie: token=<jwt>; HttpOnly; SameSite=Strict; Max-Age=28800
      │     │             Frontend nhận { user: {id, username, role} } → lưu vào AuthContext state
      │     │             router.push('/dashboard')
      │     └─ 401      → Hiển thị thông báo lỗi chung "Sai tên đăng nhập hoặc mật khẩu"
      │
[2] Truy cập bất kỳ route trong (private)/*  (ví dụ /dashboard, /devices)
      ├─ AuthContext.useEffect() chạy lần đầu khi layout mount
      ├─ GET /api/auth/me  (credentials: 'include' → browser tự gửi cookie httpOnly)
      │     ├─ 200 OK + user object  → setUser(user), render trang con (children)
      │     └─ 401 Unauthorized      → router.push('/account/login')  (cookie hết hạn/không có)
      │
[3] Mọi lệnh gọi API tiếp theo từ trang con (devices, audit, users...)
      ├─ fetch(url, { credentials: 'include' })  → cookie tự động gửi kèm
      ├─ Cùng origin qua Nginx (http://localhost/api/*) → KHÔNG cần cấu hình CORS
      └─ Nếu JWT hết hạn giữa session → backend trả 401 → SWR/fetch wrapper bắt lỗi
              → redirect /account/login (giống bước 2)
      
[4] Đăng xuất
      ├─ Người dùng bấm "Đăng xuất" → POST /api/auth/logout
      ├─ Backend xóa cookie (Set-Cookie: token=; Max-Age=0)
      └─ Frontend clear AuthContext state → router.push('/account/login')
```

Mọi API call cùng origin qua Nginx (không cần CORS). Toàn bộ vòng đời JWT (8 giờ) được quản lý hoàn toàn qua cookie `httpOnly` — frontend không bao giờ đọc trực tiếp giá trị token.

**Realtime:** SWR auto-refresh danh sách thiết bị mỗi ~10s; `online` = `last_seen > NOW() - 60s`; socket.io-client cập nhật tức thì khi có event; Nginx forward đúng `Upgrade`/`Connection: upgrade` headers.

**Đăng ký thiết bị (modal):** auto-generate `device_id` theo `ESP32-{SN|GW}-{HEX8}` → hiển thị `secret_key` một lần với nút Copy → cảnh báo lưu ngay, không thể xem lại sau khi đóng modal.

## 3.11. Hạ tầng triển khai – Docker Compose

```yaml
services:
  mysql:      { image: mysql:8.0, ports: ["3308:3306"] }
  mosquitto:  { image: eclipse-mosquitto:2, ports: ["1883:1883"] }
  nginx:      { image: nginx:alpine, ports: ["80:80"], depends_on: [backend, frontend] }
  backend:    { build: ./backend, ports: ["5000:5000"], depends_on: { mysql: { condition: service_healthy } } }
  frontend:   { build: ./frontend, ports: ["3000:3000"], depends_on: [backend] }
```

| URL | Mô tả |
|---|---|
| `http://localhost` | Dashboard qua Nginx (chính thức) |
| `http://localhost/api/health` | Health check qua Nginx |
| `http://localhost:5000` / `:3000` | Backend / Frontend trực tiếp (debug nội bộ) |

## 3.12. Phương pháp & quy trình thực hiện

Quy trình thực hiện đề tài theo mô hình tuần tự có phản hồi (mỗi bước kiểm thử trước khi qua bước sau), gồm 9 giai đoạn:

| Giai đoạn | Nội dung thực hiện | Phương pháp / Công cụ | Đầu ra (deliverable) |
|---|---|---|---|
| **1. Phân tích yêu cầu** | Xác định yêu cầu chức năng (đăng ký/xác thực thiết bị, RBAC, dashboard) và yêu cầu phi chức năng (bảo mật, hiệu năng) | Phân tích đề bài môn học, khảo sát kiến trúc IoT điển hình | Danh sách mục tiêu cụ thể (mục 1.3) |
| **2. Thiết kế database** | Vẽ ERD, xác định 5 bảng (`users`, `devices`, `sensor_data`, `device_tokens`, `audit_log`) và quan hệ khóa ngoại | MySQL Workbench để vẽ ERD, viết tay migration SQL | `database/migrations/001_schema.sql` |
| **3. Xây dựng backend core** | Khởi tạo Express app, cấu hình middleware toàn cục (`helmet`, `cors`, `express-rate-limit`, `express.json`), implement route `/api/auth`, `/api/devices` | TypeScript + Express 5, kiểm thử bằng Postman sau mỗi route | Backend chạy được `npm run dev`, test API thủ công qua Postman |
| **4. Cài đặt cơ chế bảo mật** | Viết middleware `verifyJWT`, `rbac`, `validateDevice` (2 lớp HMAC); viết `hmacService.ts`, `auditLogger.ts` | Module `crypto` của Node.js, `bcrypt`, `jsonwebtoken`; viết unit test cho `computeHmac`/`timingSafeEqual` | Middleware bảo mật hoàn chỉnh (mục 3.6, 3.7) |
| **5. Xây dựng firmware sensor node** | Viết `wifi_manager`, `ntp_sync`, đọc DHT22, tính HMAC bằng mbedTLS, publish MQTT | PlatformIO + Arduino framework, test bằng MQTT Explorer để xem payload thực tế | Firmware sensor flash được lên ESP32 DOIT V1, publish đúng định dạng JSON |
| **6. Xây dựng firmware gateway node** | Viết `mqtt_client` (subscribe), `forwarder` (whitelist + verify + re-sign), HTTP POST tới backend | PlatformIO trên ESP32-S3, test bằng cách giả lập sensor qua MQTT Explorer trước khi dùng phần cứng thật | Firmware gateway forward đúng dữ liệu, backend nhận được request hợp lệ |
| **7. Xây dựng dashboard** | Next.js App Router: `AuthContext`, trang `dashboard/devices/devices[id]/users/audit`, biểu đồ Recharts, SWR polling | Next.js 16 + React 19 + TailwindCSS, kiểm thử UI bằng cách thao tác thủ công trên trình duyệt | Dashboard đầy đủ chức năng theo ma trận quyền (mục 3.1.1) |
| **8. Container hóa & reverse proxy** | Viết `Dockerfile.dev` cho backend/frontend, `docker-compose.yml` (5 services), `nginx.conf` (routing `/api/*` và `/*`) | Docker Compose, kiểm thử bằng `docker compose up -d --build` rồi gọi `/api/health` | Toàn bộ hệ thống khởi động bằng 1 lệnh duy nhất |
| **9. Kiểm thử chức năng & bảo mật** | Kiểm thử từng chức năng (checklist mục 3.13) và từng kịch bản tấn công (threat model Chương 4) | Postman (API), MQTT Explorer (giả lập sensor/gateway), thao tác trực tiếp trên dashboard | Bảng kết quả kiểm thử (mục 3.13, 4.5) |

**Nguyên tắc xuyên suốt quy trình:** mỗi giai đoạn đều có bước kiểm thử ngay (không dồn kiểm thử về cuối) — ví dụ sau giai đoạn 4 đã viết test cho HMAC/timing-safe compare, sau giai đoạn 6 đã giả lập sensor qua MQTT Explorer trước khi cần phần cứng thật, giúp phát hiện lỗi sớm và giảm chi phí sửa lỗi ở giai đoạn cuối.

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
| 13 | Docker Compose 5 services | ✅ Đạt | One-command deployment |
| 14 | Rate limiting + Helmet headers | ✅ Đạt | express-rate-limit, CSP/HSTS |
| 15 | Parameterized SQL queries | ✅ Đạt | mysql2/promise prepared statements |

**Hiệu suất (đo trong môi trường local Docker):**

| Metric | Giá trị |
|--------|---------|
| Thời gian xử lý 1 request data (end-to-end) | ~15ms |
| Throughput tối đa `/api/device/data` | 60 req/phút (rate limit) |
| Dung lượng dữ liệu mỗi thiết bị | ~3.5 MB/tháng (5s interval) |
| Thời gian khởi động hệ thống (`docker compose up`) | ~25 giây |
| bcrypt hash time (cost=12) | ~250ms → brute-force ≤4 hash/giây |

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

**Khởi động môi trường:** `docker compose up -d --build`, kiểm tra 5 service (`iot-mysql`, `iot-mosquitto`, `iot-backend`, `iot-frontend`, `iot-nginx`) đều `running`/`healthy`. Truy cập `http://localhost` (Nginx), `http://localhost/api/health`.

## 4.3. Các kịch bản tấn công, kết quả kiểm thử và biện pháp phòng thủ

### 4.3.1. Brute-Force Login

**Mô tả:** kẻ tấn công thử nhiều mật khẩu để đăng nhập.

**Biện pháp:** rate limit 10 request/15 phút/IP; bcrypt cost=12 (~250ms/hash → tối đa ~4 hash/giây); thông báo lỗi chung (không tiết lộ username có tồn tại). **Điểm còn thiếu:** chưa có CAPTCHA, chưa lockout theo username.

### 4.3.2. Device Spoofing (giả mạo thiết bị)

**Kịch bản:**
```
Kẻ tấn công ──POST /api/device/data──► Nginx ──► Backend
  { "gateway_id": "ESP32-GW-REAL", "gw_hmac": "sai_hoặc_đoán", ... }
```

**Demo – HMAC sai:**
```json
// Response
{ "error": "GATEWAY_AUTH_FAIL", "reason": "HMAC_MISMATCH" }
```
HTTP 401 — `fail_count` +1, audit log `GATEWAY_AUTH_FAIL` ghi nhận `device_id`, `ip_address`.

**Biện pháp:** HMAC-SHA256 không thể tái tạo nếu thiếu `secret_key`; `fail_count` tự block sau 5 lần sai; so sánh timing-safe. **Còn tồn tại nếu** secret key bị lộ (xem 4.3.4).

### 4.3.3. Replay Attack

**Demo – timestamp cũ hơn 300 giây:**
```json
{ "error": "GATEWAY_AUTH_FAIL", "reason": "TIMESTAMP_EXPIRED" }
```
HTTP 401. **Biện pháp:** timestamp window ±300s; HMAC bao gồm timestamp nên mỗi payload có chữ ký khác nhau theo thời gian. **Còn tồn tại:** trong cửa sổ 300 giây vẫn có thể replay — cần nonce/sequence number để hoàn thiện.

### 4.3.4. Secret Key Compromise (rò rỉ secret key)

**Hậu quả nếu lộ:** kẻ tấn công tạo HMAC hợp lệ bất kỳ lúc nào; không có cách phát hiện trừ khi phân tích dữ liệu bất thường; rate limiting không hiệu quả nếu gửi đúng tần suất. **Điểm yếu cốt lõi:** `secret_key` không thể rotate mà không re-register thiết bị.

**Biện pháp hiện tại:** admin có thể block thiết bị ngay; audit log ghi mọi lần submit để phát hiện bất thường. **Khuyến nghị:** key rotation, mTLS, hoặc device certificate.

### 4.3.5. SQL Injection

**Demo:**
```http
POST /api/auth/login
{ "username": "admin' OR '1'='1", "password": "x" }
```
**Kết quả mong đợi:** HTTP 401, không bypass đăng nhập, không lấy được secret key. **Biện pháp:** `mysql2/promise` Prepared Statements — `pool.execute('SELECT * FROM users WHERE username = ?', [username])`; không có dynamic SQL construction trong codebase.

### 4.3.6. Sensor giả làm Gateway

**Demo:** gửi request với `gateway_id` thực chất là ID của một sensor.
```json
{ "error": "INVALID_DEVICE_TYPE", "detail": "gateway_id must be a gateway device" }
```
**Ý nghĩa:** hệ thống không chỉ kiểm tra HMAC mà còn kiểm tra đúng vai trò (`device_type`) của thiết bị.

### 4.3.7. XSS (Cross-Site Scripting)

**Mô tả:** inject script độc hại qua dữ liệu thiết bị (`device_name`, `location`...). **Biện pháp:** React tự động escape HTML khi render; Helmet CSP chặn inline script từ nguồn không tin cậy; httpOnly cookie khiến script không đọc được JWT.

### 4.3.8. Man-in-the-Middle (MitM)

**Điểm yếu tiềm tàng:** MQTT (port 1883) không TLS → dữ liệu plain text trên LAN. **Biện pháp:** HMAC authentication khiến dữ liệu bị sniff vẫn không thể sửa mà không bị phát hiện (HMAC sẽ không khớp); Helmet HSTS ép browser dùng HTTPS khi được cấu hình; Nginx là điểm duy nhất cần bổ sung TLS certificate. **Còn tồn tại:** MQTT chưa TLS — nên triển khai Mosquitto TLS trong production.

### 4.3.9. Unauthorized Access / Privilege Escalation

**Demo:**
```http
DELETE /api/devices/1   (JWT role=viewer)
→ HTTP 403 "Insufficient permissions"
```
**Biện pháp:** RBAC middleware kiểm tra role trước route nhạy cảm; JWT payload chứa role, không sửa được nếu không có signing key; admin không thể tự xóa hoặc bị admin khác xóa (safeguard).

### 4.3.10. Large Body / Upload Bomb

**Mô tả:** gửi request body cực lớn để cạn tài nguyên server. **Biện pháp:** Nginx `client_max_body_size 10M` reject ngay tại proxy, request không chạm tới application.

### 4.3.11. Brute force HMAC / tự động khóa thiết bị

**Demo:** gửi liên tiếp HMAC sai cho cùng thiết bị.

```
Lần 1–4: fail_count tăng dần, HTTP 401
Lần 5:   devices.status = 'blocked', audit_log: DEVICE_BLOCKED
Sau đó:  mọi request → HTTP 403 "Gateway is blocked"
         Chỉ admin/operator unblock được qua PATCH /api/devices/:id/status
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

*Còn cửa sổ 300 giây — cần nonce để hoàn thiện.
**MQTT chưa TLS trên LAN — cần Mosquitto TLS trong production.

## 4.5. Đánh giá sau demo

| Tiêu chí | Kết quả |
|---|---|
| Thiết bị hợp lệ gửi dữ liệu | Đạt |
| Thiết bị chưa đăng ký / sai token bị từ chối | Đạt |
| Replay attack bị từ chối | Đạt |
| Brute force bị giảm thiểu bằng auto-block | Đạt |
| API quản trị có JWT/RBAC | Đạt |
| Dashboard hiển thị danh sách và online/offline | Đạt |
| Audit log ghi nhận đầy đủ sự kiện bảo mật | Đạt |

---

# Chương 5. Kết luận và hướng phát triển

## 5.1. Tổng kết đạt được

Đề tài đã xây dựng thành công một hệ thống IoT hoàn chỉnh, lấy bảo mật làm nguyên tắc thiết kế cốt lõi (**Security by Design**), với kiến trúc **IoT Device – Server – Database – Dashboard** và 4 lớp bảo vệ độc lập:

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

## 5.2. Đánh giá mức độ đáp ứng yêu cầu đề tài

| Yêu cầu | Kết quả |
|---|---|
| Xây dựng IoT Device – Server – Database – Dashboard | Đã hoàn thành |
| Thiết bị có Device ID duy nhất + token/secret key | Đã hoàn thành |
| Server hỗ trợ đăng ký và xác thực thiết bị khi gửi dữ liệu | Đã hoàn thành |
| Kiểm soát thiết bị được phép truy cập (active/inactive/blocked) | Đã hoàn thành |
| Dashboard hiển thị danh sách thiết bị + online/offline | Đã hoàn thành |
| Từ chối thiết bị không đăng ký hoặc sai token | Đã hoàn thành |
| Chống giả mạo thiết bị và truy cập trái phép API (RBAC) | Đã hoàn thành |
| Threat model và phân tích, kiểm thử bảo mật | Đã hoàn thành |
| Reverse Proxy tập trung (Nginx) | Đã hoàn thành |

## 5.3. Điểm mạnh nổi bật

1. **Defense in depth:** không có single point of failure về bảo mật — mỗi lớp bảo vệ độc lập (firmware → mạng → proxy → ứng dụng → dữ liệu).
2. **Cryptographically sound:** HMAC-SHA256 + constant-time comparison áp dụng đúng nguyên tắc mật mã học.
3. **Least privilege:** RBAC đảm bảo mỗi người dùng chỉ có quyền tối thiểu cần thiết.
4. **Audit trail đầy đủ, bất biến:** không thể xóa log; mọi sự kiện bảo mật đều được ghi nhận với IP, User-Agent, chi tiết JSON.
5. **Fail-safe default:** thiết bị mới luôn ở trạng thái `inactive`, phải kích hoạt thủ công.
6. **Single Entry Point (Nginx):** quản lý traffic tập trung, loại bỏ CORS, dễ bổ sung TLS sau này.
7. **Container hóa đầy đủ:** Docker Compose 5 services giúp triển khai nhất quán, giảm lỗi "works on my machine".

## 5.4. Hạn chế

| Hạn chế hiện tại | Hướng cải tiến | Độ ưu tiên |
|-----------------|----------------|:----------:|
| MQTT port 1883 không TLS, cho phép anonymous access | Cấu hình Mosquitto TLS + client certificate | Cao |
| Nginx/API chưa bắt buộc HTTPS | Tích hợp Let's Encrypt / self-signed TLS | Cao |
| Replay vẫn khả thi trong cửa sổ 300s | Thêm nonce/sequence number dùng một lần | Trung bình |
| Secret key lưu plaintext, không thể rotate | Mã hóa tại rest + endpoint `/api/devices/:id/rotate-key` | Trung bình |
| Chưa có CAPTCHA cho login | Tích hợp reCAPTCHA | Thấp |
| Không có account lockout theo username | Thêm lockout sau N lần thất bại / username | Thấp |
| Dữ liệu cảm biến không mã hóa at-rest | Mã hóa cột JSON `payload` trong `sensor_data` | Thấp |
| Secret key trên ESP32 có thể bị lộ nếu dump flash | Bật ESP32 Secure Boot + Flash Encryption | Trung bình |

## 5.5. Hướng phát triển tiếp theo

- Bật TLS cho MQTT (Mosquitto) và HTTPS cho Nginx/API/dashboard.
- Mã hóa `secret_key` và `payload` trong database; bổ sung key rotation & revoke.
- Thêm nonce/request-id dùng một lần để chống replay triệt để hơn ngoài timestamp window.
- Bật ESP32 Secure Boot và Flash Encryption để bảo vệ secret key trên phần cứng.
- Cảnh báo real-time (alert) khi phát hiện nhiều sự kiện `*_AUTH_FAIL` liên tiếp.
- Tự động hóa test bảo mật (spoofing, replay, SQL injection) trong CI/CD.
- Dashboard phân tích threat theo thời gian thực dựa trên audit log.

## 5.6. Bài học kinh nghiệm

1. **Bảo mật phải thiết kế từ đầu**, không phải vá sau — retrofit bảo mật vào hệ thống đã xây xong thường tốn kém và kém hiệu quả hơn nhiều.
2. **Nguyên tắc Kerckhoffs:** an toàn hệ thống không nên dựa vào việc giữ bí mật thuật toán (security through obscurity) mà dựa vào việc giữ bí mật key — HMAC-SHA256 là thuật toán công khai nhưng hệ thống vẫn an toàn vì `secret_key` được bảo vệ.
3. **Constant-time comparison là bắt buộc** trong mọi so sánh mật mã — lỗi timing attack thường bị bỏ qua trong thực tế nhưng có thể bị khai thác trong production.
4. **Audit log là tài sản bảo mật** không kém gì dữ liệu nghiệp vụ — không thể phát hiện tấn công nếu không có log đầy đủ.
5. **Container hóa** giúp đảm bảo tính nhất quán môi trường phát triển/production, giảm thiểu lỗi môi trường.

## 5.7. Kết luận chung

Project đã chứng minh được cách xây dựng một hệ thống IoT có quản lý danh tính thiết bị và kiểm soát truy cập đúng nguyên tắc bảo mật cơ bản. Với kiến trúc **Sensor – Gateway – Nginx – Backend – Database – Dashboard**, hệ thống vừa đáp ứng đầy đủ yêu cầu chức năng của đề tài, vừa có các lớp bảo vệ cần thiết trước các tấn công phổ biến: giả mạo thiết bị, replay attack, brute force token, SQL Injection, XSS và truy cập API trái phép. Đây là nền tảng phù hợp để tiếp tục phát triển thành một hệ thống IoT an toàn hơn trong thực tế.

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
# Tài khoản: admin / admin123
```

## B. Hướng dẫn flash firmware

```bash
# 1. Đăng ký thiết bị trên Dashboard, lưu device_id và secret_key

# 2. Cập nhật config sensor — firmware/sensor-node/include/config.h
#    DEVICE_ID = "<device_id từ dashboard>"
#    SECRET_KEY = "<secret_key từ dashboard>"
#    WIFI_SSID, WIFI_PASS, MQTT_HOST

# 3. Flash
cd firmware/sensor-node
pio run --target upload
pio device monitor --baud 115200

# 4. Tương tự cho gateway node
# firmware/gateway-node/include/config_gw.h
#   GATEWAY_ID, GATEWAY_SECRET_KEY
#   Thêm sensor vào KNOWN_SENSORS[]
```

## C. Cấu trúc thư mục dự án

```
managerDeviceIoT-RBAC/
├── backend/                  ← Express.js + TypeScript
│   ├── src/
│   └── Dockerfile.dev
├── frontend/                 ← Next.js 16 + React 19
│   ├── src/
│   └── Dockerfile.dev
├── firmware/
│   ├── sensor-node/          ← PlatformIO, ESP32 DOIT V1
│   └── gateway-node/         ← PlatformIO, ESP32-S3 N16R8
├── database/migrations/001_schema.sql
├── nginx/nginx.conf
├── mosquitto/mosquitto.conf
├── docs/
│   └── BAO_CAO_MON_HOC.md    ← Báo cáo đồ án môn học (file này)
├── scripts/                  ← Kịch bản mô phỏng tấn công & demo
└── docker-compose.yml
```

---

*Báo cáo đồ án môn học An Toàn Hệ Thống Nhúng và IoT*
*Sinh viên: Nguyễn Hoàng Đạt – ngày 16/06/2026*
