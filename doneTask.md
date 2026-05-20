# Done Tasks

---

## Task 1 – Thiết lập môi trường & cấu trúc dự án

**Branch:** `setup/project-environment`
**Ngày hoàn thành:** 2026-05-18

---

### 1. Cấu trúc thư mục monorepo

Xác nhận đầy đủ các thư mục gốc:

```
managerDeviceIoT/
├── backend/        # Node.js + Express API server
├── frontend/       # Next.js 14 Dashboard
├── firmware/       # ESP32 Sensor Node & Gateway Node
│   ├── sensor-node/
│   └── gateway-node/
├── docs/           # Tài liệu dự án
├── database/       # SQL migration files
├── mosquitto/      # Mosquitto broker config
└── scripts/        # Setup scripts
```

---

### 2. Backend – Cài đặt dependencies

Cài đủ **11 package** bắt buộc vào `backend/package.json`:

| Package | Version | Mục đích |
|---|---|---|
| `express` | ^5.2.1 | HTTP server, routing, middleware |
| `mysql2` | ^3.22.3 | MySQL driver hỗ trợ async/await, prepared statements |
| `jsonwebtoken` | ^9.0.3 | Cấp và xác minh JWT cho admin session |
| `bcrypt` | ^5.1.1 | Hash mật khẩu admin (cost factor 12) |
| `mqtt` | ^5.15.1 | MQTT client – kết nối Mosquitto broker |
| `helmet` | ^7.2.0 | HTTP security headers (XSS, CSRF, clickjacking) |
| `express-rate-limit` | ^7.5.1 | Rate limiting – chống brute force |
| `ws` | ^8.20.1 | WebSocket server – real-time update dashboard |
| `dotenv` | ^17.4.2 | Load biến môi trường từ .env |
| `uuid` | ^9.0.1 | Sinh UUID cho device ID và DB records |
| `cors` | ^2.8.6 | Cross-Origin Resource Sharing cho Next.js frontend |

Cài thêm **4 TypeScript type definitions** (devDependencies):

```
@types/jsonwebtoken  @types/bcrypt  @types/ws  @types/uuid
```

---

### 3. Cập nhật `backend/.env.example`

File template đầy đủ cho mọi thành viên clone repo:

```env
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT

# JWT
JWT_SECRET=change_this_to_a_long_random_secret_min_32_chars

# MQTT Broker
MQTT_HOST=localhost
MQTT_PORT=1883

# Admin default (seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

---

### 4. Cập nhật `backend/.env` (dev defaults)

`DB_HOST=mysql` và `MQTT_HOST=mosquitto` trỏ đúng tên service trong Docker Compose (không dùng localhost khi chạy trong container).

---

### 5. Cập nhật `.gitignore` gốc

Thêm 2 dòng bảo vệ file firmware chứa secret key ESP32:

```gitignore
# Firmware credentials - NEVER commit
firmware/**/config.h
firmware/**/config_gw.h
```

Các mục đã có sẵn: `node_modules/`, `.env`, `.env.local`, `dist/`, `.next/`

---

### 6. Cập nhật `docker-compose.yml`

Bổ sung **2 service còn thiếu** (`mysql` và `mosquitto`) vào file docker-compose.yml hiện có:

**Trước:** chỉ có `backend` + `frontend`

**Sau:** đủ 4 services:

| Service | Image | Port | Ghi chú |
|---|---|---|---|
| `mysql` | `mysql:8.0` | 3306 | Volume `mysql_data`, mount `database/migrations/` vào `docker-entrypoint-initdb.d` để tự chạy migration |
| `mosquitto` | `eclipse-mosquitto:2` | 1883 | Mount `mosquitto/mosquitto.conf` |
| `backend` | Build từ `Dockerfile.dev` | 5000 | `depends_on: mysql (healthy), mosquitto` |
| `frontend` | Build từ `Dockerfile.dev` | 3000 | `depends_on: backend` |

MySQL được cấu hình **healthcheck** để backend chỉ start sau khi DB sẵn sàng:

```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "iot_user", "-piot_password"]
  interval: 10s
  timeout: 5s
  retries: 5
```

Thêm **3 Docker volumes** named: `mysql_data`, `mosquitto_data`, `mosquitto_logs`

---

### 7. Tạo `mosquitto/mosquitto.conf`

File cấu hình Mosquitto cho môi trường dev:

```conf
listener 1883
allow_anonymous true

log_type all
log_dest stdout

persistence true
persistence_location /mosquitto/data/
```

---

### Checklist hoàn thành Task 1

- [x] Cấu trúc thư mục monorepo đầy đủ
- [x] `backend/package.json` có đủ 11 dependencies + 4 type defs
- [x] `backend/.env.example` có đủ tất cả biến môi trường
- [x] `backend/.env` cấu hình đúng cho Docker dev environment
- [x] `.gitignore` loại trừ `config.h` và `config_gw.h` firmware
- [x] `docker-compose.yml` có đủ 4 services với healthcheck
- [x] `mosquitto/mosquitto.conf` được tạo với listener 1883, allow_anonymous true

---

## Task 2 – Thiết kế & khởi tạo Database Schema

**Branch:** `db/schema-migration`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/config/db.ts` – Connection Pool

File kết nối MySQL dùng `mysql2/promise` với connection pool:

```typescript
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  timezone: "+00:00",
});

export default pool;
```

---

### 2. Tạo `database/migrations/001_schema.sql` – 5 Bảng

#### Bảng `users`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | INT UNSIGNED AI PK | |
| username | VARCHAR(64) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt cost 12 |
| role | ENUM(admin, operator, viewer) | DEFAULT viewer |
| created_at | DATETIME | DEFAULT NOW |
| last_login | DATETIME NULL | |

#### Bảng `devices`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | INT UNSIGNED AI PK | |
| device_id | VARCHAR(64) UNIQUE | ESP32-SN/GW-xxxxxxxx |
| device_name | VARCHAR(128) | |
| device_type | ENUM(sensor, gateway) | |
| secret_key | VARCHAR(64) | 32 random bytes hex |
| status | ENUM(inactive, active, blocked) | DEFAULT inactive |
| location | VARCHAR(255) NULL | |
| fail_count | TINYINT UNSIGNED | DEFAULT 0, auto-block >= 5 |
| last_seen | DATETIME NULL | online nếu < 60s |
| created_by | FK → users.id | ON DELETE SET NULL |

#### Bảng `sensor_data`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | BIGINT UNSIGNED AI PK | |
| device_id | FK → devices.id | CASCADE DELETE |
| gateway_id | FK → devices.id | CASCADE DELETE |
| payload | JSON | {temperature, humidity, ...} |
| received_at | DATETIME | DEFAULT NOW |

#### Bảng `device_tokens`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | BIGINT UNSIGNED AI PK | |
| device_id | FK → devices.id | CASCADE DELETE |
| token_hash | VARCHAR(255) | |
| expires_at | DATETIME | |
| revoked | TINYINT(1) | DEFAULT 0 |

#### Bảng `audit_log`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | BIGINT UNSIGNED AI PK | |
| event_type | VARCHAR(64) | DATA_RECV, AUTH_FAIL, DEVICE_BLOCKED, ... |
| device_id | FK → devices.id NULL | ON DELETE SET NULL |
| ip_address | VARCHAR(45) | Hỗ trợ IPv6 |
| user_agent | VARCHAR(512) NULL | |
| details | JSON NULL | |
| created_at | DATETIME | DEFAULT NOW |

---

### 3. Indexes

| Index | Bảng | Mục đích |
|---|---|---|
| `uq_devices_device_id` | devices | Tra cứu nhanh theo device_id (UNIQUE) |
| `idx_devices_status` | devices | Filter danh sách active/blocked |
| `idx_sensor_data_device_received` | sensor_data | Phân trang lịch sử theo device + thời gian |
| `idx_audit_log_event_created` | audit_log | Filter event_type + sắp xếp DESC |

---

### 4. Seed Admin

Admin mặc định được INSERT vào bảng `users` ngay trong file migration:

```sql
INSERT IGNORE INTO users (username, password_hash, role)
VALUES ('admin', '$2b$12$IbNzJkN3mOznQ4rNb9zjAOcrrfWfvqHMHYoaUKnCsCk0FdQPYetze', 'admin');
-- password: admin123, bcrypt cost 12
```

---

### 5. Tạo `backend/src/scripts/seed.ts`

Script seed dùng cho môi trường ngoài Docker (chạy `npm run seed`):
- Dùng `bcrypt.hash(ADMIN_PASSWORD, 12)` để sinh hash tại runtime
- Dùng `INSERT IGNORE` – không lỗi nếu admin đã tồn tại
- Đọc username/password từ biến môi trường `ADMIN_USERNAME`, `ADMIN_PASSWORD`

---

### Checklist hoàn thành Task 2

- [x] `backend/src/config/db.ts` – connection pool mysql2/promise
- [x] `database/migrations/001_schema.sql` – 5 bảng đúng cấu trúc
- [x] Đủ 4 indexes theo tài liệu
- [x] FK và cascade rules đúng (CASCADE DELETE / SET NULL)
- [x] Seed admin `admin/admin123` bcrypt cost 12
- [x] `backend/src/scripts/seed.ts` – seed script ngoài Docker
- [x] `package.json` thêm script `"seed": "ts-node src/scripts/seed.ts"`
- [x] Kiểm tra: `SHOW TABLES` → 5 bảng, `SELECT * FROM users` → thấy admin

---

## Task 3 – Backend: HMAC Service & Middleware xác thực thiết bị

**Branch:** `be/hmac-auth-service`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/services/auditLogger.ts`

Hàm tiện ích ghi nhật ký bảo mật vào bảng `audit_log`:

```typescript
log(event_type, device_id, ip, user_agent, details)
```

- Tham số `device_id` là **numeric FK** (`devices.id`) – không phải chuỗi `device_id`
- Serialize `details` sang JSON trước khi INSERT
- Bắt lỗi nội bộ bằng `try/catch` để audit không bao giờ làm crash request chính

---

### 2. Tạo `backend/src/services/hmacService.ts`

Service xác thực HMAC-SHA256 hai cấp:

#### `verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac)`
1. Tra bảng `devices` theo `device_id` (VARCHAR)
2. Kiểm tra cửa sổ timestamp: `|now/1000 - timestamp| <= 300s` → chống **Replay Attack**
3. Tính `HMAC-SHA256(secret_key, "gateway_id:timestamp")` → so sánh bằng `crypto.timingSafeEqual()` → chống **Timing Attack**

#### `verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac)`
- Logic tương tự cho sensor, message = `"sensor_id:timestamp"`

#### Các mã lỗi trả về:
| Error | Nguyên nhân |
|---|---|
| `NOT_FOUND` | device_id không tồn tại trong DB |
| `TIMESTAMP_EXPIRED` | timestamp ngoài cửa sổ ±300s |
| `HMAC_MISMATCH` | HMAC sai (sai secret hoặc giả mạo) |

---

### 3. Tạo `backend/src/middleware/validateDevice.ts`

Middleware Express thực hiện xác thực 2 cấp:

#### Cấp 1 – Gateway HMAC
- Thiếu field (`gateway_id`, `gw_timestamp`, `gw_hmac`) → `400 MISSING_GATEWAY_FIELDS`
- Xác thực HMAC fail → `401 GATEWAY_AUTH_FAIL` + ghi `audit_log` + tăng `fail_count`
- `fail_count >= 5` → `UPDATE status='blocked'` + ghi `DEVICE_BLOCKED`

#### Cấp 2 – Sensor HMAC
- Thiếu field (`sensor_id`, `sn_timestamp`, `sn_hmac`) → `400 MISSING_SENSOR_FIELDS`
- Xác thực HMAC fail → `401 SENSOR_AUTH_FAIL` + ghi `audit_log` + tăng `fail_count`
- `fail_count >= 5` → `UPDATE status='blocked'` + ghi `DEVICE_BLOCKED`

#### Khi xác thực thành công:
- Gắn `req.gateway` và `req.sensor` (object chứa `id`, `device_id`, `status`, `fail_count`) cho các handler phía sau dùng

---

### 4. Tạo `backend/src/routes/data.routes.ts`

Route `POST /api/device/data` dùng middleware `validateDevice`, thực hiện:
- Kiểm tra RBAC: `gateway_id` phải là `device_type='gateway'`, `sensor_id` phải là `device_type='sensor'`
- Kiểm tra cả hai thiết bị có `status='active'` (blocked → 403, inactive → 403)
- `INSERT sensor_data` với `{sensor_id, gateway_id, payload JSON}`
- `UPDATE devices SET last_seen=NOW(), fail_count=0` cho cả Gateway lẫn Sensor
- Ghi `audit_log` với `event_type='DATA_RECV'`
- Trả `200 {success: true, sensor_id, gateway_id, received_at}`

---

### 5. Cập nhật `backend/src/routes/index.ts`

Đăng ký route mới:

```typescript
router.use("/device/data", dataRoutes);
```

---

### Checklist hoàn thành Task 3

- [x] `src/services/auditLogger.ts` – hàm `log()` ghi audit_log
- [x] `src/services/hmacService.ts` – `verifyGatewayHMAC()` và `verifyDeviceHMAC()`
- [x] Kiểm tra timestamp window ±300s chống Replay Attack
- [x] So sánh HMAC bằng `crypto.timingSafeEqual()` chống Timing Attack
- [x] `src/middleware/validateDevice.ts` – xác thực 2 cấp GW → SN
- [x] Auto-block thiết bị khi `fail_count >= 5`
- [x] Ghi audit log cho mọi sự kiện: `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`, `DATA_RECV`
- [x] `src/routes/data.routes.ts` – `POST /api/device/data` với RBAC + status check + lưu DB
- [x] `routes/index.ts` đăng ký route `/api/device/data`
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 4 – Backend: Admin Authentication (Login & JWT)

**Branch:** `be/admin-authentication`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/middleware/verifyJWT.ts`

