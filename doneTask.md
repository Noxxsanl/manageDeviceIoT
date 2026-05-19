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
