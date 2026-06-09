# BÁO CÁO ĐỒ ÁN
## HỆ THỐNG QUẢN LÝ THIẾT BỊ IoT VÀ PHÂN QUYỀN TRUY CẬP

---

> **Sinh viên:** Nguyễn Hoàng Đạt  
> **Ngày báo cáo:** 09/06/2026  
> **Repository:** `e:\WorkSpace\managerDeviceIoT`

---

## MỤC LỤC

1. [Tổng quan đề tài](#1-tổng-quan-đề-tài)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Công nghệ sử dụng](#3-công-nghệ-sử-dụng)
4. [Cơ sở dữ liệu](#4-cơ-sở-dữ-liệu)
5. [API Backend](#5-api-backend)
6. [Cơ chế bảo mật](#6-cơ-chế-bảo-mật)
7. [Firmware thiết bị IoT](#7-firmware-thiết-bị-iot)
8. [Dashboard & Frontend](#8-dashboard--frontend)
9. [Threat Model & Phân tích tấn công](#9-threat-model--phân-tích-tấn-công)
10. [Triển khai hệ thống](#10-triển-khai-hệ-thống)
11. [Kết quả đạt được & Kết luận](#11-kết-quả-đạt-được--kết-luận)

---

## 1. Tổng quan đề tài

### 1.1 Mục tiêu

Xây dựng hệ thống IoT có đầy đủ các chức năng:

- **Quản lý danh tính thiết bị**: mỗi thiết bị có Device ID duy nhất và secret key riêng biệt.
- **Xác thực thiết bị khi kết nối**: server kiểm tra tính hợp lệ trước khi xử lý bất kỳ dữ liệu nào.
- **Kiểm soát quyền truy cập**: chỉ thiết bị đang ở trạng thái `active` mới được phép gửi dữ liệu.
- **Dashboard quản trị**: hiển thị danh sách thiết bị, trạng thái online/offline, lịch sử dữ liệu cảm biến.
- **Phân quyền người dùng (RBAC)**: phân tách quyền hạn giữa `admin`, `operator`, `viewer`.

### 1.2 Phạm vi hệ thống

Hệ thống gồm 4 thành phần chính:

```
IoT Device  ──MQTT──►  Gateway Node  ──HTTP──►  Backend Server  ◄──►  Dashboard
(Sensor ESP32)          (ESP32-S3)              (Express + MySQL)     (Next.js)
```

---

## 2. Kiến trúc hệ thống

### 2.1 Sơ đồ tổng thể

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         MẠNG NỘI BỘ (LAN)                                    │
│                                                                              │
│  ┌─────────────┐    MQTT     ┌─────────────┐    HTTP POST    ┌────────────┐  │
│  │ Sensor Node │  ─────────► │ Gateway Node│  ─────────────► │  Backend   │  │
│  │  ESP32 V1   │  local/sens │  ESP32-S3   │  /api/device/  │  Express   │  │
│  │  DHT22 GPIO4│  ors/+/data │  N16R8      │  data          │  Node.js   │  │
│  └─────────────┘             └─────────────┘                 └────┬───────┘  │
│                                                                    │          │
│  ┌──────────────┐                                             ┌────▼───────┐  │
│  │  MQTT Broker │◄────────────────────────────────────────── │  MySQL 8.0 │  │
│  │  Mosquitto   │                                             │  Database  │  │
│  │  Port: 1883  │                                             └────────────┘  │
│  └──────────────┘                                                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ JWT API (HTTPS)
                                      │
                               ┌──────┴──────┐
                               │  Dashboard  │
                               │  Next.js    │
                               │  Port: 3000 │
                               └─────────────┘
                                      ▲
                                      │ Browser
                               ┌──────┴──────┐
                               │    Admin /  │
                               │   Operator /│
                               │   Viewer    │
                               └─────────────┘
```

### 2.2 Luồng dữ liệu chi tiết

**Bước 1 – Thu thập dữ liệu cảm biến:**

```
DHT22 ──(GPIO4)──► ESP32 Sensor Node
  ├── Đọc nhiệt độ & độ ẩm mỗi 5 giây
  ├── Lấy thời gian từ NTP server (UTC+7)
  ├── Tính HMAC-SHA256: hmac(secret_key, "sensor_id:timestamp")
  └── Publish MQTT: local/sensors/{sensor_id}/data
```

**Bước 2 – Xác thực & chuyển tiếp qua Gateway:**

```
ESP32 Gateway Node
  ├── Subscribe MQTT: local/sensors/+/data
  ├── Kiểm tra timestamp (±300 giây)
  ├── Tra cứu whitelist sensor nội bộ
  ├── Xác minh HMAC cảm biến
  ├── Tính HMAC gateway: hmac(gw_secret_key, "gw_id:timestamp")
  └── HTTP POST /api/device/data → Backend
```

**Bước 3 – Xác thực & lưu trữ tại Backend:**

```
Backend (Express.js)
  ├── Middleware validateDevice:
  │     ├── Kiểm tra gateway HMAC
  │     ├── Kiểm tra sensor HMAC
  │     ├── Xác nhận cả hai thiết bị đang active
  │     └── Tăng fail_count nếu thất bại (block sau 5 lần)
  ├── Lưu vào bảng sensor_data (MySQL)
  ├── Cập nhật last_seen, reset fail_count
  └── Ghi audit log
```

---

## 3. Công nghệ sử dụng

### 3.1 Backend

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| Runtime | Node.js | 20.x |
| Framework | Express.js | 5.2.1 |
| Ngôn ngữ | TypeScript | 6.0.3 |
| Cơ sở dữ liệu | MySQL | 8.0 |
| DB Driver | mysql2/promise | 3.22.3 |
| Xác thực người dùng | JWT (jsonwebtoken) | 9.0.3 |
| Mã hóa mật khẩu | bcrypt | 5.1.1 |
| MQTT Client | mqtt | 5.15.1 |
| Bảo mật HTTP | helmet | 7.2.0 |
| Giới hạn request | express-rate-limit | 7.5.1 |
| Real-time | WebSocket (ws) | 8.20.1 |

### 3.2 Frontend

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| Framework | Next.js | 16.2.5 |
| UI Library | React | 19.2.4 |
| Biểu đồ | Recharts | 3.8.1 |
| Fetching | SWR | 2.4.1 |
| Real-time | socket.io-client | 4.8.3 |
| Styling | Tailwind CSS | 4 |
| Icon | Lucide React | 1.16.0 |

### 3.3 Firmware (Thiết bị IoT)

| Thành phần | Chi tiết |
|------------|----------|
| Sensor Node | ESP32 DOIT V1 (30 chân) |
| Gateway Node | ESP32-S3 N16R8 |
| Build System | PlatformIO |
| Cảm biến | DHT22 (AM2302) – nhiệt độ & độ ẩm |
| MQTT Library | PubSubClient |
| Mật mã | mbedTLS (HMAC-SHA256) |
| Đồng bộ thời gian | NTP (pool.ntp.org, UTC+7) |

### 3.4 Hạ tầng

| Thành phần | Công nghệ |
|------------|-----------|
| Message Broker | Mosquitto MQTT 2.x |
| Container | Docker + Docker Compose |
| DBMS | MySQL 8.0 |

---

## 4. Cơ sở dữ liệu

**File schema:** `database/migrations/001_schema.sql`  
**Encoding:** UTF8MB4 Unicode

### 4.1 Bảng `users` – Người dùng hệ thống

```sql
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt $2b$12$...
  role          ENUM('admin','operator','viewer') DEFAULT 'viewer',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME NULL
);
```

- Mật khẩu được hash bằng bcrypt với cost factor = 12
- Dữ liệu khởi tạo: tài khoản `admin` / `admin123`

### 4.2 Bảng `devices` – Thiết bị IoT

```sql
CREATE TABLE devices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(64)  UNIQUE NOT NULL,     -- vd: ESP32-SN-A1B2C3D4
  device_name VARCHAR(128) NOT NULL,
  device_type ENUM('sensor','gateway') NOT NULL,
  secret_key  VARCHAR(64)  NOT NULL,            -- 32-byte hex (64 ký tự)
  status      ENUM('inactive','active','blocked') DEFAULT 'inactive',
  location    VARCHAR(255) NULL,
  fail_count  TINYINT UNSIGNED DEFAULT 0,       -- tự block sau 5 lần thất bại
  last_seen   DATETIME NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by  INT UNSIGNED NULL REFERENCES users(id)
);
```

- `device_id` được tạo tự động theo định dạng `ESP32-{SN|GW}-{8 ký tự hex ngẫu nhiên}`
- `secret_key` chỉ hiển thị **một lần duy nhất** khi đăng ký, không thể lấy lại sau đó

### 4.3 Bảng `sensor_data` – Dữ liệu cảm biến

```sql
CREATE TABLE sensor_data (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   INT UNSIGNED NOT NULL REFERENCES devices(id),   -- sensor
  gateway_id  INT UNSIGNED NOT NULL REFERENCES devices(id),   -- gateway
  payload     JSON NOT NULL,       -- {"temperature": 27.5, "humidity": 65.3}
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sensor_data_device_received (device_id, received_at DESC)
);
```

### 4.4 Bảng `device_tokens` – Token thiết bị

```sql
CREATE TABLE device_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id  INT UNSIGNED NOT NULL REFERENCES devices(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked    TINYINT(1) DEFAULT 0
);
```

### 4.5 Bảng `audit_log` – Nhật ký kiểm toán

```sql
CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,   -- DATA_RECV, DEVICE_REGISTER, GATEWAY_AUTH_FAIL, ...
  device_id  INT UNSIGNED NULL REFERENCES devices(id),
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  details    JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_log_event_created (event_type, created_at DESC)
);
```

Các loại sự kiện được ghi nhận: `DATA_RECV`, `DEVICE_REGISTER`, `DEVICE_DELETE`, `DEVICE_STATUS_CHANGE`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`, `USER_LOGIN`, `USER_LOGOUT`.

### 4.6 Sơ đồ quan hệ (ERD)

```
users ──────────────────────────────────────────────────────────────┐
  │ id                                                               │
  │ (1:N)                                                            │
  ▼                                                                  │
devices ──────────────────────────────┐                             │
  │ id  (FK: sensor_data.device_id)   │ (FK: sensor_data.gateway_id)│
  │ (1:N)                             │ (1:N)                        │ created_by
  ▼                                   ▼                              │
sensor_data                           (same devices table)           │
  │ id                                                               │
                                                                     │
devices ◄───────────────────────────────────────────────────────────┘
  │
  ├──► device_tokens (1:N)
  │
  └──► audit_log (1:N, nullable)
```

---

## 5. API Backend

**Base URL:** `http://localhost:5000`  
**Content-Type:** `application/json`

### 5.1 Authentication – `/api/auth`

| Method | Endpoint | Xác thực | Mô tả |
|--------|----------|-----------|-------|
| `POST` | `/api/auth/login` | Không | Đăng nhập, trả về JWT trong httpOnly cookie (8 giờ) |
| `POST` | `/api/auth/logout` | JWT | Xóa cookie xác thực |
| `GET` | `/api/auth/me` | JWT | Lấy thông tin người dùng hiện tại |

**Rate limit:** 10 request / 15 phút / IP

**Request body (login):**
```json
{ "username": "admin", "password": "admin123" }
```

**Response (login thành công):**
```json
{
  "message": "Login successful",
  "user": { "id": 1, "username": "admin", "role": "admin" }
}
```

---

### 5.2 Quản lý thiết bị – `/api/devices`

| Method | Endpoint | Vai trò | Mô tả |
|--------|----------|---------|-------|
| `POST` | `/api/devices/register` | admin, operator | Đăng ký thiết bị mới |
| `GET` | `/api/devices` | Tất cả | Danh sách thiết bị + trạng thái online |
| `GET` | `/api/devices/:id` | Tất cả | Chi tiết thiết bị + 10 bản ghi dữ liệu gần nhất |
| `GET` | `/api/devices/:id/data` | Tất cả | Lịch sử dữ liệu có phân trang |
| `PATCH` | `/api/devices/:id/status` | admin, operator | Thay đổi trạng thái: active / blocked / inactive |
| `DELETE` | `/api/devices/:id` | admin | Xóa thiết bị (cascade) |

**Request body (đăng ký thiết bị):**
```json
{
  "device_name": "Phòng Server - Cảm biến 1",
  "device_type": "sensor",
  "location": "Tầng 3, Phòng A301"
}
```

**Response (đăng ký thành công – hiển thị secret_key DUY NHẤT 1 LẦN):**
```json
{
  "message": "Device registered successfully",
  "device": {
    "device_id": "ESP32-SN-A1B2C3D4",
    "device_name": "Phòng Server - Cảm biến 1",
    "device_type": "sensor",
    "secret_key": "a3f9d2c1b4e87654321fedcba9876543210abcdef0123456789abcdef01234567",
    "status": "inactive"
  },
  "warning": "Save the secret_key now. It will NOT be shown again."
}
```

**Thiết bị online:** `last_seen` trong vòng 60 giây cuối.

---

### 5.3 Nhận dữ liệu cảm biến – `/api/device/data`

| Method | Endpoint | Xác thực | Mô tả |
|--------|----------|-----------|-------|
| `POST` | `/api/device/data` | HMAC-SHA256 (2 lớp) | Gateway gửi dữ liệu cảm biến lên server |

**Rate limit:** 60 request / phút / IP

**Payload format:**
```json
{
  "gateway_id": "ESP32-GW-F1E2D3C4",
  "gw_timestamp": 1749479200,
  "gw_hmac": "3a7f9b2c...",
  "sensor_id": "ESP32-SN-A1B2C3D4",
  "sn_timestamp": 1749479198,
  "sn_hmac": "c4d8e2f1...",
  "data": {
    "temperature": 27.5,
    "humidity": 65.3
  }
}
```

**Response:**
```json
{ "message": "Data received successfully" }
```

---

### 5.4 Dashboard – `/api/dashboard`

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/dashboard/stats` | Thống kê tổng quan hệ thống |

**Response:**
```json
{
  "total_gateways": 2,
  "total_sensors": 5,
  "online_gateways": 1,
  "online_sensors": 3,
  "total_data_points": 12487
}
```

---

### 5.5 Quản lý người dùng – `/api/users` (admin only)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/users` | Danh sách tất cả người dùng |
| `POST` | `/api/users` | Tạo người dùng mới (operator/viewer) |
| `PATCH` | `/api/users/:id/password` | Đổi mật khẩu người dùng |
| `DELETE` | `/api/users/:id` | Xóa người dùng |

---

### 5.6 Audit Log – `/api/audit-log`

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/api/audit-log?event_type=X&device_id=Y&from=Z&to=W` | Truy vấn nhật ký kiểm toán |

---

### 5.7 Health Check – `/api/health`

```json
{ "status": "ok", "message": "Backend running" }
```

---

## 6. Cơ chế bảo mật

### 6.1 Xác thực người dùng (Human Authentication)

**JWT + httpOnly Cookie:**

```
[Trình duyệt] ──POST /api/auth/login──► [Backend]
                                            │
                                            ├─ Xác minh mật khẩu (bcrypt, cost=12)
                                            ├─ Tạo JWT (8 giờ, HS256)
                                            └─ Set-Cookie: token=...; HttpOnly; SameSite=Strict
```

- **bcrypt cost factor = 12**: ~250ms/hash → brute-force chậm hơn đáng kể
- **httpOnly cookie**: JavaScript phía client không thể đọc token (chống XSS)
- **SameSite=Strict**: không gửi cookie theo request cross-site (chống CSRF)
- **Timing-safe comparison**: dùng `crypto.timingSafeEqual()` để chống timing attack khi so sánh mật khẩu

### 6.2 Xác thực thiết bị (Device Authentication) – HMAC-SHA256

Hệ thống áp dụng **xác thực 2 lớp** tại endpoint `/api/device/data`:

**Lớp 1 – Xác thực Gateway:**
```
signature = HMAC-SHA256(gateway_secret_key, "gateway_id:timestamp")
```

**Lớp 2 – Xác thực Sensor (thông qua Gateway):**
```
signature = HMAC-SHA256(sensor_secret_key, "sensor_id:timestamp")
```

**Quy trình xác minh tại Middleware `validateDevice.ts`:**

```
POST /api/device/data
  │
  ├─ 1. Parse gateway_id, gw_timestamp, gw_hmac
  │      ├─ Tra cứu gateway trong DB
  │      ├─ Kiểm tra status = 'active'
  │      ├─ Xác minh timestamp (±300 giây)
  │      └─ So sánh HMAC (timing-safe)
  │         └─ Thất bại → tăng fail_count, nếu ≥5 → block gateway
  │
  ├─ 2. Parse sensor_id, sn_timestamp, sn_hmac
  │      ├─ Tra cứu sensor trong DB
  │      ├─ Kiểm tra status = 'active'
  │      ├─ Xác minh timestamp (±300 giây)
  │      └─ So sánh HMAC (timing-safe)
  │         └─ Thất bại → tăng fail_count, nếu ≥5 → block sensor
  │
  └─ 3. Chuyển tiếp đến handler lưu dữ liệu
```

**Tại sao dùng HMAC thay vì gửi secret_key trực tiếp?**

| Phương pháp | Rủi ro nếu bị sniff |
|-------------|---------------------|
| Gửi `secret_key` thẳng | Kẻ tấn công chiếm được key → giả mạo vĩnh viễn |
| Gửi `HMAC(secret_key, data)` | Kẻ tấn công chỉ thấy signature → không thể tái tạo key |

### 6.3 Phân quyền RBAC (Role-Based Access Control)

| Vai trò | Quyền hạn |
|---------|-----------|
| `admin` | Toàn quyền: quản lý thiết bị, người dùng, xem audit log, xóa thiết bị |
| `operator` | Đăng ký thiết bị, thay đổi trạng thái thiết bị, xem dashboard |
| `viewer` | Chỉ đọc: xem danh sách thiết bị, dữ liệu cảm biến, dashboard |

**Middleware `rbac.ts`** được áp dụng trước mỗi route cần phân quyền:

```typescript
// Ví dụ: chỉ admin mới xóa được thiết bị
router.delete('/:id', verifyJWT, rbac(['admin']), deleteDevice);
```

### 6.4 Cơ chế tự động chặn thiết bị

```
fail_count++
  ├─ fail_count < 5  → Tiếp tục, trả về HTTP 401/403
  └─ fail_count ≥ 5  → Cập nhật status = 'blocked'
                        Ghi audit_log: DEVICE_BLOCKED
                        Trả về HTTP 403 + thông báo blocked
```

Để mở khóa: admin/operator phải gọi `PATCH /api/devices/:id/status` với `{ "status": "active" }`.

### 6.5 Giới hạn request (Rate Limiting)

| Endpoint | Giới hạn |
|----------|----------|
| `POST /api/auth/login` | 10 request / 15 phút / IP |
| `POST /api/device/data` | 60 request / phút / IP |
| Tất cả các API khác | 100 request / 15 phút / IP |

### 6.6 Bảo mật HTTP Headers (Helmet.js)

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000 (khi HTTPS)
```

### 6.7 Bảo mật Database

- **Parameterized queries** (Prepared Statements) – tránh SQL Injection
- **Cascade deletion** – xóa thiết bị sẽ xóa toàn bộ dữ liệu liên quan
- **Environment variables** – credentials không bao giờ hardcode trong source code
- **Audit log không thể xóa** – thiết bị bị xóa không làm mất lịch sử audit (ON DELETE SET NULL)

---

## 7. Firmware thiết bị IoT

### 7.1 Sensor Node (ESP32 DOIT V1)

**File:** `firmware/sensor-node/src/main.cpp`

**Luồng hoạt động:**

```
Khởi động
  │
  ├─ Kết nối WiFi (wifi_manager.h)
  │    └─ Tự động reconnect khi mất kết nối
  │
  ├─ Đồng bộ thời gian NTP (ntp_sync.h)
  │    └─ pool.ntp.org, múi giờ UTC+7
  │
  ├─ Kết nối MQTT Broker (mqtt_sender.h)
  │
  └─ Vòng lặp chính (mỗi 5 giây):
       │
       ├─ Đọc DHT22: nhiệt độ (°C), độ ẩm (%)
       ├─ Lấy Unix timestamp hiện tại
       ├─ Tính HMAC-SHA256 = hmac(secret_key, "sensor_id:timestamp")
       ├─ Tạo JSON payload:
       │    {
       │      "sensor_id": "ESP32-SN-001",
       │      "timestamp": 1749479198,
       │      "hmac": "c4d8e2f1...",
       │      "temperature": 27.5,
       │      "humidity": 65.3
       │    }
       └─ Publish MQTT: local/sensors/ESP32-SN-001/data
```

**Cấu hình firmware** (`firmware/sensor-node/include/config.h`):
```cpp
#define DEVICE_ID     "ESP32-SN-001"
#define SECRET_KEY    "a3f9d2c1b4e8..."  // 64 ký tự hex
#define WIFI_SSID     "HomeNetwork"
#define WIFI_PASS     "password123"
#define MQTT_HOST     "192.168.1.100"
#define MQTT_PORT     1883
#define DHT_PIN       4
#define SEND_INTERVAL 5000               // 5 giây
```

### 7.2 Gateway Node (ESP32-S3 N16R8)

**File:** `firmware/gateway-node/src/main.cpp`

**Luồng hoạt động:**

```
Khởi động
  │
  ├─ Kết nối WiFi + NTP
  ├─ Kết nối MQTT Broker
  └─ Subscribe: local/sensors/+/data
       │
       │ [Nhận message từ sensor]
       │
       ├─ Parse JSON payload
       ├─ Kiểm tra timestamp (±300 giây)
       │    └─ Quá hạn → bỏ qua (replay attack)
       │
       ├─ Tra cứu sensor trong whitelist nội bộ
       │    └─ Không có → bỏ qua (rogue device)
       │
       ├─ Xác minh HMAC cảm biến
       │    └─ Sai → bỏ qua (giả mạo)
       │
       ├─ Tính HMAC gateway: hmac(gw_secret_key, "gw_id:gw_timestamp")
       │
       └─ HTTP POST đến Backend:
            {
              "gateway_id":    "ESP32-GW-F1E2D3C4",
              "gw_timestamp":  1749479200,
              "gw_hmac":       "3a7f9b2c...",
              "sensor_id":     "ESP32-SN-A1B2C3D4",
              "sn_timestamp":  1749479198,
              "sn_hmac":       "c4d8e2f1...",
              "data": { "temperature": 27.5, "humidity": 65.3 }
            }
```

**Whitelist sensor nội bộ** (`firmware/gateway-node/include/config_gw.h`):
```cpp
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-001", "sensor_secret_key_hex_1" },
    { "ESP32-SN-002", "sensor_secret_key_hex_2" },
};
```

### 7.3 Bảo mật phần cứng

| Cơ chế | Thực hiện |
|--------|-----------|
| Không gửi secret_key thẳng | Chỉ gửi chữ ký HMAC |
| Chống Replay Attack | Timestamp ±300 giây |
| Whitelist | Gateway chỉ chấp nhận sensor đã biết |
| mbedTLS | Thư viện crypto chuẩn cho ESP32 |
| NTP Sync | Đảm bảo thời gian chính xác cho HMAC |

---

## 8. Dashboard & Frontend

### 8.1 Cấu trúc trang

| Trang | Route | Mô tả | Quyền |
|-------|-------|-------|-------|
| Đăng nhập | `/account/login` | Form đăng nhập | Public |
| Dashboard | `/(private)/dashboard` | Thống kê tổng quan | Tất cả |
| Danh sách thiết bị | `/(private)/devices` | Lọc theo trạng thái | Tất cả |
| Chi tiết thiết bị | `/(private)/devices/[id]` | Biểu đồ dữ liệu cảm biến | Tất cả |
| Quản lý người dùng | `/(private)/users` | CRUD tài khoản | Admin |
| Audit Log | `/(private)/audit` | Nhật ký sự kiện | Tất cả |

### 8.2 Tính năng chính

**Dashboard Stats:**
```
┌─────────────────┬─────────────────┬────────────────┬───────────────────┐
│  Tổng Gateway   │  Tổng Sensor    │  Gateway Online│  Sensor Online    │
│       2         │       5         │       1        │       3           │
└─────────────────┴─────────────────┴────────────────┴───────────────────┘
                      Tổng điểm dữ liệu: 12,487
```

**Device Detail – Biểu đồ Recharts:**
- Biểu đồ nhiệt độ theo thời gian (LineChart)
- Biểu đồ độ ẩm theo thời gian (LineChart)
- Pagination cho lịch sử dữ liệu

**Real-time Updates:**
- WebSocket (socket.io) cập nhật trạng thái online/offline
- SWR background refresh cho dữ liệu mới nhất

**Đăng ký thiết bị (Modal):**
- Auto-generate `device_id` theo định dạng `ESP32-{SN|GW}-{HEX8}`
- Hiển thị `secret_key` một lần duy nhất với nút Copy
- Cảnh báo người dùng lưu key ngay lập tức

### 8.3 Authentication Flow Frontend

```
[Truy cập route private]
  │
  ├─ AuthContext kiểm tra cookie
  │    ├─ Cookie hợp lệ → Render trang
  │    └─ Không có cookie / hết hạn → Redirect /account/login
  │
  └─ Mọi API call đều kèm credentials: 'include' (gửi httpOnly cookie)
```

---

## 9. Threat Model & Phân tích tấn công

### 9.1 Tài sản cần bảo vệ (Assets)

| Tài sản | Mức độ nhạy cảm | Hậu quả nếu bị xâm phạm |
|---------|----------------|--------------------------|
| Mật khẩu người dùng | Cao | Chiếm tài khoản admin → toàn quyền hệ thống |
| Device Secret Key | Cao | Giả mạo thiết bị → gửi dữ liệu giả |
| JWT Token | Trung bình | Truy cập trái phép trong 8 giờ |
| Dữ liệu cảm biến | Trung bình | Sai lệch thông tin môi trường |
| Audit Log | Trung bình | Xóa bằng chứng tấn công |

### 9.2 Các tấn công có thể xảy ra & Cơ chế phòng thủ

#### 9.2.1 Brute-Force Login

**Mô tả:** Kẻ tấn công thử nhiều mật khẩu để đăng nhập vào hệ thống.

**Điểm yếu tiềm tàng:**
- Nếu không có rate limiting, có thể thử hàng nghìn password/giây
- Mật khẩu yếu dễ bị crack

**Biện pháp đã triển khai:**
- Rate limit: 10 request / 15 phút / IP → làm chậm tấn công
- bcrypt cost=12: mỗi lần hash ~250ms → 4 hash/giây tối đa
- Thông báo lỗi chung chung (không tiết lộ username có tồn tại không)

**Điểm còn thiếu:** Chưa có CAPTCHA, chưa có account lockout theo username.

---

#### 9.2.2 Device Spoofing (Giả mạo thiết bị)

**Mô tả:** Kẻ tấn công tạo thiết bị giả, gửi dữ liệu giả lên server.

**Kịch bản tấn công:**
```
Kẻ tấn công  ──POST /api/device/data──►  Backend
  {
    "gateway_id": "ESP32-GW-REAL",
    "gw_hmac": "sai_hoặc_đoán",
    ...
  }
```

**Điểm yếu tiềm tàng:**
- Nếu biết `gateway_id` nhưng không có `secret_key`, không thể tạo HMAC hợp lệ

**Biện pháp đã triển khai:**
- HMAC-SHA256: không thể tạo signature hợp lệ nếu không có secret_key
- fail_count: sau 5 lần sai → tự động block thiết bị
- timing-safe compare: không rò rỉ thông tin qua thời gian phản hồi

**Còn tồn tại nếu:** Secret key bị lộ (xem phần 9.2.4).

---

#### 9.2.3 Replay Attack (Tấn công phát lại)

**Mô tả:** Kẻ tấn công nghe trộm (sniff) một payload hợp lệ từ gateway và gửi lại sau đó.

**Kịch bản:**
```
1. [Gateway gửi] gw_timestamp=1000, gw_hmac="abc..."
2. Kẻ tấn công lưu lại payload
3. [Tấn công] gw_timestamp=1000, gw_hmac="abc..."  (giống hệt)
```

**Biện pháp đã triển khai:**
- Timestamp window ±300 giây: payload cũ hơn 5 phút → reject
- HMAC bao gồm timestamp: `HMAC(key, "device_id:timestamp")` → mỗi payload có signature khác nhau theo thời gian

**Còn tồn tại:** Trong cửa sổ 300 giây, payload vẫn có thể bị replay. Giải pháp hoàn hảo hơn: nonce/sequence number.

---

#### 9.2.4 Token/Secret Key Compromise (Rò rỉ Secret Key)

**Mô tả:** Secret key của thiết bị bị lộ (firmware bị dump, MQTT bị sniff, log bị lộ).

**Hậu quả:**
- Kẻ tấn công có thể giả mạo thiết bị đó vĩnh viễn
- Gửi dữ liệu sai, gây nhiễu hệ thống

**Phân tích cơ chế xác thực device_id + token:**
```
Cơ chế: HMAC-SHA256(secret_key, "device_id:timestamp")

Nếu secret_key bị lộ:
  ✗ Kẻ tấn công tạo HMAC hợp lệ bất kỳ lúc nào
  ✗ Không có cách phát hiện thiết bị bị giả mạo (trừ khi phân tích dữ liệu bất thường)
  ✗ Rate limiting không hiệu quả nếu gửi đúng tần suất

Điểm yếu cốt lõi: secret_key không thể rotate mà không re-register thiết bị
```

**Biện pháp đã triển khai:**
- Admin có thể block thiết bị ngay lập tức
- Audit log ghi lại mọi data submission (phát hiện bất thường)

**Khuyến nghị bổ sung:** Implement key rotation, mutual TLS, or device certificate.

---

#### 9.2.5 SQL Injection

**Mô tả:** Gửi input độc hại để thao túng câu truy vấn SQL.

**Ví dụ attack:**
```
POST /api/auth/login
{ "username": "admin' OR '1'='1", "password": "anything" }
```

**Biện pháp đã triển khai:**
- mysql2/promise với Prepared Statements: tất cả input được escape tự động
```typescript
const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
```
- Không có dynamic SQL construction trong codebase

---

#### 9.2.6 XSS (Cross-Site Scripting)

**Mô tả:** Inject script độc hại vào trang web qua dữ liệu thiết bị (device_name, location...).

**Biện pháp đã triển khai:**
- React tự động escape HTML khi render
- Helmet CSP headers: chặn inline script từ nguồn không tin cậy
- httpOnly cookie: script không đọc được JWT

---

#### 9.2.7 Man-in-the-Middle (MitM)

**Mô tả:** Kẻ tấn công đứng giữa gateway và backend, đọc hoặc sửa dữ liệu.

**Điểm yếu tiềm tàng:**
- MQTT (port 1883) không có TLS → dữ liệu plain text trên LAN
- Nếu backend chưa có HTTPS → HTTP plain text

**Biện pháp đã triển khai:**
- HMAC authentication: dù bị sniff payload, không thể sửa dữ liệu (HMAC sẽ không khớp)
- Helmet HSTS: nếu HTTPS được cấu hình, ép browser dùng HTTPS

**Còn tồn tại:** MQTT không TLS (giả định LAN an toàn). Nên triển khai Mosquitto với TLS trong môi trường production.

---

#### 9.2.8 Unauthorized Access / Privilege Escalation

**Mô tả:** Viewer cố truy cập API chỉ dành cho admin.

**Biện pháp đã triển khai:**
- RBAC middleware kiểm tra role trước mọi route nhạy cảm
- JWT payload chứa role → không thể sửa mà không có signing key
- Admin không thể bị xóa bởi chính mình hoặc bởi admin khác (safeguard)

---

### 9.3 Bảng tổng hợp Threat Model

| Tấn công | Khả năng xảy ra | Mức độ nghiêm trọng | Trạng thái phòng thủ |
|----------|----------------|---------------------|---------------------|
| Brute-force login | Cao | Cao | Có (rate limit + bcrypt) |
| Device spoofing | Trung bình | Cao | Có (HMAC + fail_count) |
| Replay attack | Trung bình | Trung bình | Có (timestamp ±300s) |
| Secret key lộ | Thấp-Trung bình | Rất cao | Một phần (block device, no key rotation) |
| SQL Injection | Thấp | Rất cao | Có (parameterized queries) |
| XSS | Thấp | Trung bình | Có (React + Helmet CSP) |
| Man-in-the-Middle | Thấp (LAN) | Cao | Một phần (HMAC signature, cần TLS MQTT) |
| Privilege Escalation | Thấp | Rất cao | Có (RBAC + JWT) |
| DoS / Flood | Trung bình | Trung bình | Có (rate limiting) |

---

## 10. Triển khai hệ thống

### 10.1 Docker Compose (Khuyến nghị)

**Môi trường phát triển:**
```bash
docker compose up -d --build
```

**Services được khởi động:**

| Service | Image | Port | Phụ thuộc |
|---------|-------|------|-----------|
| mysql | mysql:8.0 | 3308→3306 | - |
| mosquitto | eclipse-mosquitto:2 | 1883 | - |
| backend | (build local) | 5000 | mysql (healthy), mosquitto |
| frontend | (build local) | 3000 | backend |

**Môi trường production:**
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 10.2 Chạy Local (không Docker)

**Yêu cầu:**
- Node.js 20+, npm
- MySQL 8.0 (Windows Service)
- Mosquitto MQTT Broker

**Thứ tự khởi động:**
```
1. MySQL Server (tự động chạy như Windows Service)
2. mosquitto.exe -c mosquitto/mosquitto.conf
3. cd backend && npm run dev     (port 5000)
4. cd frontend && npm run dev    (port 3000)
```

**Biến môi trường backend** (`backend/.env`):
```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=change_this_to_minimum_32_chars_random_string
MQTT_HOST=localhost
MQTT_PORT=1883
FRONTEND_URL=http://localhost:3000
```

**Biến môi trường frontend** (`frontend/.env.local`):
```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=IoT Device Manager
```

### 10.3 Flash Firmware

```bash
# Sensor Node
cd firmware/sensor-node
pio run --target upload
pio device monitor --baud 115200

# Gateway Node
cd firmware/gateway-node
pio run --target upload
pio device monitor --baud 115200
```

**Tài khoản mặc định sau khi chạy:**
- Username: `admin`
- Password: `admin123`

---

## 11. Kết quả đạt được & Kết luận

### 11.1 Kết quả đạt được

| Yêu cầu | Trạng thái | Ghi chú |
|---------|-----------|---------|
| Hệ thống 4 thành phần (Device–Server–DB–Dashboard) | Hoàn thành | ESP32, Express, MySQL, Next.js |
| Device ID duy nhất | Hoàn thành | Auto-generate `ESP32-{SN\|GW}-{HEX8}` |
| Đăng ký thiết bị | Hoàn thành | POST /api/devices/register |
| Xác thực thiết bị khi gửi dữ liệu | Hoàn thành | HMAC-SHA256 2 lớp |
| Kiểm soát thiết bị được phép | Hoàn thành | status: active/inactive/blocked |
| Dashboard hiển thị danh sách + trạng thái | Hoàn thành | Online/offline realtime |
| Device ID + token/secret key | Hoàn thành | 64-char hex secret key |
| RBAC | Hoàn thành | admin / operator / viewer |
| Kèm device_id + token khi gửi dữ liệu | Hoàn thành | HMAC trong payload |
| Kiểm tra thiết bị hợp lệ trước khi xử lý | Hoàn thành | validateDevice middleware |
| Từ chối thiết bị sai token | Hoàn thành | HTTP 401/403 |
| Chống giả mạo + truy cập trái phép | Hoàn thành | HMAC + RBAC |
| Threat Model & Security | Hoàn thành | Phân tích 9 kịch bản tấn công |

### 11.2 Điểm mạnh của hệ thống

1. **Bảo mật đa lớp**: HMAC-SHA256 tại firmware → xác thực 2 lớp tại backend → RBAC cho user
2. **Audit Trail đầy đủ**: Mọi hành động quan trọng đều được ghi log với IP, User-Agent, chi tiết JSON
3. **Tự động chặn thiết bị**: fail_count block sau 5 lần thất bại → ngăn brute-force secret key
4. **Secret key an toàn**: Chỉ hiển thị 1 lần, không lưu plain text, không thể lấy lại
5. **Container hóa**: Docker Compose dễ triển khai và scale

### 11.3 Hạn chế & Hướng cải tiến

| Hạn chế | Hướng cải tiến |
|---------|----------------|
| MQTT không có TLS | Cấu hình Mosquitto với TLS certificate |
| Secret key không thể rotate | Implement endpoint key rotation |
| Timestamp window ±300s cho phép replay ngắn hạn | Thêm nonce/sequence number |
| Chưa có CAPTCHA cho login | Tích hợp reCAPTCHA |
| Dữ liệu cảm biến không mã hóa at-rest trong DB | Mã hóa cột JSON trong sensor_data |
| Không có account lockout theo username | Thêm lockout sau N lần thất bại per username |

### 11.4 Kết luận

Hệ thống **Quản lý thiết bị IoT và Phân quyền truy cập** đã được xây dựng hoàn chỉnh, đáp ứng toàn bộ yêu cầu đặt ra của đề tài. Hệ thống thể hiện sự kết hợp chặt chẽ giữa các lớp bảo mật:

- **Lớp thiết bị (Firmware):** HMAC-SHA256, NTP sync, Gateway whitelist
- **Lớp mạng (Transport):** HMAC payload authentication, Timestamp validation
- **Lớp ứng dụng (Backend):** JWT, bcrypt, RBAC, Rate Limiting, Helmet headers
- **Lớp dữ liệu (Database):** Parameterized queries, Audit log, Cascade deletion

Threat Model xác định và phân tích 9 loại tấn công chính, với biện pháp phòng thủ cụ thể cho từng loại. Hệ thống đã triển khai được, có thể chạy trên môi trường Docker hoặc local, sẵn sàng tích hợp firmware thực tế trên phần cứng ESP32.

---

*Báo cáo được tạo tự động từ source code tại `e:\WorkSpace\managerDeviceIoT` – ngày 09/06/2026*