Middleware đọc JWT từ `httpOnly` cookie và gắn thông tin user vào request:

```typescript
verifyJWT(req, res, next)
```

- Parse cookie header thủ công (không cần thêm dependency `cookie-parser`)
- Gọi `jwt.verify(token, JWT_SECRET)` để xác minh chữ ký và thời hạn
- Gắn `req.user = { id, username, role }` cho các handler phía sau
- Thiếu cookie → `401 NO_TOKEN`
- Token sai / hết hạn → `401 INVALID_TOKEN`

---

### 2. Tạo `backend/src/middleware/rbac.ts`

Higher-order middleware kiểm tra quyền theo role:

```typescript
requireRole(...roles: string[])
```

- Nhận danh sách role được phép vào route (`'admin'`, `'operator'`, `'viewer'`)
- Đọc `req.user.role` (đã được `verifyJWT` gắn trước đó)
- Role không khớp → `403 FORBIDDEN`
- Ví dụ sử dụng: `router.post('/register', verifyJWT, requireRole('admin', 'operator'), handler)`

---

### 3. Tạo `backend/src/routes/auth.ts`

Ba endpoint xác thực admin:

#### `POST /api/auth/login`
| Bước | Chi tiết |
|---|---|
| Validate input | Thiếu `username` hoặc `password` → `400 MISSING_FIELDS` |
| Tra DB | `SELECT id, username, password_hash, role FROM users WHERE username = ?` |
| So sánh mật khẩu | `bcrypt.compare(password, password_hash)` |
| Chống timing attack | Nếu user không tồn tại → vẫn chạy `bcrypt.compare()` với dummy hash để tránh user enumeration qua thời gian phản hồi |
| Thành công | Ký JWT payload `{ id, username, role }`, expires `8h` |
| Set cookie | `httpOnly: true`, `sameSite: strict`, `maxAge: 8h` |
| Cập nhật DB | `UPDATE users SET last_login = NOW()` |
| Response | `{ success: true, user: { id, username, role } }` |
| Thất bại | `401 INVALID_CREDENTIALS` (không tiết lộ user có tồn tại hay không) |

#### `POST /api/auth/logout`
- `res.clearCookie('token')` → xóa cookie phía client
- Response: `{ success: true }`

#### `GET /api/auth/me`
- Bảo vệ bằng `verifyJWT`
- Trả thông tin user hiện tại từ JWT payload: `{ user: { id, username, role } }`

---

### 4. Cập nhật `backend/src/routes/index.ts`

Đăng ký auth routes:

```typescript
import authRoutes from "./auth";
router.use("/auth", authRoutes);
```

---

### Checklist hoàn thành Task 4

- [x] `src/middleware/verifyJWT.ts` – đọc cookie `token`, verify JWT, gắn `req.user`
- [x] `src/middleware/rbac.ts` – `requireRole(...roles)` kiểm tra role, trả 403 nếu không đủ quyền
- [x] `POST /api/auth/login` – bcrypt compare, ký JWT 8h, set httpOnly cookie
- [x] `POST /api/auth/logout` – clear cookie
- [x] `GET /api/auth/me` – trả thông tin user từ JWT (bảo vệ bởi verifyJWT)
- [x] Chống timing attack (user enumeration) tại login
- [x] `routes/index.ts` đăng ký route `/api/auth`
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 5 – Backend: Device Management API (CRUD Thiết Bị)

**Branch:** `be/device-management`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/routes/devices.ts`

File route quản lý thiết bị đầy đủ với 5 endpoints:

#### `POST /api/devices/register` – admin / operator

| Bước | Chi tiết |
|---|---|
| Validate input | Thiếu `device_name` hoặc `device_type` → `400 MISSING_FIELDS` |
| Validate type | `device_type` không phải `sensor` / `gateway` → `400 INVALID_DEVICE_TYPE` |
| Sinh `device_id` | `ESP32-SN-{8 hex hoa}` cho sensor, `ESP32-GW-{8 hex hoa}` cho gateway – dùng `crypto.randomBytes(4)` |
| Sinh `secret_key` | `crypto.randomBytes(32).toString('hex')` – 64 ký tự hex |
| INSERT DB | Trạng thái khởi tạo `inactive`, `fail_count = 0` |
| Ghi audit log | `event_type = 'DEVICE_REGISTER'` kèm `device_id`, `device_name`, `registered_by` |
| Response | `201` trả đầy đủ `{ device_id, secret_key, ... }` – **duy nhất 1 lần** |

#### `GET /api/devices` – mọi user đã xác thực

- Lấy toàn bộ danh sách thiết bị, sắp xếp `created_at DESC`
- Tính `is_online` trực tiếp trong SQL:
  ```sql
  CASE WHEN last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60
       THEN TRUE ELSE FALSE END AS is_online
  ```

#### `GET /api/devices/:id` – mọi user đã xác thực

- Trả chi tiết thiết bị + trường `is_online`
- Kèm **10 bản ghi `sensor_data` gần nhất** (`ORDER BY received_at DESC LIMIT 10`)
- Không tìm thấy → `404 DEVICE_NOT_FOUND`

#### `GET /api/devices/:id/data` – mọi user đã xác thực (thêm bởi linter)

- Lịch sử `sensor_data` có phân trang: `?page=1&limit=50` (giới hạn tối đa 200)
- JOIN với bảng `devices` để lấy `gateway_device_id` (chuỗi device_id của gateway)
- Trả kèm metadata phân trang: `{ page, limit, total, total_pages }`

#### `PATCH /api/devices/:id/status` – admin / operator

- Validate: `status` phải là `active` / `blocked` / `inactive` → `400 INVALID_STATUS`
- Không tìm thấy thiết bị → `404 DEVICE_NOT_FOUND`
- `UPDATE devices SET status = ?`
- Ghi audit log `event_type = 'DEVICE_STATUS_CHANGE'` kèm `new_status`, `changed_by`

#### `DELETE /api/devices/:id` – admin only

Xóa cascade theo thứ tự an toàn (con trước, cha sau):

1. `DELETE FROM sensor_data WHERE device_id = ?`
2. `DELETE FROM device_tokens WHERE device_id = ?`
3. `DELETE FROM devices WHERE id = ?`

- Ghi audit log `event_type = 'DEVICE_DELETE'` kèm `deleted_device_id`, `device_name`, `deleted_by`

---

### 2. Bảo mật

| Điểm | Cách xử lý |
|---|---|
| SQL Injection | Toàn bộ queries dùng parameterized statements `pool.execute(sql, [params])` |
| `secret_key` | Chỉ trả về đúng 1 lần tại `POST /register` – không bao giờ xuất hiện trong các GET |
| RBAC | `register` + `status` yêu cầu `admin/operator`; `delete` chỉ `admin` |
| Audit trail | Mọi thao tác thay đổi (register, status change, delete) đều ghi `audit_log` |
| IP tracking | Hỗ trợ `x-forwarded-for` header (qua reverse proxy) |

---

### 3. Cập nhật `backend/src/routes/index.ts`

Đăng ký device routes:

```typescript
import deviceRoutes from "./devices";
router.use("/devices", deviceRoutes);
```

---

### Checklist hoàn thành Task 5

- [x] `POST /api/devices/register` – sinh `device_id` + `secret_key`, INSERT DB, ghi audit log, trả credentials 1 lần
- [x] `GET /api/devices` – danh sách + `is_online` tính từ `last_seen < 60s`
- [x] `GET /api/devices/:id` – chi tiết + 10 bản ghi `sensor_data` gần nhất
- [x] `GET /api/devices/:id/data` – lịch sử phân trang với `gateway_device_id`
- [x] `PATCH /api/devices/:id/status` – đổi status, ghi audit log
- [x] `DELETE /api/devices/:id` – xóa cascade (sensor_data → device_tokens → devices)
- [x] Toàn bộ queries dùng parameterized statements
- [x] `routes/index.ts` đăng ký route `/api/devices`
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 6 – Backend: Data Ingestion API (Nhận dữ liệu từ Gateway)

**Branch:** `be/data-ingestion`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Cập nhật `backend/src/routes/data.routes.ts`

Hoàn thiện endpoint `POST /api/device/data` từ placeholder Task 3 thành luồng ingestion đầy đủ.

#### Luồng xử lý request

| Bước | Hành động | Lỗi trả về |
|---|---|---|
| 1 | Middleware `validateDevice` xác thực HMAC 2 cấp (GW → SN) | `400 MISSING_*_FIELDS`, `401 GATEWAY/SENSOR_AUTH_FAIL` |
| 2 | Validate `data` trong body phải là object | `400 MISSING_PAYLOAD_DATA` |
| 3 | Truy vấn DB lấy `device_type` + `status` mới nhất của cả 2 thiết bị (1 query duy nhất) | — |
| 4 | Kiểm tra RBAC `device_type`: gateway phải là `'gateway'`, sensor phải là `'sensor'` | `403 INVALID_DEVICE_TYPE` |
| 5 | Kiểm tra `status='active'` cho cả 2 thiết bị | `403 DEVICE_BLOCKED` hoặc `403 DEVICE_NOT_ACTIVE` |
| 6 | `INSERT INTO sensor_data` với `(sensor.id, gateway.id, JSON.stringify(data))` | — |
| 7 | `UPDATE devices SET last_seen=NOW(), fail_count=0` cho cả GW lẫn SN (1 query duy nhất) | — |
| 8 | Ghi `audit_log` với `event_type='DATA_RECV'` | — |
| 9 | Trả `200 { success, sensor_id, gateway_id, received_at }` | — |

---

### 2. Bảng tổng hợp lỗi

| Trường hợp | HTTP | Error code |
|---|---|---|
| Thiếu `gateway_id`, `gw_timestamp`, `gw_hmac` | 400 | `MISSING_GATEWAY_FIELDS` |
| Thiếu `sensor_id`, `sn_timestamp`, `sn_hmac` | 400 | `MISSING_SENSOR_FIELDS` |
| Thiếu hoặc sai kiểu trường `data` | 400 | `MISSING_PAYLOAD_DATA` |
| HMAC gateway sai / hết hạn / không tìm thấy | 401 | `GATEWAY_AUTH_FAIL` |
| HMAC sensor sai / hết hạn / không tìm thấy | 401 | `SENSOR_AUTH_FAIL` |
| `gateway_id` có `device_type != 'gateway'` | 403 | `INVALID_DEVICE_TYPE` |
| `sensor_id` có `device_type != 'sensor'` | 403 | `INVALID_DEVICE_TYPE` |
| Thiết bị có `status = 'blocked'` | 403 | `DEVICE_BLOCKED` |
| Thiết bị có `status = 'inactive'` | 403 | `DEVICE_NOT_ACTIVE` |

---

### 3. Cấu trúc request hợp lệ

```json
{
  "gateway_id":   "ESP32-GW-A1B2C3D4",
  "gw_timestamp": 1716115200,
  "gw_hmac":      "a3f...64-char-hex",
  "sensor_id":    "ESP32-SN-E5F6G7H8",
  "sn_timestamp": 1716115200,
  "sn_hmac":      "9c2...64-char-hex",
  "data": {
    "temperature": 26.5,
    "humidity": 63.2
  }
}
```

---

### 4. Cấu trúc response thành công

```json
{
  "success": true,
  "sensor_id":   "ESP32-SN-E5F6G7H8",
  "gateway_id":  "ESP32-GW-A1B2C3D4",
  "received_at": "2026-05-19T08:00:00.000Z"
}
```

---

### 5. Điểm bảo mật

| Điểm | Cách xử lý |
|---|---|
| HMAC giả mạo | Middleware `validateDevice` – `crypto.timingSafeEqual()` chống Timing Attack |
| Replay Attack | Cửa sổ timestamp ±300s trong `hmacService` |
| Brute force | Auto-block sau 5 lần fail (`fail_count >= 5`) |
| RBAC device type | Xác minh `device_type` bằng DB query – không tin vào dữ liệu client |
| Thiết bị bị khóa | Kiểm tra `status` từ DB (luôn mới nhất) sau khi middleware pass |
| SQL Injection | Toàn bộ queries dùng parameterized statements `pool.execute(sql, [params])` |

---

### Checklist hoàn thành Task 6

- [x] `POST /api/device/data` – middleware `validateDevice` xác thực HMAC 2 cấp
- [x] Validate `data` object trong body – `400 MISSING_PAYLOAD_DATA` nếu thiếu
- [x] Kiểm tra RBAC `device_type`: gateway phải `'gateway'`, sensor phải `'sensor'` → `403`
- [x] Kiểm tra `status='active'` cả 2 thiết bị – blocked → `403`, inactive → `403`
- [x] `INSERT sensor_data (device_id, gateway_id, payload)` vào DB
- [x] `UPDATE devices SET last_seen=NOW(), fail_count=0` cho cả GW lẫn SN
- [x] Ghi `audit_log` với `event_type='DATA_RECV'`
- [x] Trả `200 { success, sensor_id, gateway_id, received_at }`
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 7 – Backend: Dashboard Stats & Audit Log API

**Branch:** `be/dashboard-audit-api`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/services/deviceStatus.ts`

Service tiện ích quản lý trạng thái online của thiết bị:

#### `isOnline(lastSeen)`
- Nhận `Date | string | null`, tính hiệu thời gian với `Date.now()`
- Trả `true` nếu `lastSeen < 60 giây` trước, ngược lại `false`

#### Heartbeat Monitor (in-memory cache)
- Biến module-level `onlineDeviceIds: Set<number>` — lưu danh sách `id` các thiết bị online
- Hàm `startHeartbeatMonitor()`: chạy ngay lập tức lần đầu, sau đó lặp mỗi **30 giây** bằng `setInterval`
- Mỗi tick: query DB `TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60` → cập nhật set
- **Không đổi DB** — chỉ dùng để phục vụ API response, lỗi query được bắt im lặng
- Xuất thêm `isOnlineFromCache(deviceId)` và `getOnlineDeviceIds()` cho các module khác dùng nếu cần

