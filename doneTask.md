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