---

### 2. Tạo `backend/src/routes/dashboard.ts`

#### `GET /api/dashboard/stats` – bảo vệ bởi `verifyJWT`

Truy vấn **2 SQL** song song:

| Query | Nội dung |
|---|---|
| Aggregation trên bảng `devices` | `SUM(device_type = 'gateway')`, `SUM(device_type = 'sensor')`, `SUM(... AND TIMESTAMPDIFF < 60)` cho từng loại |
| COUNT trên bảng `sensor_data` | Tổng số bản ghi data points đã nhận |

Response:

```json
{
  "total_gateways": 3,
  "total_sensors": 8,
  "online_gateways": 2,
  "online_sensors": 5,
  "total_data_points": 14820
}
```

- Dùng `COALESCE(..., 0)` trong SQL → đảm bảo trả về `0` thay vì `null` khi bảng rỗng
- Cast kết quả sang `Number()` vì MySQL trả BigInt dưới dạng string với một số driver

---

### 3. Tạo `backend/src/routes/audit.ts`

#### `GET /api/audit-log` – bảo vệ bởi `verifyJWT`

Hỗ trợ **4 query parameter** lọc động:

| Param | Kiểu | Mô tả |
|---|---|---|
| `event_type` | string | Lọc đúng khớp: `DATA_RECV`, `AUTH_FAIL`, `DEVICE_BLOCKED`, ... |
| `device_id` | number | `id` nội bộ của thiết bị (FK) |
| `from` | ISO 8601 string | `created_at >= from` |
| `to` | ISO 8601 string | `created_at <= to` |

- Build WHERE clause động: chỉ thêm điều kiện khi param được truyền vào
- Dùng `pool.query()` thay vì `pool.execute()` cho query động (tránh giới hạn server-side prepared statements)
- Validate `device_id` phải là số nguyên dương → `400 INVALID_DEVICE_ID`
- Validate `from`/`to` là ngày hợp lệ → `400 INVALID_FROM_DATE` / `400 INVALID_TO_DATE`
- JOIN với `devices` để lấy `device_identifier` (chuỗi `device_id`) và `device_name`
- Sắp xếp `ORDER BY a.created_at DESC`, giới hạn `LIMIT 500`

Response:

```json
{
  "audit_log": [
    {
      "id": 42,
      "event_type": "DATA_RECV",
      "device_id": 3,
      "device_identifier": "ESP32-SN-A1B2C3D4",
      "device_name": "Sensor phòng lab",
      "ip_address": "192.168.1.10",
      "user_agent": "ESP32HTTPClient/1.0",
      "details": { "gateway_id": "ESP32-GW-...", "data_id": 120 },
      "created_at": "2026-05-19T08:00:00.000Z"
    }
  ]
}
```

---

### 4. Cập nhật `backend/src/routes/devices.ts`

Thêm endpoint `GET /api/devices/:id/data` — lịch sử sensor_data có phân trang:

| Query param | Mặc định | Giới hạn |
|---|---|---|
| `page` | 1 | tối thiểu 1 |
| `limit` | 50 | tối đa 200 |

- Kiểm tra thiết bị tồn tại → `404 DEVICE_NOT_FOUND` nếu không có
- Đếm tổng bản ghi (`COUNT(*)`) để tính `total_pages`
- JOIN với `devices` để lấy `gateway_device_id` (chuỗi `device_id` của gateway) kèm mỗi record
- Đặt route **trước** `GET /:id` trong file để Express khớp đúng (tránh "data" bị hiểu là `:id`)

Response:

```json
{
  "data": [
    {
      "id": 120,
      "device_id": 3,
      "gateway_id": 1,
      "gateway_device_id": "ESP32-GW-A1B2C3D4",
      "payload": { "temperature": 26.5, "humidity": 63.2 },
      "received_at": "2026-05-19T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 320,
    "total_pages": 7
  }
}
```

---

### 5. Cập nhật `backend/src/routes/index.ts`

Đăng ký 2 router mới:

```typescript
import dashboardRoutes from "./dashboard";
import auditRoutes    from "./audit";

router.use("/dashboard", dashboardRoutes);
router.use("/audit-log", auditRoutes);
```

---

### 6. Cập nhật `backend/src/server.ts`

Gọi `startHeartbeatMonitor()` ngay sau khi server bắt đầu lắng nghe:

```typescript
import { startHeartbeatMonitor } from "./services/deviceStatus";

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startHeartbeatMonitor();
});
```

---

### Tóm tắt API endpoints mới

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | JWT | Thống kê tổng quan hệ thống |
| `GET` | `/api/devices/:id/data` | JWT | Lịch sử sensor_data phân trang |
| `GET` | `/api/audit-log` | JWT | Nhật ký bảo mật, lọc đa điều kiện |

---

### Checklist hoàn thành Task 7

- [x] `src/services/deviceStatus.ts` – `isOnline()`, `startHeartbeatMonitor()` (setInterval 30s, không đổi DB)
- [x] `GET /api/dashboard/stats` – tổng GW, SN, online GW, online SN, tổng data points
- [x] `GET /api/audit-log` – filter `event_type`, `device_id`, `from`, `to`; DESC; LIMIT 500
- [x] `GET /api/devices/:id/data` – phân trang `page`+`limit`, kèm `gateway_device_id`
- [x] Validate query params (device_id phải là số, date phải parse được)
- [x] Route `/:id/data` đặt trước `/:id` để Express routing đúng thứ tự
- [x] `routes/index.ts` đăng ký `/dashboard` và `/audit-log`
- [x] `server.ts` khởi động heartbeat monitor cùng lúc server start
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 8 – Backend: Security Hardening

**Branch:** `be/security-hardening`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Tạo `backend/src/config/env.ts` – Validate env vars khi startup

File mới tập trung toàn bộ logic khởi động môi trường:

- Gọi `dotenv.config()` ngay tại module level → load `.env` trước mọi module khác
- Định nghĩa danh sách **6 biến bắt buộc**: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `PORT`
- Kiểm tra từng biến: nếu thiếu → in danh sách thiếu ra stderr và gọi `process.exit(1)`
- Kiểm tra thêm: `JWT_SECRET` phải dài tối thiểu **32 ký tự** → crash nếu quá ngắn
- Tự động gọi `validateEnv()` khi module được import (không cần gọi thủ công)

```typescript
const REQUIRED_ENV_VARS = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME", "JWT_SECRET", "PORT"];

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`[startup] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET!.trim().length < 32) {
    console.error("[startup] JWT_SECRET must be at least 32 characters");
    process.exit(1);
  }
}

validateEnv(); // auto-validate on import
```

---

### 2. Cập nhật `backend/src/server.ts` – Import env.ts làm import đầu tiên

Đặt `import "./config/env"` là dòng đầu tiên trong `server.ts`. Với CommonJS (TypeScript compile target), lệnh `require()` chạy theo thứ tự khai báo, nên `env.ts` được load và validate trước khi `app.ts` (và `db.ts`) chạy.

```typescript
import "./config/env"; // loads .env và validates – phải là import đầu tiên
import app from "./app";
import { startHeartbeatMonitor } from "./services/deviceStatus";
```

---

### 3. Cập nhật `backend/src/app.ts` – Helmet, CORS, Rate Limiters, Body Limit

#### 3.1 HTTP Security Headers – `helmet()`

```typescript
app.use(helmet());
```

`helmet()` mặc định bật đồng thời nhiều header bảo vệ:

| Header | Bảo vệ |
|---|---|
| `Content-Security-Policy` | Chống XSS – giới hạn nguồn script/style được phép load |
| `X-Frame-Options: SAMEORIGIN` | Chống Clickjacking – chặn iframe nhúng từ domain khác |
| `X-Content-Type-Options: nosniff` | Chống MIME sniffing – buộc browser tôn trọng Content-Type |
| `Referrer-Policy` | Không gửi URL referrer ra ngoài domain |
| `X-DNS-Prefetch-Control: off` | Tắt DNS prefetch |

---

#### 3.2 CORS – Chỉ cho phép frontend origin

Thay `cors()` mặc định (cho phép tất cả) bằng cấu hình chặt chẽ:

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true, // cho phép gửi httpOnly cookie
}));
```

- Đọc origin từ biến môi trường `FRONTEND_URL` → dễ thay đổi khi deploy production
- `credentials: true` bắt buộc để browser gửi cookie JWT cùng request

---

#### 3.3 Body Size Limit

```typescript
app.use(express.json({ limit: "10kb" }));
```

Ngăn chặn tấn công Payload-based DoS bằng cách từ chối body JSON lớn hơn 10 KB.

---

#### 3.4 Rate Limiters – 3 tầng

| Limiter | Path | Giới hạn | Mục đích |
|---|---|---|---|
| `authLimiter` | `/api/auth/login` | 10 req / 15 phút / IP | Chống brute force mật khẩu |
| `deviceDataLimiter` | `/api/device/data` | 60 req / phút / IP | Giới hạn tần suất ESP32 gửi data |
| `apiLimiter` | `/api/*` (trừ `/api/device/data`) | 100 req / 15 phút / IP | Bảo vệ admin API |

Chi tiết cấu hình:
- `standardHeaders: true` → trả về `RateLimit-*` headers theo RFC 6585
- `legacyHeaders: false` → tắt `X-RateLimit-*` headers cũ
- `message` rõ ràng: `{ error: "TOO_MANY_REQUESTS", detail: "..." }`
- `apiLimiter` dùng `skip` function để bỏ qua `/api/device/data` (đã có limiter riêng)

Thứ tự mount middleware trong `app.ts`:

```typescript
app.use("/api/auth/login", authLimiter);
app.use("/api/device/data", deviceDataLimiter);
app.use("/api", apiLimiter);
app.use("/api", routes);
```

---

### 4. Cập nhật `backend/src/routes/auth.ts` – Input Sanitization

Tại `POST /api/auth/login`, thay vì dùng trực tiếp `req.body.username`:

```typescript
const username = typeof raw.username === "string" ? raw.username.trim().slice(0, 64) : "";
const password = typeof raw.password === "string" ? raw.password.slice(0, 128) : "";
```

| Field | Xử lý | Giới hạn |
|---|---|---|
| `username` | `typeof` check + `trim()` + `slice()` | Tối đa 64 ký tự |
| `password` | `typeof` check + `slice()` (không trim – mật khẩu có thể có khoảng trắng hợp lệ) | Tối đa 128 ký tự |

---

### 5. Cập nhật `backend/src/routes/devices.ts` – Input Sanitization

Thêm helper function `sanitize()` dùng chung trong file:

```typescript
function sanitize(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}
```

Tại `POST /api/devices/register`, áp dụng sanitize cho tất cả string input:

```typescript
const device_name = sanitize(raw.device_name, 128);
const device_type = sanitize(raw.device_type, 16);
const location    = raw.location ? sanitize(raw.location, 256) || null : null;
```

| Field | Giới hạn | Ghi chú |
|---|---|---|
| `device_name` | 128 ký tự | Bắt buộc – trả `400 MISSING_FIELDS` nếu rỗng sau trim |
| `device_type` | 16 ký tự | Bắt buộc – validate thêm là `sensor`/`gateway` |
| `location` | 256 ký tự | Tùy chọn – `null` nếu không truyền hoặc rỗng sau trim |

---

### 6. Cập nhật `backend/.env.example` – Thêm FRONTEND_URL

```env
# CORS – URL của Next.js frontend (mặc định http://localhost:3000 nếu không set)
FRONTEND_URL=http://localhost:3000
```

Thêm ghi chú nhắc nhở về `JWT_SECRET`:

```env
# JWT (tối thiểu 32 ký tự – server sẽ crash khi start nếu ngắn hơn)
JWT_SECRET=change_this_to_a_long_random_secret_min_32_chars
```

---

### Bảng tổng hợp bảo vệ

| Tấn công / Rủi ro | Cơ chế bảo vệ |
|---|---|
| XSS | `helmet()` – `Content-Security-Policy` |
| Clickjacking | `helmet()` – `X-Frame-Options: SAMEORIGIN` |
| MIME Sniffing | `helmet()` – `X-Content-Type-Options: nosniff` |
| CORS không kiểm soát | `cors({ origin: FRONTEND_URL })` – chỉ cho phép frontend đã biết |
| Brute Force Login | `authLimiter` – 10 req / 15 phút / IP → HTTP 429 |
| Payload DoS | `express.json({ limit: '10kb' })` – từ chối body quá lớn |
| Thiếu env vars | `validateEnv()` – crash ngay startup, không chạy với config thiếu |
| JWT_SECRET yếu | `validateEnv()` – kiểm tra tối thiểu 32 ký tự |
| Input quá dài / sai kiểu | `sanitize()` + `typeof` check – trim, giới hạn độ dài |
| Secret key bị log | Code không bao giờ log `secret_key` (chỉ trả về 1 lần tại register, không vào audit_log) |

---

### Checklist hoàn thành Task 8

- [x] `src/config/env.ts` – validate 6 biến bắt buộc + độ dài JWT_SECRET khi startup
- [x] `server.ts` – `import "./config/env"` là import đầu tiên
- [x] `app.ts` – `helmet()` bật đầy đủ security headers
- [x] `app.ts` – CORS chỉ cho phép `FRONTEND_URL` (default `http://localhost:3000`), `credentials: true`
- [x] `app.ts` – `express.json({ limit: '10kb' })` giới hạn body size
- [x] `app.ts` – `authLimiter`: 10 req/15 phút/IP trên `/api/auth/login`
- [x] `app.ts` – `deviceDataLimiter`: 60 req/phút/IP trên `/api/device/data`
- [x] `app.ts` – `apiLimiter`: 100 req/15 phút/IP trên toàn bộ `/api` còn lại
- [x] `auth.ts` – sanitize `username` (trim, max 64) và `password` (max 128)
- [x] `devices.ts` – helper `sanitize()` + áp dụng cho `device_name` (128), `device_type` (16), `location` (256)
- [x] `.env.example` – thêm `FRONTEND_URL`, ghi chú min-length `JWT_SECRET`
- [x] `secret_key` không bao giờ bị log ra console hoặc audit_log
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)

---

## Task 9 – Frontend: Setup Next.js & Trang Login

**Branch:** `fe/setup-login`
**Ngày hoàn thành:** 2026-05-19

---

### 1. Cài đặt dependencies

Cài thêm **5 package** vào `frontend/package.json`:

| Package | Mục đích |
|---|---|
| `swr` | Data fetching + polling real-time (dùng từ Task 10) |
| `axios` | HTTP client gọi backend API |
| `recharts` | Biểu đồ sensor (dùng từ Task 12) |
| `lucide-react` | Icon set cho Sidebar và UI |
| `socket.io-client` | WebSocket real-time (dùng từ Task 10) |

---

### 2. Cập nhật `frontend/next.config.ts` – Proxy Rewrites

Thêm `rewrites()` để forward toàn bộ `/api/*` tới backend (port 5000):

```typescript
async rewrites() {
  return [
    {
      source: "/api/:path*",
      destination: `${process.env.BACKEND_URL || "http://localhost:5000"}/api/:path*`,
    },
  ];
},
```

Lợi ích:
- Tránh CORS issue hoàn toàn (request qua Next.js server)
- Cookie `httpOnly` do backend set sẽ được gán cho domain `localhost:3000` (frontend)
- Middleware phía Next.js có thể đọc được cookie để bảo vệ route

Biến môi trường `BACKEND_URL` được khai báo trong `frontend/.env.local`:
```env
BACKEND_URL=http://localhost:5000
```

---

### 3. Tạo `frontend/src/lib/axios.ts` – Axios Instance

```typescript
const api = axios.create({
  baseURL: "",          // dùng relative URL → đi qua Next.js proxy
  withCredentials: true, // tự động gửi httpOnly cookie theo mọi request
});

// Interceptor: 401 → redirect về /login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
```

---

### 4. Thay `frontend/src/lib/auth.ts` – Real Backend API

Xóa toàn bộ mock authentication, thay bằng 3 hàm gọi backend thực:

| Hàm | Endpoint | Mô tả |
|---|---|---|
| `login(username, password)` | `POST /api/auth/login` | Backend set `httpOnly` cookie `token` (8h) |
| `logout()` | `POST /api/auth/logout` | Backend clear cookie |
| `getUser()` | `GET /api/auth/me` | Trả `User` từ JWT; `null` nếu chưa login |

`AUTH_ROUTES`:
```typescript
export const AUTH_ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
} as const;
```

`AUTH_TOKEN_COOKIE` và `AUTH_ROUTES.forgotPassword` bị xóa (không dùng nữa).

---

### 5. Cập nhật `frontend/src/types/user.ts`

Thêm `role` vào User type để khớp với JWT payload từ backend:

```typescript
export type UserRole = "admin" | "operator" | "viewer";

export type User = {
  id: number;
  username: string;
  role: UserRole;
};
```

---

### 6. Tạo `frontend/src/middleware.ts` – Bảo vệ Route bằng JWT Cookie

```typescript
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token");
  const { pathname } = request.nextUrl;

  // Root redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL(token ? "/dashboard" : "/login", request.url));
  }

  // Chưa login + route không public → redirect /login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Đã login + vào /login → redirect /dashboard
  if (token && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|public).*)"],
};
```

Middleware đọc cookie `token` (httpOnly, set bởi backend) ở server-side nên hoạt động đúng khi `withCredentials + proxy`.

---

### 7. Cập nhật `frontend/src/contexts/AuthContext.tsx`

Thay mock `isAuthenticated()` bằng real backend call:

```typescript
useEffect(() => {
  getUser()
    .then(setUser)
    .finally(() => setLoading(false));
}, []);
```

- Loading state hiển thị spinner thay vì full-page block
- `login()` và `logout()` bây giờ là `async` (gọi API thực)
- Xóa tham số `remember` khỏi `login()` (backend JWT cố định 8h)

---

### 8. Cập nhật `frontend/src/app/login/page.tsx` – Trang Đăng Nhập

Trang đăng nhập được cập nhật:

- **UI tiếng Việt**: "Tên đăng nhập", "Mật khẩu", "Đang đăng nhập...", "Đăng nhập"
- **Xử lý lỗi** dùng `isAxiosError()` để phân biệt loại lỗi:

| HTTP Status | Thông báo hiển thị |
|---|---|
| `401` | "Sai tên đăng nhập hoặc mật khẩu." |
| `429` | "Quá nhiều lần thử. Vui lòng đợi và thử lại." |
| Network error | "Không thể kết nối đến máy chủ. Vui lòng thử lại." |

- Bỏ "Remember me" và "Forgot password?" (backend không hỗ trợ)
- Bỏ text demo credentials (không phù hợp production)

---

### 9. Xây dựng `frontend/src/components/Sidebar.tsx`

Sidebar đầy đủ theo yêu cầu Task 9:

**Navigation links** (với lucide-react icons):

| Label | Route | Icon |
|---|---|---|
| Dashboard | `/dashboard` | `LayoutDashboard` |
| Thiết bị | `/devices` | `Cpu` |
| Audit Log | `/audit` | `Shield` |
| Người dùng | `/users` | `Users` |

**Active state**: dùng `usePathname()` từ `next/navigation` để highlight link hiện tại.

**User info block**: hiển thị avatar chữ, `username`, `role` (dịch sang tiếng Việt: Quản trị viên / Vận hành / Xem).

**Nút Đăng xuất**: gọi `logout()` từ `useAuth()`, chuyển về `/login`.

---

### 10. Tạo `frontend/src/app/(dashboard)/layout.tsx`

Layout bao gồm Navbar (top) + Sidebar (left) + main content:

```
┌─────────────────────────────────────────┐
│              Navbar (fixed top 80px)    │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │      Main Content            │
│ (240px)  │      (flex-1)                │
│          │                              │
└──────────┴──────────────────────────────┘
```

Providers được wrap tại layout này (cần cho mock dashboard pages):
- `DevicesProvider` – mock device data context
- `AddDeviceProvider` – "Add Device" modal context

---

### 11. Migrate Route Group `(admin)` → `(dashboard)`

Toàn bộ pages từ `app/(admin)/` được chuyển vào `app/(dashboard)/`:

| Route cũ | Route mới | URL |
|---|---|---|
| `(admin)/dashboard/page.tsx` | `(dashboard)/dashboard/page.tsx` | `/dashboard` |
| `(admin)/devices/page.tsx` | `(dashboard)/devices/page.tsx` | `/devices` |
| `(admin)/devices/[id]/page.tsx` | `(dashboard)/devices/[id]/page.tsx` | `/devices/:id` |
| `(admin)/logs/page.tsx` | `(dashboard)/logs/page.tsx` | `/logs` |

Xóa thư mục `app/(admin)/` sau khi migrate để tránh duplicate route conflict.

---

### Luồng xác thực hoàn chỉnh

```
[Trình duyệt] GET /
  → Middleware: không có cookie token
  → Redirect → /login

[Trang login] POST /api/auth/login
  → Next.js proxy → Backend POST /api/auth/login
  → Backend: bcrypt.compare() → ký JWT → Set-Cookie: token=...; HttpOnly
  → AuthContext.login() → setUser() → router.replace("/dashboard")

[Trình duyệt] GET /dashboard
  → Middleware: cookie token tồn tại → NextResponse.next()
  → AuthContext: useEffect() → GET /api/auth/me → setUser({ id, username, role })
  → Sidebar hiển thị username + role

[Nút Đăng xuất]
  → AuthContext.logout() → POST /api/auth/logout → Backend clear cookie
  → setUser(null) → router.replace("/login")
```

---

### Checklist hoàn thành Task 9

- [x] Cài đủ 5 dependencies: `swr`, `axios`, `recharts`, `lucide-react`, `socket.io-client`
- [x] `next.config.ts` – rewrites proxy `/api/*` → `http://localhost:5000/api/*`
- [x] `src/lib/axios.ts` – axios instance với `withCredentials: true` và interceptor 401
- [x] `src/lib/auth.ts` – thay mock bằng real API calls (`login`, `logout`, `getUser`)
- [x] `src/types/user.ts` – `User` type có `id`, `username`, `role`
- [x] `src/middleware.ts` – bảo vệ route bằng cookie `token`, redirect `/login` khi chưa auth
- [x] `src/contexts/AuthContext.tsx` – dùng `GET /api/auth/me` để khôi phục session
- [x] `src/app/login/page.tsx` – form tiếng Việt, phân biệt lỗi 401/429/network
- [x] `src/components/Sidebar.tsx` – 4 nav links, active state, username+role, nút đăng xuất
- [x] `src/app/(dashboard)/layout.tsx` – Navbar + Sidebar + DevicesProvider + AddDeviceProvider
- [x] Migrate `(admin)` → `(dashboard)`, xóa route group cũ
- [x] TypeScript compile không lỗi (`tsc --noEmit` pass)
- [x] Kiểm tra: login đúng → vào được `/dashboard`, login sai → hiện lỗi tiếng Việt, truy cập `/` chưa login → redirect `/login`

---

## Task 10 – Frontend: Dashboard & Danh Sách Thiết Bị

**Branch:** `fe/dashboard-device-list`
**Ngày hoàn thành:** 2026-05-20

---

### 1. Tạo `frontend/src/types/api.ts` – Kiểu dữ liệu API

Định nghĩa kiểu TypeScript khớp với response thực của backend:

```typescript
export type ApiDeviceStatus = "active" | "inactive" | "blocked";
export type ApiDeviceType   = "sensor" | "gateway";

export type ApiDevice = {
  id:          number;
  device_id:   string;       // "ESP32-SN-XXXXXXXX" / "ESP32-GW-XXXXXXXX"
  device_name: string;
  device_type: ApiDeviceType;
  status:      ApiDeviceStatus;
  location:    string;
  last_seen:   string | null; // ISO 8601 datetime hoặc null nếu chưa kết nối
  fail_count:  number;
  created_by:  number;
};

export type DashboardStats = {
  total_gateway:    number;
  total_sensor:     number;
  gateway_online:   number;
  sensor_online:    number;
  total_data_points: number;
};
```

---

### 2. Tạo `frontend/src/hooks/useDashboardStats.ts` – SWR Hook Stats

```typescript
const fetcher = (url: string) => api.get<DashboardStats>(url).then((r) => r.data);

export function useDashboardStats() {
  const { data, error, isLoading } = useSWR<DashboardStats>(
    "/api/dashboard/stats",
    fetcher,
    { refreshInterval: 10000 } // polling mỗi 10 giây
  );
  return { stats: data ?? null, isLoading, isError: !!error };
}
```

---

### 3. Tạo `frontend/src/hooks/useDeviceList.ts` – SWR Hook Device List

```typescript
const fetcher = (url: string) => api.get<ApiDevice[]>(url).then((r) => r.data);

export function useDeviceList() {
  const { data, error, isLoading, mutate } = useSWR<ApiDevice[]>(
    "/api/devices",
    fetcher,
    { refreshInterval: 10000 } // polling mỗi 10 giây
  );

  const updateStatus = async (id: number, status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    mutate(); // revalidate SWR cache ngay lập tức
  };

  const deleteDevice = async (id: number) => {
    await api.delete(`/api/devices/${id}`);
    mutate();
  };

  return { devices: data ?? [], isLoading, isError: !!error, updateStatus, deleteDevice };
}
```

---

### 4. Tạo `frontend/src/components/device/OnlineIndicator.tsx`

Component hiển thị trạng thái kết nối real-time dựa vào `last_seen`:

- Nếu `last_seen < 60 giây` → hiện dot xanh chớp (CSS `animate-ping`) + chữ "Online"
- Nếu `last_seen >= 60 giây` hoặc `null` → dot xám + chữ "Offline"

```tsx
function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) / 1000 < 60;
}
```

Dot xanh chớp dùng 2 layer Tailwind:
```tsx
<span className="relative flex h-2.5 w-2.5">
  <span className="absolute ... animate-ping ... bg-emerald-400 opacity-75" />
  <span className="relative ... bg-emerald-500" />
</span>
```

---

### 5. Tạo `frontend/src/components/ui/ConfirmDialog.tsx`

Modal xác nhận trước khi thực hiện thao tác nguy hiểm (xoá / khoá thiết bị):

| Prop | Kiểu | Mô tả |
|---|---|---|
| `open` | boolean | Hiển thị hay ẩn dialog |
| `title` | string | Tiêu đề modal |
| `description` | string | Nội dung mô tả hành động |
| `confirmLabel` | string | Label nút xác nhận (mặc định "Confirm") |
| `danger` | boolean | `true` → nút đỏ, `false` → nút xanh |
| `onConfirm` | () => void | Callback khi người dùng xác nhận |
| `onCancel` | () => void | Callback khi huỷ (hoặc click backdrop) |

Không có nút X – chỉ có 2 lựa chọn Cancel / Confirm để tránh đóng nhầm.

---

### 6. Cập nhật `frontend/src/components/device/DeviceStatusBadge.tsx`

Mở rộng từ chỉ hỗ trợ `online/offline` (mock) sang hỗ trợ đầy đủ 5 trạng thái:

| Status | Màu badge | Dùng cho |
|---|---|---|
| `active` / `online` | Xanh lá (`emerald`) | Thiết bị đang hoạt động |
| `inactive` / `offline` | Xám (`slate`) | Thiết bị chưa kích hoạt hoặc offline |
| `blocked` | Đỏ (`rose`) | Thiết bị bị khoá |

Dùng lookup object `statusConfig` thay vì if/else chain để dễ mở rộng.

---

### 7. Cập nhật `frontend/src/components/dashboard/StatsCard.tsx`

Mở rộng prop `value` từ `number` sang `number | string` để hỗ trợ hiển thị `"—"` khi đang loading.

---

### 8. Cập nhật `frontend/src/app/(dashboard)/dashboard/page.tsx`

**4 StatsCards từ API** (thay thế mock stats):

| Card | API Field | Icon | Màu accent |
|---|---|---|---|
| Total Gateway | `total_gateway` | `Server` (lucide) | `sky` |
| Total Sensor | `total_sensor` | `Cpu` (lucide) | `violet` |
| Gateway Online | `gateway_online` | `Wifi` (lucide) | `emerald` |
| Sensor Online | `sensor_online` | `Radio` (lucide) | `amber` |

- Dùng `useDashboardStats()` – SWR polling 10s
- Hiển thị `"—"` khi `isLoading === true` (chờ API)
- Phần **Health Overview** phía dưới cũng cập nhật theo 4 giá trị API thay vì mock
- Giữ nguyên "Security preview" (notifications) và "Recent events" sections

---

### 9. Viết lại `frontend/src/app/(dashboard)/devices/page.tsx`

**2 Tab – Gateway / Sensor:**

```
[ Gateway (3) ]  [ Sensor (8) ]
```

- Tab Gateway → chỉ hiện thiết bị `device_type === "gateway"`
- Tab Sensor → chỉ hiện thiết bị `device_type === "sensor"`
- Badge đếm số lượng ở mỗi tab

**Bảng thiết bị** – 8 cột:

| Cột | Nguồn dữ liệu |
|---|---|
| Device ID | `device_id` (font-mono) |
| Name | `device_name` |
| Type | `device_type` (capitalized) |
| Location | `location` |
| Status | `DeviceStatusBadge` với `status` |
| Connection | `OnlineIndicator` với `last_seen` |
| Last Seen | `formatLastSeen(last_seen)` – hiện dạng "Xs ago / Xm ago / ..." |
| Actions | Nút Lock/Unlock + Delete |

**Actions:**

| Nút | Điều kiện hiển thị | Hành động |
|---|---|---|
| Lock (vàng) | `status !== "blocked"` | Mở `ConfirmDialog` → `PATCH /api/devices/:id/status { status: "blocked" }` |
| Unlock (xanh) | `status === "blocked"` | Mở `ConfirmDialog` → `PATCH /api/devices/:id/status { status: "active" }` |
| Delete (đỏ) | Luôn hiển thị | Mở `ConfirmDialog` → `DELETE /api/devices/:id` |

**Summary cards** (trên bảng):

```
┌─────────────────────┐  ┌─────────────────────┐
│ [Server icon] Gateways │  │ [Cpu icon] Sensors     │
│ 3                   │  │ 8                   │
│ 2 active            │  │ 6 active            │
└─────────────────────┘  └─────────────────────┘
```

**Loading / Error state:**
- `isLoading` → hiện icon spinner `RefreshCw animate-spin` ở header bảng
- `isError` → hiện text "Failed to load — check backend connection" màu đỏ
- Bảng trống → hiện message "No gateways/sensors registered yet."

---

### Luồng thao tác Lock/Unlock/Delete

```
[User click Lock]
  → setPending({ type: "lock", device })
  → ConfirmDialog mở với title "Block device"

[User click Confirm]
  → setActionLoading(true)
  → api.patch(`/api/devices/${id}/status`, { status: "blocked" })
  → mutate() → SWR revalidate → bảng cập nhật badge "blocked" (đỏ)
  → setActionLoading(false), setPending(null)

[User click Cancel]
  → setPending(null) → dialog đóng, không có thay đổi
```

---

### Checklist hoàn thành Task 10

- [x] `src/types/api.ts` – `ApiDevice`, `DashboardStats` khớp backend schema
- [x] `src/hooks/useDashboardStats.ts` – SWR polling `/api/dashboard/stats` mỗi 10s
- [x] `src/hooks/useDeviceList.ts` – SWR polling `/api/devices` mỗi 10s, kèm `updateStatus` và `deleteDevice`
- [x] `src/components/device/OnlineIndicator.tsx` – dot xanh chớp nếu `last_seen < 60s`
- [x] `src/components/ui/ConfirmDialog.tsx` – modal xác nhận với backdrop, nút Cancel/Confirm
- [x] `src/components/device/DeviceStatusBadge.tsx` – mở rộng: active=xanh / inactive=xám / blocked=đỏ
- [x] `src/components/dashboard/StatsCard.tsx` – `value` chấp nhận `number | string`
- [x] `src/app/(dashboard)/dashboard/page.tsx` – 4 cards từ API: Total Gateway, Total Sensor, Gateway Online, Sensor Online; SWR polling 10s
- [x] `src/app/(dashboard)/devices/page.tsx` – 2 tab Gateway/Sensor, bảng 8 cột, nút Lock/Unlock/Delete với ConfirmDialog, SWR polling 10s
- [x] TypeScript compile không lỗi

---

## Task 11 – Frontend: Đăng Ký Thiết Bị Mới

**Branch:** `fe/device-registration`
**Ngày hoàn thành:** 2026-05-20

---

### 1. Thêm `RegisterDeviceResponse` vào `frontend/src/types/api.ts`

Kiểu TypeScript cho response của `POST /api/devices/register` — trả credentials một lần duy nhất:

```typescript
export type RegisterDeviceResponse = {
  id:          number;
  device_id:   string;          // "ESP32-SN-XXXXXXXX" hoặc "ESP32-GW-XXXXXXXX"
  device_name: string;
  device_type: ApiDeviceType;
  status:      ApiDeviceStatus;
  location:    string;
  secret_key:  string;          // 64-char hex – chỉ có trong response này, không bao giờ xuất hiện lại
};
```

---

### 2. Tạo `frontend/src/components/device/RegisterModal.tsx`

Modal hiển thị credentials sau khi đăng ký thành công. Thiết kế buộc người dùng phải lưu trước khi đóng:

#### Đặc điểm bảo mật UI

| Điểm | Cách xử lý |
|---|---|
| Không có nút X | Component dùng `div` thủ công, không dùng `<Dialog>` của shadcn (tránh nút đóng mặc định) |
| Không đóng khi click nền | Backdrop không có `onClick` handler |
| Không đóng bằng Escape | Không mount event listener keyboard |
| Cảnh báo đỏ nổi bật | Banner `border-red-500/30 bg-red-500/10` với icon `AlertTriangle` |
| Chỉ 1 nút thoát | "Tôi đã lưu – Đóng" → callback `onClose` → redirect về `/devices` |

#### Hiển thị credentials

- **Device ID** và **Secret Key** mỗi field trong box `bg-slate-950`, font `font-mono`, `break-all`
- Mỗi field có nút **Copy** riêng:
  - Dùng `navigator.clipboard.writeText()`
  - Sau khi copy: icon đổi sang `Check` màu xanh + label "Copied" trong 2 giây
  - Tự động reset về `Copy` sau 2 giây (`setTimeout`)

```tsx
const copy = async (text: string, which: "id" | "key") => {
  await navigator.clipboard.writeText(text);
  if (which === "id") {
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  } else {
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }
};
```

---

### 3. Tạo `frontend/src/app/(dashboard)/devices/new/page.tsx`

Trang đăng ký thiết bị mới tại route `/devices/new`.

#### Form fields

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| Tên thiết bị | text input | Có | Validation: không được rỗng sau trim |
| Loại thiết bị | select | Có | Giá trị: `sensor` / `gateway` |
| Vị trí | text input | Không | Truyền `undefined` lên API nếu rỗng |

#### Validation

- Validate client-side trước khi gọi API
- Tên trống → hiện thông báo lỗi inline màu đỏ: *"Tên thiết bị không được để trống."*
- Lỗi xóa ngay khi người dùng bắt đầu nhập lại (`onChange`)
- Lỗi từ API (4xx) hiện trong banner đỏ dưới form

#### Luồng submit

```
[User nhấn "Đăng ký thiết bị"]
  → Validate client-side
  → setSubmitting(true) → nút disabled + label "Đang đăng ký…"
  → POST /api/devices/register { device_name, device_type, location }
  → Thành công: setCredentials({ device_id, secret_key }) → RegisterModal hiện
  → Thất bại: setApiError(message) → banner lỗi hiện
  → setSubmitting(false)

[User nhấn "Tôi đã lưu – Đóng" trong modal]
  → router.push("/devices")
  → Thiết bị mới xuất hiện trong danh sách với status "inactive"
```

#### Navigation

- Nút **Back** (← Back to Fleet registry) ở đầu trang dùng `Link href="/devices"`
- Nút **Huỷ** trong form cũng dùng `Link href="/devices"`

---

### 4. Cập nhật `frontend/src/app/(dashboard)/devices/page.tsx`

Đổi nút "Add Device" từ `<button onClick={openModal}>` (mở modal mock) thành `<Link href="/devices/new">` (điều hướng tới trang đăng ký thực):

```tsx
// Trước
<button onClick={openModal} className="...">
  Add Device
</button>

// Sau
<Link href="/devices/new" className="...">
  <Plus className="h-4 w-4" />
  Add Device
</Link>
```

- Thêm icon `Plus` từ `lucide-react`
- Xóa import `useAddDevice` không còn dùng nữa

---

### Luồng hoàn chỉnh Task 11

```
[User vào /devices] → [Click "Add Device"]
  → Chuyển đến /devices/new

[/devices/new] → Điền form → Submit
  → POST /api/devices/register
  → Backend: sinh device_id + secret_key → INSERT DB (status=inactive)
  → Frontend: nhận { device_id, secret_key } → hiện RegisterModal

[RegisterModal]
  → Cảnh báo đỏ: "Chỉ hiển thị 1 lần – Hãy lưu lại trước khi đóng!"
  → User copy device_id và secret_key
  → Click "Tôi đã lưu – Đóng"
  → router.push("/devices")

[/devices] → SWR revalidate → thiết bị mới xuất hiện với badge "inactive"
```

---

### Checklist hoàn thành Task 11

- [x] `src/types/api.ts` – thêm `RegisterDeviceResponse` với field `secret_key`
- [x] `src/components/device/RegisterModal.tsx` – không có nút X, không đóng khi click ngoài
- [x] `RegisterModal` hiển thị `device_id` và `secret_key` font monospace với nút Copy riêng
- [x] Nút Copy: dùng Clipboard API, feedback "Copied" + icon check trong 2 giây
- [x] Cảnh báo đỏ "Chỉ hiển thị 1 lần – Hãy lưu lại trước khi đóng!" với icon `AlertTriangle`
- [x] Nút duy nhất "Tôi đã lưu – Đóng" → `onClose` callback → redirect `/devices`
- [x] `src/app/(dashboard)/devices/new/page.tsx` – form 3 field: Tên (bắt buộc), Loại, Vị trí
- [x] Validation client-side: tên trống → lỗi inline, xóa lỗi khi user nhập lại
- [x] Lỗi API hiện banner đỏ dưới form
- [x] Submit → `POST /api/devices/register` → hiện `RegisterModal` với credentials
- [x] Đóng modal → `router.push("/devices")` → thiết bị mới xuất hiện với status `inactive`
- [x] `src/app/(dashboard)/devices/page.tsx` – "Add Device" đổi thành `Link href="/devices/new"`
- [x] TypeScript compile không lỗi

---

## Task 12 – Frontend: Chi Tiết Thiết Bị & Biểu Đồ Cảm Biến

**Branch:** `fe/device-detail-charts`
**Ngày hoàn thành:** 2026-05-20

---

### 1. Cập nhật `frontend/src/types/api.ts` – Thêm kiểu dữ liệu cảm biến

Bổ sung 3 kiểu TypeScript mới:

```typescript
export type ApiSensorPayload = {
  temperature?: number;
  humidity?: number;
  [key: string]: unknown;   // hỗ trợ payload mở rộng trong tương lai
};

export type ApiSensorData = {
  id:          number;
  device_id:   number | string;   // FK → devices.id (integer) hoặc device_id string
  gateway_id:  number | string;   // FK → devices.id (integer) hoặc device_id string
  payload:     ApiSensorPayload;
  received_at: string;            // ISO 8601
};

export type ApiDeviceDetail = ApiDevice & {
  recent_data?: ApiSensorData[];  // 10 bản ghi gần nhất từ GET /api/devices/:id
};
```

---

### 2. Tạo `frontend/src/hooks/useDeviceDetail.ts`

SWR hook fetch chi tiết một thiết bị và expose action mutations:

```typescript
export function useDeviceDetail(id: string | number) {
  // SWR fetch GET /api/devices/:id, polling 10s
  const updateStatus = async (status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    mutate();
  };
  const deleteDevice = async () => {
    await api.delete(`/api/devices/${id}`);
  };
  return { device, isLoading, isError, mutate, updateStatus, deleteDevice };
}
```

- Endpoint: `GET /api/devices/:id`
- `refreshInterval: 10000` – polling 10s
- Trả `null` khi chưa load xong (thay vì gây lỗi undefined)
- `updateStatus` và `deleteDevice` là mutations kèm `mutate()` revalidate

---

### 3. Tạo `frontend/src/hooks/useSensorData.ts`

SWR hook fetch lịch sử sensor data có conditional:

```typescript
export function useSensorData(id: string | number | null) {
  // Khi id === null → SWR không fetch (dùng cho thiết bị gateway)
  useSWR(
    id !== null ? `/api/devices/${id}/data?limit=200` : null,
    fetcher,
    { refreshInterval: 10000 }
  );
}
```

- Endpoint: `GET /api/devices/:id/data?limit=200`
- Hỗ trợ cả 2 response format: `ApiSensorData[]` và `{ data: ApiSensorData[] }` (tự detect)
- `id = null` → SWR key null → không fetch (dùng cho gateway)
- `refreshInterval: 10000` – polling 10s

---

### 4. Tạo `frontend/src/components/device/SensorChart.tsx`

Component biểu đồ Recharts dành riêng cho thiết bị sensor:

#### Tính năng

| Feature | Chi tiết |
|---|---|
| Loại biểu đồ | `LineChart` với `ResponsiveContainer` 100% width, height 260px |
| Đường nhiệt độ | `stroke="#f97316"` (cam đỏ), label "Temperature (°C)" |
| Đường độ ẩm | `stroke="#38bdf8"` (xanh dương), label "Humidity (%)" |
| Trục X | `received_at` được format theo khoảng thời gian đang chọn |
| Tooltip | Dark theme `bg-slate-950 border-slate-800`, hiện đủ cả 2 giá trị khi hover |
| `connectNulls` | Nối liền đường dù có điểm bị thiếu dữ liệu |
| `dot={false}` | Không vẽ dot từng điểm – tăng performance khi nhiều data |

#### Bộ chọn khoảng thời gian

```
[ 1h ]  [ 6h ]  [ 24h ]
```

- 3 nút toggle `1h / 6h / 24h`
- Filter client-side trên data đã fetch (không gọi lại API)
- Khoảng đang chọn: `bg-slate-700 text-white`, còn lại: `text-slate-400`

#### Trạng thái đặc biệt

| Trường hợp | Hiển thị |
|---|---|
| `isLoading === true` | "Loading chart data…" placeholder 208px |
| Không có data trong khoảng | "No data in the last Xh." |
| Có data | Recharts `LineChart` đầy đủ |

#### Helpers nội bộ

```typescript
function formatTime(iso: string, range: TimeRange): string
// 1h → HH:MM:SS, 6h/24h → HH:MM

function filterByRange(data: ApiSensorData[], range: TimeRange): ApiSensorData[]
// Lọc data theo cutoff = Date.now() - hours * 3600000
```

---

### 5. Viết lại `frontend/src/app/(dashboard)/devices/[id]/page.tsx`

Trang chi tiết thiết bị hoàn toàn mới – thay thế trang cũ dùng mock data.

#### Kiến trúc

- `"use client"` – Client Component (cần SWR, useState, useRouter)
- Dùng `useParams<{ id: string }>()` thay vì `await params` (Server Component)
- Hai hook: `useDeviceDetail(id)` + `useSensorData(isSensor ? id : null)`

#### Layout trang

```
[← Back to Devices]
[Icon] [Device Name]       [Block] [Delete]
[Device ID font-mono]

┌─────────────────── Device Info ──────────────────┐
│ Type │ Status │ Connection │ Last Seen            │
│ Location │ Linked Gateway │ Fail Count │ Device ID│
└──────────────────────────────────────────────────┘

(Chỉ hiển thị khi là sensor):
┌─────── SensorChart ──────────────────────────────┐
│ [1h] [6h] [24h]                                  │
│ Recharts LineChart (temp=cam, humidity=xanh)     │
└──────────────────────────────────────────────────┘

┌─────── Recent Data (20 bản ghi) ─────────────────┐
│ Time │ Temperature (°C) │ Humidity (%) │ Gateway  │
└──────────────────────────────────────────────────┘
```

#### Phần thông tin (`InfoCard` component)

Helper component nội bộ `InfoCard` hiển thị các ô thông tin nhỏ:

| Field | Nguồn | Ghi chú |
|---|---|---|
| Type | `device_type` | Icon Server (xanh) cho gateway, Cpu (tím) cho sensor |
| Status | `status` | `DeviceStatusBadge` component |
| Connection | `last_seen` | `OnlineIndicator` component |
| Last Seen | `last_seen` | `formatLastSeen()` – Xs/Xm/Xh/Xd ago |
| Location | `location` | Hiện có điều kiện (chỉ khi có data) |
| Linked Gateway | `recentData[0].gateway_id` | Hiện có điều kiện (chỉ khi là sensor và có data) |
| Fail Count | `fail_count` | Text vàng `text-amber-300` khi > 0 |
| Device ID | `device_id` | Font mono, text nhỏ |

#### Nút hành động

| Nút | Màu | Điều kiện | Hành động |
|---|---|---|---|
| Block | Vàng `amber` | `status !== "blocked"` | `ConfirmDialog` → `PATCH status="blocked"` |
| Unblock | Xanh `emerald` | `status === "blocked"` | `ConfirmDialog` → `PATCH status="active"` |
| Delete | Đỏ `rose` | Luôn hiện | `ConfirmDialog` → `DELETE` → `router.push("/devices")` |

#### Bảng Recent Data (20 bản ghi)

| Cột | Nguồn | Màu |
|---|---|---|
| Time | `received_at` | `formatDateTime()` → "DD/MM/YYYY, HH:MM:SS" |
| Temperature | `payload.temperature` | `text-orange-300`, `—` nếu undefined |
| Humidity | `payload.humidity` | `text-sky-300`, `—` nếu undefined |
| Gateway | `gateway_id` | Font mono, text nhỏ |

Data được sort DESC theo `received_at`, lấy 20 bản ghi đầu.

#### Trạng thái loading / error

| Trường hợp | Hiển thị |
|---|---|
| `isLoading` | Full-page spinner `RefreshCw animate-spin` + "Loading device…" |
| `isError \|\| !device` | Full-page error "Failed to load device." + link back |

---

### Tóm tắt files đã tạo / chỉnh sửa

| File | Hành động |
|---|---|
| `src/types/api.ts` | Thêm `ApiSensorPayload`, `ApiSensorData`, `ApiDeviceDetail` |
| `src/hooks/useDeviceDetail.ts` | Tạo mới – SWR fetch + updateStatus + deleteDevice |
| `src/hooks/useSensorData.ts` | Tạo mới – SWR fetch conditional (null-key nếu gateway) |
| `src/components/device/SensorChart.tsx` | Tạo mới – Recharts LineChart với time-range selector |
| `src/app/(dashboard)/devices/[id]/page.tsx` | Viết lại – Client Component dùng real API |

---

### Checklist hoàn thành Task 12

- [x] `src/types/api.ts` – thêm `ApiSensorPayload`, `ApiSensorData`, `ApiDeviceDetail`
- [x] `src/hooks/useDeviceDetail.ts` – SWR `GET /api/devices/:id`, polling 10s, kèm `updateStatus`, `deleteDevice`
- [x] `src/hooks/useSensorData.ts` – SWR `GET /api/devices/:id/data?limit=200`, polling 10s, conditional fetch (null-key cho gateway)
- [x] `src/components/device/SensorChart.tsx` – Recharts `LineChart`, 2 đường (cam=nhiệt độ, xanh=độ ẩm), bộ chọn 1h/6h/24h, tooltip dark-theme
- [x] `src/app/(dashboard)/devices/[id]/page.tsx` – Client Component, `useParams()`, đầy đủ info cards, nút Block/Unblock/Delete với `ConfirmDialog`, redirect `/devices` sau delete
- [x] Chỉ hiện `SensorChart` và bảng `Recent Data` khi `device_type === "sensor"`
- [x] `useSensorData(null)` khi device là gateway → SWR không fetch
- [x] Loading state: spinner full-page khi `isLoading`
- [x] Error state: thông báo lỗi + link quay về `/devices`
- [x] TypeScript compile không lỗi

---

## Task 13 – Frontend: Trang Audit Log & Quản Lý Users

**Branch:** `fe/audit-log-users`
**Ngày hoàn thành:** 2026-05-20

---

### 1. Backend – Users API (`backend/src/routes/users.ts`)

Tạo mới file route xử lý quản lý tài khoản dashboard:

| Endpoint | Role | Mô tả |
|---|---|---|
| `GET /api/users` | admin | Lấy danh sách users (id, username, role, created_at, last_login) |
| `POST /api/users` | admin | Tạo tài khoản mới (chỉ operator/viewer), validate username ≥ 3 ký tự, password ≥ 6 ký tự |
| `PATCH /api/users/:id/password` | admin | Đổi mật khẩu, bcrypt hash cost 12 |
| `DELETE /api/users/:id` | admin | Xoá tài khoản – không cho phép xoá admin hoặc tự xoá bản thân |

Bảo vệ toàn bộ route bằng `verifyJWT` + `requireRole("admin")`.

Đã đăng ký route trong `backend/src/routes/index.ts`:
```ts
router.use("/users", userRoutes);
```

---

### 2. Frontend – Types (`frontend/src/types/api.ts`)

Thêm 3 type mới:

```ts
AuditEventType  // Union type các event: AUTH_FAIL | GATEWAY_AUTH_FAIL | SENSOR_AUTH_FAIL | ...
AuditLogEntry   // Kiểu dữ liệu 1 bản ghi audit_log từ API
ApiUser         // Kiểu dữ liệu tài khoản: id, username, role, created_at, last_login
```

---

### 3. Frontend – Hooks

**`src/hooks/useAuditLog.ts`**
- SWR fetch `GET /api/audit-log` với filter query builder (event_type, device_id, from, to)
- `refreshInterval: 30000` (auto-refresh 30s)
- Trả `{ logs, isLoading, isError, refresh }`

**`src/hooks/useUsers.ts`**
- SWR fetch `GET /api/users`
- Hàm `createUser(username, password, role)` → POST + mutate
- Hàm `changePassword(id, password)` → PATCH
- Hàm `deleteUser(id)` → DELETE + mutate

---

### 4. Component `AuditLogTable.tsx` (`frontend/src/components/audit/AuditLogTable.tsx`)

Bảng hiển thị audit log với màu sắc theo event type:

| Màu | Event types |
|---|---|
| Đỏ | `AUTH_FAIL`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED` |
| Xanh lá | `AUTH_SUCCESS`, `DATA_RECV` |
| Vàng | `DEVICE_REGISTER` |
| Xám | Các event khác |

Tính năng:
- Cột Chi tiết: hiển thị JSON collapsible (nút toggle ChevronRight/ChevronDown)
- Cột Device ID: hiển thị `device_identifier` (device_id string) với tooltip device_name
- Format thời gian theo locale vi-VN
- Empty state khi không có dữ liệu

---

### 5. Trang `/audit` (`frontend/src/app/(dashboard)/audit/page.tsx`)

**Bộ lọc:**
- Dropdown `event_type` (7 loại event)
- Input số `device_id` (lọc theo ID nội bộ)
- Date picker `from` / `to` (datetime-local, dark theme)
- Nút "Xoá bộ lọc" hiện khi có filter đang active

**Phân trang:**
- Chọn pageSize: 10 / 25 / 50 records/trang
- Nút Trước / Sau + số trang
- Tổng số trang tự tính từ `logs.length`

**Khác:**
- Nút "Làm mới" manual với spinner khi loading
- Thông báo lỗi khi không kết nối được backend
- Auto-refresh qua SWR `refreshInterval: 30000`

---

### 6. Trang `/users` (`frontend/src/app/(dashboard)/users/page.tsx`)

**Guard admin:** Nếu `user.role !== "admin"` → hiển thị màn hình "Không có quyền truy cập" (ShieldCheck icon).

**Form tạo tài khoản:**
- Input: username, password, role (operator/viewer)
- Validation client: username ≥ 3 ký tự, password ≥ 6 ký tự
- Hiển thị lỗi chi tiết (USERNAME_TAKEN, PASSWORD_TOO_SHORT, v.v.)
- Success toast "Tài khoản đã tạo thành công" tự ẩn sau 3s

**Bảng tài khoản:**
- Cột: Tên đăng nhập, Vai trò (badge màu), Ngày tạo, Đăng nhập gần nhất, Thao tác
- Badge "Bạn" đánh dấu tài khoản đang đăng nhập
- Role badge: admin=xanh, operator=tím, viewer=xám

**Thao tác:**
- "Đổi mật khẩu" → mở `PasswordModal` (inline component): form 2 field password + confirm, validation, submit PATCH
- "Xoá" → mở `ConfirmDialog` với `danger=true`
- Nút Xoá ẩn với tài khoản admin và tài khoản đang đăng nhập

---

### Tóm tắt files đã tạo / chỉnh sửa

| File | Hành động |
|---|---|
| `backend/src/routes/users.ts` | Tạo mới – CRUD users API (admin only) |
| `backend/src/routes/index.ts` | Thêm `router.use("/users", userRoutes)` |
| `frontend/src/types/api.ts` | Thêm `AuditEventType`, `AuditLogEntry`, `ApiUser` |
| `frontend/src/hooks/useAuditLog.ts` | Tạo mới – SWR + filter query builder, refresh 30s |
| `frontend/src/hooks/useUsers.ts` | Tạo mới – SWR + createUser, changePassword, deleteUser |
| `frontend/src/components/audit/AuditLogTable.tsx` | Tạo mới – bảng màu event type + collapsible JSON |
| `frontend/src/app/(dashboard)/audit/page.tsx` | Tạo mới – filters, pagination, auto-refresh |
| `frontend/src/app/(dashboard)/users/page.tsx` | Tạo mới – admin guard, form tạo tài khoản, bảng quản lý |

---

### Checklist hoàn thành Task 13

- [x] `backend/src/routes/users.ts` – GET/POST/PATCH password/DELETE với validation đầy đủ
- [x] `backend/src/routes/index.ts` – đăng ký `/users` route
- [x] `frontend/src/types/api.ts` – thêm `AuditLogEntry`, `AuditEventType`, `ApiUser`
- [x] `frontend/src/hooks/useAuditLog.ts` – SWR auto-refresh 30s, filter query builder
- [x] `frontend/src/hooks/useUsers.ts` – SWR + CRUD mutations
- [x] `AuditLogTable.tsx` – màu đỏ/xanh/vàng theo event type, collapsible JSON
- [x] `/audit` page – dropdown event_type, input device_id, date range, phân trang 10/25/50
- [x] `/users` page – admin-only guard, form tạo operator/viewer, đổi mật khẩu modal, xoá với confirm
- [x] Sidebar `/audit` và `/users` đã có sẵn từ trước → không cần sửa
- [x] TypeScript compile không lỗi (frontend + backend)

---

## Task 14 – Firmware ESP32: Sensor Node

**Branch:** `hw/sensor-node-firmware`
**Ngày hoàn thành:** 2026-05-20

---

### 1. Cập nhật `firmware/sensor-node/platformio.ini`

Bổ sung thư viện và cấu hình build cho ESP32 WROOM-32 (DOIT DevKit v1):

```ini
[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200

lib_deps =
    knolleary/PubSubClient@^2.8
    adafruit/DHT sensor library@^1.4.4
    adafruit/Adafruit Unified Sensor@^1.1.9
    bblanchon/ArduinoJson@^6.21.5

build_flags =
    -DCORE_DEBUG_LEVEL=0
```

| Thư viện | Mục đích |
|---|---|
| `PubSubClient` | MQTT client publish/subscribe |
| `DHT sensor library` | Đọc dữ liệu từ DHT22 |
| `Adafruit Unified Sensor` | Dependency bắt buộc của DHT library |
| `ArduinoJson` | Build và serialize JSON payload |

`mbedtls` (dùng cho HMAC-SHA256) là thư viện **built-in** của ESP32 Arduino framework – không cần khai báo thêm.

---

### 2. Tạo `firmware/sensor-node/src/config.h`

File khai báo toàn bộ hằng số cấu hình:

| Hằng số | Mô tả |
|---|---|
| `DEVICE_ID` | Device ID nhận từ `POST /api/devices/register` (vd: `"ESP32-SN-XXXXXXXX"`) |
| `SECRET_KEY` | Secret key 64 ký tự hex nhận từ `POST /api/devices/register` |
| `WIFI_SSID` / `WIFI_PASS` | Thông tin WiFi |
| `MQTT_HOST` / `MQTT_PORT` | IP và port của MQTT broker (hoặc Gateway) |
| `DHT_PIN` | GPIO 4 – chân DATA của DHT22, kèm điện trở pull-up 10kΩ lên 3.3V |
| `DHT_TYPE` | `DHT22` |
| `LED_WIFI_PIN` | GPIO 0 – LED xanh báo WiFi đã kết nối |
| `LED_SEND_PIN` | GPIO 2 – LED đỏ onboard, nháy khi gửi dữ liệu thành công |
| `SEND_INTERVAL` | 5000 ms – chu kỳ gửi dữ liệu |
| `MQTT_BUFFER_SIZE` | 512 bytes – kích thước buffer MQTT payload |

> ⚠️ File `config.h` được thêm vào `.gitignore` để tránh commit credentials lên repo.

---

### 3. Tạo `firmware/sensor-node/src/wifi_manager.h` + `wifi_manager.cpp`

Quản lý kết nối WiFi với tự động reconnect:

#### `wifiSetup()`
- `WiFi.mode(WIFI_STA)` → `WiFi.begin(SSID, PASS)`
- Polling `WiFi.status()` tối đa 40 lần (×500ms = 20s)
- Kết nối thành công: `digitalWrite(LED_WIFI_PIN, HIGH)` + in IP ra Serial
- Thất bại: in cảnh báo, sẽ thử lại trong `loop()`

#### `wifiMaintain()`
- Gọi mỗi vòng `loop()`
- Phát hiện ngắt kết nối: `LED_WIFI_PIN LOW` + `WiFi.reconnect()`
- Phát hiện reconnect thành công: `LED_WIFI_PIN HIGH` + in IP mới

#### `wifiIsConnected()`
- `return WiFi.status() == WL_CONNECTED`

---

### 4. Tạo `firmware/sensor-node/src/ntp_sync.h` + `ntp_sync.cpp`

Đồng bộ thời gian thực từ NTP server:

#### `ntpSetup()`
- `configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov")` → UTC+7 Việt Nam
- Polling `getLocalTime()` tối đa 20 lần (×500ms = 10s)
- Thành công: in thời gian hiện tại, đặt `_synced = true`
- Thất bại: cảnh báo timestamp sẽ không chính xác

#### `getCurrentTimestamp()`
- `time_t now; time(&now); return (unsigned long)now;`
- Trả Unix timestamp (giây) dùng trong HMAC message

#### `ntpIsSynced()`
- Trả `true` nếu đã sync ít nhất 1 lần thành công

---

### 5. Tạo `firmware/sensor-node/src/hmac_util.h` + `hmac_util.cpp`

Tính HMAC-SHA256 dùng **mbedtls built-in** của ESP32:

```cpp
String computeHMAC(const String& key, const String& message);
```

#### Luồng tính toán:
1. `mbedtls_md_context_t ctx` – khởi tạo context
2. `mbedtls_md_setup(&ctx, MBEDTLS_MD_SHA256, 1)` – chọn SHA-256 + HMAC mode
3. `mbedtls_md_hmac_starts(&ctx, key.c_str(), key.length())` – set key
4. `mbedtls_md_hmac_update(&ctx, message.c_str(), message.length())` – đưa data
5. `mbedtls_md_hmac_finish(&ctx, hmacResult)` – lấy 32 bytes kết quả
6. `mbedtls_md_free(&ctx)` – giải phóng memory
7. Convert 32 bytes → 64 ký tự hex lowercase bằng `snprintf("%02x", ...)`

#### Format message để ký:
```
message = DEVICE_ID + ":" + timestamp
ví dụ: "ESP32-SN-A1B2C3D4:1700000000"
```

Kết quả: hex string 64 ký tự, ví dụ: `"a3f9c2e1..."`

---

### 6. Tạo `firmware/sensor-node/src/sensor_reader.h` + `sensor_reader.cpp`

Đọc dữ liệu nhiệt độ và độ ẩm từ DHT22:

```cpp
struct SensorData {
    float temperature;  // °C
    float humidity;     // %
    bool  valid;        // false nếu đọc thất bại
};
```

#### `sensorSetup()`
- `dht.begin()` – khởi tạo DHT22 trên GPIO 4
- `delay(2000)` – DHT22 cần 2s warmup sau khi cấp nguồn
- In thông báo khởi tạo ra Serial

#### `readSensor()`
- `dht.readHumidity()` + `dht.readTemperature()`
- Kiểm tra `isnan()` cho cả 2 giá trị
- Nếu NaN: `valid = false`, log lỗi
- Nếu hợp lệ: `valid = true`, log giá trị ra Serial

> **Phần cứng:** DHT22 dùng GPIO 4, thêm điện trở pull-up **10kΩ** từ DATA pin lên 3.3V.

---

### 7. Tạo `firmware/sensor-node/src/mqtt_sender.h` + `mqtt_sender.cpp`

MQTT client publish dữ liệu lên topic cho Gateway:

#### `mqttSetup()`
- `mqttClient.setServer(MQTT_HOST, MQTT_PORT)`
- `mqttClient.setBufferSize(MQTT_BUFFER_SIZE)` – 512 bytes
- In thông tin broker ra Serial

#### `mqttMaintain()`
- Gọi mỗi vòng `loop()`
- Nếu đang kết nối: `mqttClient.loop()` – xử lý MQTT heartbeat
- Nếu mất kết nối: reconnect sau 5s (`millis()` throttle) với client ID `"sn-<DEVICE_ID>"`

#### `mqttPublishSensorData(const SensorData& data)`

Luồng xử lý:
1. Kiểm tra `mqttClient.connected()` – nếu không thì return false
2. Lấy `timestamp = getCurrentTimestamp()`
3. Tạo `message = DEVICE_ID + ":" + timestamp`
4. Tính `hmac = computeHMAC(SECRET_KEY, message)`
5. Build JSON bằng `StaticJsonDocument<256>`:
6. Serialize JSON → `char payload[512]`
7. `mqttClient.publish(topic, payload, false)` – QoS 0, no retain

#### Payload JSON gửi lên MQTT:
```json
{
  "sensor_id":    "ESP32-SN-XXXXXXXX",
  "sn_timestamp": 1700000000,
  "sn_hmac":      "64-char-hex-string",
  "data": {
    "temperature": 28.5,
    "humidity": 65.2
  }
}
```

#### Topic MQTT:
```
local/sensors/ESP32-SN-XXXXXXXX/data
```

Gateway sẽ subscribe wildcard `local/sensors/+/data` để nhận dữ liệu từ tất cả sensor.

---

### 8. Viết lại `firmware/sensor-node/src/main.cpp`

File điều phối chính toàn bộ firmware:

#### `setup()`
1. `Serial.begin(115200)` – in banner khởi động
2. `pinMode(LED_SEND_PIN, OUTPUT)` – cấu hình LED GPIO 2
3. `wifiSetup()` – kết nối WiFi
4. `ntpSetup()` – đồng bộ thời gian (cần WiFi)
5. `sensorSetup()` – khởi tạo DHT22
6. `mqttSetup()` – cấu hình MQTT client

#### `loop()`
1. `wifiMaintain()` – duy trì WiFi
2. `mqttMaintain()` – duy trì MQTT + `mqttClient.loop()`
3. Kiểm tra `millis() - lastSendTime >= SEND_INTERVAL` (5000ms)
4. Guard conditions trước khi gửi:
   - `wifiIsConnected()` – nếu không: skip + log
   - `ntpIsSynced()` – nếu không: skip + log (HMAC sẽ sai)
   - `mqttIsConnected()` – nếu không: skip + log
5. `readSensor()` – đọc DHT22
6. Guard: `data.valid` – nếu không: skip + log
7. `mqttPublishSensorData(data)` – tính HMAC + gửi MQTT
8. Nháy LED GPIO 2: `HIGH(100ms) → LOW` khi gửi thành công

---

### Serial Monitor Output mẫu

```
╔══════════════════════════════════╗
║   IoT Sensor Node – Khởi động    ║
╚══════════════════════════════════╝
  Device ID  : ESP32-SN-A1B2C3D4
  DHT22 Pin  : GPIO 4
  Gửi mỗi   : 5000 ms

[WiFi] Connecting to 'MyNetwork'......... OK – IP: 192.168.1.105
[NTP] Syncing......... OK – 2026-05-20 14:30:00 (UTC+7)
[DHT] DHT22 khởi tạo trên GPIO 4
[MAIN] Setup hoàn tất – vào vòng lặp chính

[DHT] Nhiệt độ: 28.5°C | Độ ẩm: 65.2%
[MQTT] Published (120 bytes): {"sensor_id":"ESP32-SN-A1B2C3D4","sn_timestamp":1716174600,"sn_hmac":"a3f9...","data":{"temperature":28.5,"humidity":65.2}}
```

---

### Cấu trúc file đã tạo

```
firmware/sensor-node/
├── platformio.ini          # Board config + lib_deps
└── src/
    ├── config.h            # Device ID, Secret Key, WiFi, MQTT, GPIO
    ├── wifi_manager.h/.cpp # WiFi kết nối + auto-reconnect + LED GPIO 0
    ├── ntp_sync.h/.cpp     # NTP UTC+7 + getCurrentTimestamp()
    ├── hmac_util.h/.cpp    # computeHMAC() dùng mbedtls built-in
    ├── sensor_reader.h/.cpp # DHT22 GPIO 4 + struct SensorData
    ├── mqtt_sender.h/.cpp  # MQTT publish + JSON + HMAC
    └── main.cpp            # setup() + loop() orchestration
```

---

### Kết quả build

```
RAM:   [=         ]  14.1% (used 46048 bytes from 327680 bytes)
Flash: [======    ]  58.0% (used 759641 bytes from 1310720 bytes)
========================= [SUCCESS] Took 54.75 seconds =========================
```

Build thành công, không có lỗi compile.

---

### Hướng dẫn sử dụng

1. **Đăng ký thiết bị** qua `POST /api/devices/register` → lấy `device_id` và `secret_key`
2. **Cập nhật `config.h`**: điền `DEVICE_ID`, `SECRET_KEY`, `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`
3. **Flash firmware**: `pio run --target upload`
4. **Giám sát**: `pio device monitor` (115200 baud)

---

### Checklist hoàn thành Task 14

- [x] `platformio.ini` – board `esp32doit-devkit-v1`, lib_deps: PubSubClient, DHT, ArduinoJson
- [x] `config.h` – khai báo đầy đủ `DEVICE_ID`, `SECRET_KEY`, WiFi, MQTT, GPIO, `SEND_INTERVAL`
- [x] `wifi_manager.cpp` – kết nối WiFi, auto-reconnect, LED GPIO 0
- [x] `ntp_sync.cpp` – `configTime(UTC+7)`, `getCurrentTimestamp()` trả Unix timestamp
- [x] `hmac_util.cpp` – `computeHMAC()` dùng `mbedtls_md_hmac`, trả hex string 64 ký tự
- [x] `sensor_reader.cpp` – DHT22 GPIO 4, pull-up 10kΩ, `readSensor()` trả `SensorData`
- [x] `mqtt_sender.cpp` – build JSON payload, tính HMAC, publish topic `local/sensors/<ID>/data`
- [x] `main.cpp` – setup() khởi tạo đúng thứ tự, loop() với guard conditions + LED nháy khi gửi OK
- [x] Build thành công: `[SUCCESS]` – Flash 58%, RAM 14%, không có lỗi compile

---

## Task 15 – Firmware ESP32: Gateway Node (ESP32-S3 N16R8)

**Branch:** `hw/gateway-firmware-integration`
**Ngày hoàn thành:** 2026-05-21

---

### 1. Cập nhật `firmware/gateway-node/platformio.ini` – ESP32-S3 N16R8

Cấu hình đúng cho board **ESP32-S3 N16R8** (16MB Flash, 8MB OPI PSRAM):

```ini
[env:esp32s3-n16r8]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
monitor_rts = 0
monitor_dtr = 0

board_build.flash_size          = 16MB
board_build.flash_mode          = qio
board_build.partitions          = partitions_16MB.csv
board_build.arduino.memory_type = qio_opi   ; QIO Flash + OPI PSRAM (N16R8)

build_flags =
    -DCORE_DEBUG_LEVEL=0
    -DBOARD_HAS_PSRAM
    -DARDUINO_USB_CDC_ON_BOOT=1             ; Serial → USB CDC native
    -DARDUINO_USB_MODE=1

lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.5
```

**Các lỗi đã sửa so với cấu hình cũ:**

| Lỗi cũ | Sửa thành |
|---|---|
| `-mfix-esp32-psram-cache-issue` | Xóa – flag này chỉ dành cho ESP32 cổ điển, gây lỗi compile trên S3 |
| Không có `board_build.flash_size` | Thêm `16MB` |
| Không có partition table | Thêm `partitions_16MB.csv` |
| Không có PSRAM type | `board_build.arduino.memory_type = qio_opi` (OPI PSRAM của N16R8) |
| Không có USB CDC flag | `-DARDUINO_USB_CDC_ON_BOOT=1`, `-DARDUINO_USB_MODE=1` |

---

### 2. Tạo `firmware/gateway-node/partitions_16MB.csv`

Custom partition table cho 16MB flash:

```csv
# Name,   Type, SubType,  Offset,    Size
nvs,      data, nvs,      0x9000,    0x5000
otadata,  data, ota,      0xe000,    0x2000
app0,     app,  ota_0,    0x10000,   0x640000   ; 6.25 MB / slot
app1,     app,  ota_1,    0x650000,  0x640000
spiffs,   data, spiffs,   0xC90000,  0x360000   ; 3.375 MB user storage
coredump, data, coredump, 0xFF0000,  0x10000
```

---

### 3. Tạo `firmware/gateway-node/src/config_gw.h` – Gateway Config

File khai báo toàn bộ hằng số cấu hình cho Gateway Node:

| Hằng số | Mô tả |
|---|---|
| `GW_DEVICE_ID` | Device ID nhận từ `POST /api/devices/register` (vd: `"ESP32-GW-XXXXXXXX"`) |
| `GW_SECRET_KEY` | Secret key 64 ký tự hex nhận từ `POST /api/devices/register` |
| `WIFI_SSID` / `WIFI_PASS` | Thông tin WiFi |
| `MQTT_HOST` / `MQTT_PORT` | IP và port của MQTT broker |
| `MQTT_BUFFER_SIZE` | 1024 bytes – buffer cho MQTT payload |
| `BACKEND_URL` | `http://<ip>:3000/api/device/data` |
| `HTTP_TIMEOUT` | 10000 ms |
| `LED_WIFI_PIN` | GPIO 4 – LED ngoài báo WiFi (không dùng GPIO 0 = BOOT) |
| `LED_FWD_PIN` | GPIO 5 – LED ngoài nháy khi forward thành công |

**Lưu ý quan trọng về GPIO ESP32-S3:**
- GPIO 0 = BOOT button → **KHÔNG dùng làm LED**
- GPIO 2 trên S3 **KHÔNG** có onboard LED (khác ESP32 cổ điển)
- GPIO 48 = onboard RGB WS2812B → cần thư viện NeoPixel, không dùng `digitalWrite`
- GPIO 19/20 = USB D-/D+ → **KHÔNG dùng**
- Dùng LED ngoài trên GPIO 4, 5 (qua điện trở 220Ω–330Ω)

**Cấu trúc `KNOWN_SENSORS`** – danh sách sensor được phép forward:

```cpp
struct SensorCredential {
    const char* device_id;
    const char* secret_key;
};

static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "sensor-64-char-hex-secret-key" },
};
```

> ⚠️ File `config_gw.h` được thêm vào `.gitignore` để tránh commit credentials lên repo.

---

### 4. Tạo `firmware/gateway-node/src/wifi_manager.h/.cpp`

Tái sử dụng cấu trúc tương tự sensor-node, quản lý WiFi với auto-reconnect:

#### `wifiSetup()`
- `WiFi.mode(WIFI_STA)` → `WiFi.begin(SSID, PASS)`
- Polling tối đa 40 lần (×500ms = 20s)
- Thành công: `digitalWrite(LED_WIFI_PIN, HIGH)` + in IP

#### `wifiMaintain()`
- Phát hiện ngắt kết nối: `LED_WIFI_PIN LOW` + `WiFi.reconnect()`

#### `wifiIsConnected()`
- `return WiFi.status() == WL_CONNECTED`

---

### 5. Tạo `firmware/gateway-node/src/ntp_sync.h/.cpp`

Đồng bộ thời gian NTP – **bắt buộc trước khi xử lý HMAC**:

```cpp
void ntpSetup()             // configTime(UTC+7), polling tối đa 20 lần
unsigned long getCurrentTimestamp()  // time_t → Unix timestamp (giây)
bool ntpIsSynced()          // true nếu đã sync ít nhất 1 lần
```

> Gateway từ chối xử lý message MQTT nếu NTP chưa đồng bộ (timestamp sẽ không hợp lệ).

---

### 6. Tạo `firmware/gateway-node/src/hmac_util.h/.cpp`

Tính HMAC-SHA256 dùng **mbedtls built-in** của ESP32 (không cần lib ngoài):

```cpp
String computeHMAC(const String& key, const String& message);
```

Luồng tính toán:
1. `mbedtls_md_setup(&ctx, MBEDTLS_MD_SHA256, 1)` – HMAC mode
2. `mbedtls_md_hmac_starts/update/finish` – tính 32 bytes
3. Convert → hex string 64 ký tự lowercase

---

### 7. Tạo `firmware/gateway-node/src/mqtt_client.h/.cpp`

MQTT client subscribe wildcard để nhận dữ liệu từ mọi sensor:

#### `mqttClientSetup(cb)`
- `mqttClient.setServer(MQTT_HOST, MQTT_PORT)`
- `mqttClient.setBufferSize(1024)`
- Đăng ký callback `onMqttMessage` → null-terminate payload → gọi user callback

#### `mqttClientMaintain()`
- Nếu connected: `mqttClient.loop()` – xử lý MQTT heartbeat (non-blocking)
- Nếu mất kết nối: reconnect sau 5s throttle, auto re-subscribe wildcard `local/sensors/+/data`

#### MQTT Wildcard Subscribe:
```
Topic: local/sensors/+/data
```
Gateway nhận dữ liệu từ **tất cả sensor** qua wildcard `+`.

---

### 8. Tạo `firmware/gateway-node/src/forwarder.h/.cpp`

Module trung tâm – xác thực Sensor HMAC và forward lên Backend:

#### Luồng xử lý `forwardSensorData(topic, payload, length)`:

| Bước | Hành động | Kết quả khi thất bại |
|---|---|---|
| 1 | Parse JSON payload từ Sensor | Log lỗi + return |
| 2 | Kiểm tra đủ field bắt buộc (`sensor_id`, `sn_timestamp`, `sn_hmac`, `data`) | Log + return |
| 3 | Tra cứu `sensor_id` trong `KNOWN_SENSORS` | Log `REJECT – sensor không trong whitelist` + return |
| 4 | Kiểm tra timestamp window: `|now - sn_timestamp| ≤ 300s` | Log `REJECT – timestamp quá cũ/mới` + return |
| 5 | Xác thực Sensor HMAC bằng constant-time XOR | Log `REJECT – HMAC không hợp lệ` + return |
| 6 | Tính Gateway HMAC: `HMAC(GW_SECRET, "gw_id:gw_timestamp")` | — |
| 7 | Build payload đầy đủ 7 field | — |
| 8 | `HTTP POST /api/device/data` + xử lý response | Log HTTP error code |
| 9 | HTTP 200 → nháy LED_FWD_PIN + log OK | — |

#### Payload gửi lên Backend:
```json
{
  "gateway_id":   "ESP32-GW-XXXXXXXX",
  "gw_timestamp": 1716174600,
  "gw_hmac":      "64-char-hex",
  "sensor_id":    "ESP32-SN-YYYYYYYY",
  "sn_timestamp": 1716174600,
  "sn_hmac":      "64-char-hex",
  "data": { "temperature": 28.5, "humidity": 65.2 }
}
```

#### Constant-time HMAC comparison (chống timing attack):
```cpp
uint8_t diff = 0;
for (size_t i = 0; i < expected.length(); i++) {
    diff |= (uint8_t)(expected[i] ^ sn_hmac[i]);
}
return diff == 0;
```

---

### 9. Viết lại `firmware/gateway-node/src/main.cpp`

#### `setup()`
1. `Serial.begin(115200)` + banner khởi động
2. `pinMode(LED_FWD_PIN, OUTPUT)` – cấu hình LED GPIO 5
3. `wifiSetup()` – kết nối WiFi, LED GPIO 4
4. `ntpSetup()` – đồng bộ thời gian (cần WiFi)
5. `mqttClientSetup(onSensorMessage)` – subscribe `local/sensors/+/data`

#### `loop()`
1. `wifiMaintain()` – duy trì WiFi
2. `mqttClientMaintain()` – duy trì MQTT + xử lý message đến (non-blocking, không có `delay`)

#### Guard NTP trong callback:
```cpp
static void onSensorMessage(topic, payload, length) {
    if (!ntpIsSynced()) {
        // Bỏ qua – không thể xác thực timestamp
        return;
    }
    forwardSensorData(topic, payload, length);
}
```

---

### 10. Tạo `firmware/gateway-node/.vscode/c_cpp_properties.json`

Cấu hình IntelliSense cho VS Code trỏ đúng sang ESP32-S3 SDK:

| Mục | Giá trị |
|---|---|
| SDK include path | `tools/sdk/esp32s3/` (thay vì `esp32/` của sensor-node) |
| Variant | `variants/esp32s3` |
| Compiler | `toolchain-xtensa-esp32s3/bin/xtensa-esp32s3-elf-gcc.exe` |
| Defines | `ESP32S3`, `ARDUINO_ESP32S3_DEV`, `BOARD_HAS_PSRAM`, `ARDUINO_USB_CDC_ON_BOOT=1` |
| Thêm mới | `tools/sdk/esp32s3/include/usb/include`, `arduino_tinyusb` (USB native của S3) |

---

### Cấu trúc file đã tạo

```
firmware/gateway-node/
├── platformio.ini              # ESP32-S3 N16R8: 16MB Flash, OPI PSRAM, USB CDC
├── partitions_16MB.csv         # Custom partition table: 2×6.25MB OTA + 3.375MB SPIFFS
├── .vscode/
│   ├── c_cpp_properties.json   # IntelliSense → sdk/esp32s3/, toolchain-xtensa-esp32s3
│   └── extensions.json
└── src/
    ├── config_gw.h             # GW_DEVICE_ID, GW_SECRET_KEY, MQTT, Backend URL, GPIO 4/5
    ├── wifi_manager.h/.cpp     # WiFi kết nối + auto-reconnect + LED GPIO 4
    ├── ntp_sync.h/.cpp         # NTP UTC+7 + getCurrentTimestamp() + ntpIsSynced()
    ├── hmac_util.h/.cpp        # computeHMAC() dùng mbedtls built-in
    ├── mqtt_client.h/.cpp      # MQTT subscribe wildcard local/sensors/+/data
    ├── forwarder.h/.cpp        # Xác thực SN HMAC → tính GW HMAC → HTTP POST Backend
    └── main.cpp                # setup() + loop() non-blocking
```

---

### Serial Monitor Output mẫu

```
╔══════════════════════════════════╗
║   IoT Gateway Node – Khởi động   ║
╚══════════════════════════════════╝
  Gateway ID : ESP32-GW-A1B2C3D4
  Backend URL: http://192.168.1.100:3000/api/device/data

[WiFi] Connecting to 'MyNetwork'......... OK – IP: 192.168.1.106
[NTP] Syncing......... OK – 2026-05-21 09:00:00 (UTC+7)
[MQTT] Broker: 192.168.1.100:1883
[MQTT] Connecting as 'gw-ESP32-GW-A1B2C3D4'... OK
[MQTT] Subscribed to 'local/sensors/+/data'
[MAIN] Setup hoàn tất – lắng nghe sensor data...

[MQTT] Received on 'local/sensors/ESP32-SN-E5F6G7H8/data' (120 bytes)
[FWD] Sensor HMAC OK – 'ESP32-SN-E5F6G7H8'
[FWD] Payload (310 bytes): {"gateway_id":"ESP32-GW-A1B2C3D4","gw_timestamp":1716174600,...}
[FWD] Backend OK (200) – {"success":true,...}
```

---

### Checklist hoàn thành Task 15

- [x] `platformio.ini` – board `esp32-s3-devkitc-1`, `16MB` flash, `qio_opi` PSRAM, USB CDC flags
- [x] `partitions_16MB.csv` – partition table 2×OTA app (6.25MB) + SPIFFS (3.375MB)
- [x] `config_gw.h` – `GW_DEVICE_ID`, `GW_SECRET_KEY`, WiFi, MQTT, Backend URL, `LED_WIFI_PIN=4`, `LED_FWD_PIN=5`, `KNOWN_SENSORS[]`
- [x] Không dùng GPIO 0 (BOOT) và GPIO 2 (không có LED trên S3); không dùng GPIO 48 (WS2812B cần NeoPixel lib)
- [x] `wifi_manager.cpp` – kết nối WiFi, auto-reconnect, LED GPIO 4
- [x] `ntp_sync.cpp` – `configTime(UTC+7)`, `getCurrentTimestamp()`, `ntpIsSynced()`
- [x] `hmac_util.cpp` – `computeHMAC()` dùng `mbedtls_md_hmac`, trả hex string 64 ký tự
- [x] `mqtt_client.cpp` – subscribe wildcard `local/sensors/+/data`, auto-reconnect 5s throttle, non-blocking `mqttClient.loop()`
- [x] `forwarder.cpp` – parse JSON sensor, tra KNOWN_SENSORS, kiểm tra timestamp ±300s, xác thực SN HMAC constant-time, tính GW HMAC, HTTP POST Backend, nháy LED khi 200 OK
- [x] `main.cpp` – guard NTP trong callback, `loop()` không có `delay` (non-blocking)
- [x] `.vscode/c_cpp_properties.json` – IntelliSense trỏ đúng `sdk/esp32s3/`, compiler `xtensa-esp32s3-elf-gcc.exe`
