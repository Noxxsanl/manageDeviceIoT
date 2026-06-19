# IoT Device Manager — RBAC · Project Overview

Hệ thống quản lý thiết bị IoT end-to-end: từ firmware ESP32 thu thập cảm biến, qua dual MQTT broker, backend TypeScript xác thực HMAC, đến dashboard Next.js với phân quyền RBAC đầy đủ.

**Stack:** `TypeScript` · `Next.js 16` · `Express 5` · `ESP32 C++` · `MySQL 8` · `MQTT Mosquitto` · `Docker` · `HMAC-SHA256`

---

## Mục Lục

- [I. Kiến Trúc Hệ Thống](#i-kiến-trúc-hệ-thống)
- [II. Backend API](#ii-backend-api)
- [III. Database Schema](#iii-database-schema)
- [IV. Frontend Dashboard](#iv-frontend-dashboard)
- [V. Firmware ESP32](#v-firmware-esp32)
- [VI. Bảo Mật](#vi-bảo-mật)
- [VII. Hạ Tầng](#vii-hạ-tầng)
- [VIII. Tài Liệu](#viii-tài-liệu)

---

## I. Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────┐
│                   ⚡ Phần Cứng (ESP32 DOIT V1)              │
│                                                             │
│  🌡️ Sensor Node 1     🌡️ Sensor Node 2    📡 Gateway Node  │
│  DHT22 · GPIO4        DHT22 · GPIO4       Dual MQTT Client │
│  HMAC-SHA256          HMAC-SHA256         2-layer HMAC     │
└──────────┬────────────────┬───────────────────┬────────────┘
           │ publish        │ publish           │ subscribe
           ▼                ▼                   │
┌─────────────────────────────────┐             │
│  📶 MQTT Broker 1  :1883        │◄────────────┘
│  local/sensors/+/data           │
│  Sensor ↔ Gateway               │
└─────────────────┬───────────────┘
                  │ Gateway subscribe + validate + re-sign
                  ▼
┌─────────────────────────────────┐
│  📶 MQTT Broker 2  :1884        │
│  gateway/+/data                 │
│  Gateway → Backend              │
└─────────────────┬───────────────┘
                  │ mqttDataService subscribe
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              ⚙️ Backend (Express + TypeScript)  :5000       │
│                                                             │
│   REST API (/api/...)    mqttDataService    hmacService     │
└──────────────────────────────┬──────────────────────────────┘
                               │ SQL
                               ▼
                 ┌─────────────────────────┐
                 │  🗄️ MySQL 8.0  :3308    │
                 │  users · devices        │
                 │  sensor_data · audit    │
                 └─────────────────────────┘

🔀 Nginx :80  →  /        → Frontend :3000 (Next.js)
               →  /api/*  → Backend  :5000 (Express)

👤 Admin / Operator / Viewer  →  Browser  →  Nginx
```

### Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Express 5.x · TypeScript 6 · MySQL2 · MQTT.js · bcrypt · jsonwebtoken · helmet · morgan |
| **Frontend** | Next.js 16.2.5 · React 19.2.4 · TailwindCSS v4 · Recharts 3.8 · SWR · Lucide React · next-themes |
| **Firmware** | ESP32 C++ · PlatformIO · DHT22 |
| **Infra** | Mosquitto 2 (×2) · Docker Compose · Nginx Alpine · MySQL 8.0 |

---

## II. Backend API

### Authentication

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| `POST` | `/api/auth/login` | Đăng nhập → JWT cookie HttpOnly 8h | Public · Rate 10/15min |
| `POST` | `/api/auth/logout` | Xoá cookie JWT, kết thúc session | Đã đăng nhập |
| `GET` | `/api/auth/me` | Lấy thông tin user hiện tại | Đã đăng nhập |

### Devices

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| `POST` | `/api/devices/register` | Đăng ký thiết bị mới → trả về `device_id` + `secret_key` (chỉ 1 lần) | admin · operator |
| `GET` | `/api/devices` | Danh sách thiết bị kèm trạng thái online | Tất cả |
| `GET` | `/api/devices/:id` | Chi tiết thiết bị + 10 readings gần nhất | Tất cả |
| `GET` | `/api/devices/:id/data` | Lịch sử dữ liệu phân trang (`?page=&limit=`) | Tất cả |
| `PATCH` | `/api/devices/:id/status` | Đổi status: `active` / `inactive` / `blocked` | admin · operator |
| `DELETE` | `/api/devices/:id` | Xoá thiết bị (cascade sensor_data, tokens, audit) | admin · operator |

### Device Data _(HMAC-authenticated)_

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| `POST` | `/api/device/data` | HTTP fallback nhận dữ liệu cảm biến — xác thực 2 lớp HMAC · Rate 60/min | Device HMAC |
| `GET` | `/api/device/sensors` | Gateway lấy danh sách sensor đang active | Device HMAC |

### Users _(Admin only)_

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/api/users` | Danh sách tài khoản hệ thống | admin |
| `POST` | `/api/users` | Tạo tài khoản operator / viewer mới | admin |
| `PATCH` | `/api/users/:id/password` | Reset mật khẩu — bcrypt cost 12 | admin |
| `DELETE` | `/api/users/:id` | Xoá tài khoản (chặn self-delete và admin) | admin |

### Dashboard · Audit · Health

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | Tổng gateways/sensors, số online, data points | Tất cả |
| `GET` | `/api/audit-log` | Lọc theo event_type, device_id, date range (max 500) | Tất cả |
| `DELETE` | `/api/audit-log/data-recv` | Xoá toàn bộ DATA_RECV logs | admin · operator |
| `GET` | `/api/health` | Health check · `{"status":"ok"}` | Public |

### Services

| File | Mục đích |
|---|---|
| `hmacService.ts` | HMAC-SHA256 với `crypto.timingSafeEqual()` · cửa sổ timestamp ±300s · trả về lỗi typed: `NOT_FOUND` / `TIMESTAMP_EXPIRED` / `HMAC_MISMATCH` / `DEVICE_BLOCKED` |
| `mqttDataService.ts` | Subscribe `gateway/+/data` trên Broker 2 · xác thực 2 lớp HMAC · lưu DB · auto-block sau 5 lần lỗi |
| `auditLogger.ts` | Ghi sự kiện vào `audit_log` · tự prune DATA_RECV giữ 150 bản ghi mới nhất per device |
| `deviceStatus.ts` | Heartbeat monitor mỗi 30s · thiết bị online nếu `last_seen` trong vòng 60s |
| `mqttTracker.ts` | Theo dõi kết nối MQTT qua `$SYS/broker/log/N` · cập nhật `last_ip` cho thiết bị |

### Middleware

| File | Chức năng |
|---|---|
| `verifyJWT.ts` | Đọc JWT từ cookie HttpOnly → verify → attach `req.user` · reject nếu expired hoặc invalid |
| `rbac.ts` | `requireRole(...roles)` guard · trả 403 nếu user không đủ quyền |
| `validateDevice.ts` | Xác thực 2 lớp HMAC (Gateway → Sensor) · tăng `fail_count` mỗi lần lỗi · auto-block ở lần thứ 5 · ghi audit log |

---

## III. Database Schema

### Bảng dữ liệu

```
users
  id            INT PK
  username      VARCHAR(64) UNIQUE
  password_hash VARCHAR(255)
  role          ENUM('admin','operator','viewer')
  created_at    DATETIME

devices
  id            INT PK
  device_id     VARCHAR(64) UNIQUE
  device_name   VARCHAR(128)
  device_type   ENUM('sensor','gateway')
  secret_key    VARCHAR(64)
  status        ENUM('inactive','active','blocked')  DEFAULT 'inactive'
  fail_count    TINYINT UNSIGNED                     DEFAULT 0
  last_seen     DATETIME
  last_ip       VARCHAR(45)
  created_by    INT FK → users.id
  created_at    DATETIME

sensor_data
  id            INT PK
  device_id     INT FK → devices.id   (sensor)
  gateway_id    INT FK → devices.id   (gateway)
  payload       JSON
  received_at   DATETIME

device_tokens
  id            INT PK
  device_id     INT FK → devices.id
  token         VARCHAR(255)
  expires_at    DATETIME
  created_at    DATETIME

audit_log
  id            INT PK
  event_type    VARCHAR(64)
  device_id     INT FK → devices.id
  user_id       INT FK → users.id
  details       JSON
  created_at    DATETIME
```

### Audit Event Types

| Event | Ý nghĩa |
|---|---|
| `DEVICE_REGISTER` | Thiết bị đăng ký mới |
| `DEVICE_STATUS_CHANGE` | Thay đổi trạng thái |
| `GATEWAY_AUTH_FAIL` | Lỗi xác thực HMAC gateway |
| `SENSOR_AUTH_FAIL` | Lỗi xác thực HMAC sensor |
| `DEVICE_BLOCKED` | Thiết bị bị auto-block |
| `DATA_RECV` | Nhận dữ liệu cảm biến thành công |

### Data Retention & Indexes

- `sensor_data` — giữ **150 records** mới nhất / sensor (auto-prune)
- `audit_log` DATA_RECV — giữ **150 records** mới nhất / device
- Index: `(device_id, received_at)` cho paginated query
- Index: `(event_type, created_at)` cho log filter
- Seeded: tài khoản `admin` mặc định (bcrypt)
- Character set: `utf8mb4_unicode_ci`

---

## IV. Frontend Dashboard

### Pages & Routes

| Route | Trang | Tính năng |
|---|---|---|
| `/login` | Đăng nhập | Form đăng nhập · JWT cookie · redirect sau login |
| `/dashboard` | Tổng quan | Stats cards (gateway/sensor total + online) · data points count · real-time refresh |
| `/devices` | Thiết bị | Bảng danh sách · filter trạng thái · badge online · nút đăng ký / xoá / đổi status |
| `/devices/[id]` | Chi tiết thiết bị | Metrics panel · biểu đồ Recharts · sensor history · security panel (HMAC credentials) |
| `/users` | Quản lý user | Tạo / reset mật khẩu / xoá tài khoản operator, viewer |
| `/audit` | Audit Log | Lọc theo event type, device_id, date range · hiển thị 500 events mới nhất |

> Route layout: `/account/*` (public) và `/private/*` (yêu cầu JWT). Middleware Next.js tự redirect về login nếu chưa xác thực.

### Components (22 TSX files)

| Component | Mô tả |
|---|---|
| `DeviceTable` + `DeviceRow` | Bảng thiết bị có sort, filter trạng thái, hành động inline |
| `DeviceCard` + `DeviceGrid` | Hiển thị dạng card grid |
| `AddDeviceModal` + `RegisterModal` | Dialog đăng ký thiết bị mới, hiện secret key 1 lần |
| `DeviceActivityChart` + `SensorChart` | Recharts line chart cho temperature/humidity theo thời gian |
| `DeviceDetailHeader` + `DeviceMetrics` | Panel chi tiết: uptime, last_seen, fail_count, IP |
| `DeviceSecurityPanel` | Hiển thị HMAC credentials để nạp vào firmware |
| `DeviceStatusBadge` + `OnlineIndicator` | Badge màu active/blocked/inactive · dot blink khi online |
| `StatsCard` + `StatCard` | Cards số liệu tổng hợp trên dashboard |
| `AuditLogTable` + `LogTable` | Bảng audit log với color-coded event types |
| `button` / `input` / `select` / `dialog` / `ConfirmDialog` | Primitive UI components |

---

## V. Firmware ESP32

### Sensor Node (×2)

_Files: `firmware/sensor-node/` và `firmware/sensor-node-2/`_

| Tính năng | Chi tiết |
|---|---|
| Đọc cảm biến | DHT22 (GPIO4) · nhiệt độ (°C) + độ ẩm (%) · mỗi 5000ms |
| HMAC-SHA256 | Ký `sensor_id:timestamp` bằng `secret_key` từ `config.h` |
| Publish MQTT | Broker 1 `:1883` · topic: `local/sensors/{sensor_id}/data` |
| NTP Sync | Đồng bộ thời gian để timestamp nằm trong cửa sổ ±300s |
| WiFi Manager | Kết nối WiFi 2.4GHz, tự reconnect khi mất kết nối |
| Config | `config.h` — device credentials, WiFi SSID/pass, MQTT host, DHT pin |

### Gateway Node (×1)

_File: `firmware/gateway-node/`_

| Tính năng | Chi tiết |
|---|---|
| Dual MQTT Client | Kết nối đồng thời Broker 1 (:1883) và Broker 2 (:1884) |
| Xác thực Sensor | Kiểm tra timestamp ±300s + HMAC-SHA256 của mỗi sensor message |
| Sensor Registry | Whitelist local + fetch từ `GET /api/device/sensors` mỗi 5 phút |
| Re-sign | Ký lại toàn bộ payload bằng `GW_SECRET_KEY` trước khi forward |
| Forward | Publish tới Broker 2 · topic: `gateway/{gateway_id}/data` |
| Config | `config_gw.h` — gateway credentials, Broker 1/2 hosts, Backend URL |

### C++ Libraries

| Library | Mục đích |
|---|---|
| `hmac_util.*` | Tính HMAC-SHA256 thuần C++ |
| `mqtt_client.*` | Dual subscription/publication management |
| `ntp_sync.*` | Đồng bộ NTP, lấy Unix timestamp hiện tại |
| `wifi_manager.*` | Kết nối WiFi với auto-reconnect |
| `sensor_registry.*` | Quản lý whitelist sensor, fetch từ backend |
| `forwarder.*` | Logic chuyển tiếp message từ Broker 1 → Broker 2 |

---

## VI. Bảo Mật

### 2-Layer HMAC Authentication

```
Sensor Node
  └─► HMAC_SHA256(secret_key, "sn_id:timestamp")
  └─► publish → Broker 1 → {sn_id, sn_timestamp, sn_hmac, temperature, humidity}

Gateway Node
  └─► subscribe Broker 1
  └─► verify sn_hmac + check timestamp ±300s
  └─► HMAC_SHA256(gw_secret, "gw_id:timestamp")
  └─► publish → Broker 2 → {gw_id, gw_timestamp, gw_hmac, [sensor_payload]}

Backend (mqttDataService)
  └─► subscribe Broker 2
  └─► Layer 1: verify gw_hmac
  └─► Layer 2: verify sn_hmac
  └─► INSERT sensor_data
  └─► UPDATE last_seen, fail_count = 0
```

**Cơ chế bảo vệ:**
- `crypto.timingSafeEqual()` — chống timing attack
- Timestamp window ±300s — chống replay attack
- Mỗi device có `secret_key` riêng trong DB
- Secret key chỉ trả về 1 lần khi register

**Điều kiện tăng `fail_count`:**

| Error | Tăng fail_count? |
|---|---|
| `NOT_FOUND` | Không |
| `DEVICE_BLOCKED` | Không |
| `TIMESTAMP_EXPIRED` | **Có** |
| `HMAC_MISMATCH` | **Có** |

### RBAC — Phân Quyền 3 Tầng

| Role | Quyền | Hạn chế |
|---|---|---|
| `admin` | Toàn quyền: CRUD users, devices, xoá audit log | Không tự xoá bản thân. Không xoá admin khác. |
| `operator` | Đăng ký thiết bị, quản lý devices, xem audit log | Không quản lý users. Không xoá tài khoản. |
| `viewer` | Xem devices, dashboard, lịch sử dữ liệu | Chỉ đọc — không ghi bất kỳ thao tác nào. |

### Auto-Block Mechanism

| Thông số | Giá trị |
|---|---|
| `BLOCK_THRESHOLD` | **5** lần fail liên tiếp |
| Timestamp window | **300s** |
| Luồng kích hoạt | REST API middleware + MQTT service (độc lập, chung `fail_count`) |
| Reset sau unblock | `fail_count = 0` khi admin set `status = 'active'` |
| Reset khi auth OK | `fail_count = 0` sau mỗi lần xác thực thành công |

> `fail_count` được chia sẻ giữa REST và MQTT: 3 lần lỗi qua REST + 2 lần qua MQTT = block ngay. Xem chi tiết tại [AUTO_BLOCK_FLOWCHART.html](AUTO_BLOCK_FLOWCHART.html).

### Rate Limiting

| Endpoint | Giới hạn |
|---|---|
| `POST /api/auth/login` | 10 requests / 15 phút / IP |
| `POST /api/device/data` | 60 requests / phút / IP |
| Tất cả API còn lại | 100 requests / 15 phút / IP |

### JWT & Password Security

- JWT expiration: **8 giờ** · cookie `HttpOnly`, `SameSite=Strict`
- bcrypt cost factor: **12**
- Timing-safe comparison cho HMAC và bcrypt

---

## VII. Hạ Tầng

### Docker Services

| Service | Image | Port | Mô tả |
|---|---|---|---|
| `mysql` | mysql:8.0 | :3308 | Database chính, persistent volume, auto-run migrations |
| `mqtt-broker-1` | eclipse-mosquitto:2 | :1883 | Sensor ↔ Gateway · topic: `local/sensors/+/data` |
| `mqtt-broker-2` | eclipse-mosquitto:2 | :1884 | Gateway → Backend · topic: `gateway/+/data` |
| `backend` | Node.js 20 | :5000 | Express API + MQTT subscriber |
| `frontend` | Node.js 20 | :3000 | Next.js 16 SSR dashboard |
| `nginx` | nginx:alpine | :80 | Reverse proxy, SSL-ready, route `/api` → backend |

Tất cả services trên `iot-network` bridge, volumes persist qua restart.

### Dual MQTT Broker — Lý do tách biệt

```
┌─ Zone 1 · Local Network ────────────────────┐
│  Sensor 1 ──┐                               │
│  Sensor 2 ──┼──► Broker 1 :1883 ──► Gateway │
│             └── local/sensors/+/data        │
└─────────────────────────────────────────────┘
                              │ re-sign + publish
                              ▼
┌─ Zone 2 · Backend Network ──────────────────┐
│  Broker 2 :1884 ──► Backend API :5000       │
│  gateway/+/data                             │
└─────────────────────────────────────────────┘
```

Sensor và backend **không có đường truyền trực tiếp** — mọi data đều phải qua gateway validate và re-sign.

### Setup Scripts

| Script | Dùng cho |
|---|---|
| `scripts/setup.sh` | Linux / macOS / WSL — auto-detect compose v1/v2, tạo `.env`, launch stack |
| `scripts/setup.bat` | Windows PowerShell — tương đương setup.sh |
| `scripts/attack_demo.sh` | Demo kịch bản tấn công để test auto-block và rate limiting |

### Biến Môi Trường (`.env`)

```env
PORT=5000
DB_HOST=mysql
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=<min 32 chars>
MQTT_HOST=mqtt-broker-2
MQTT_PORT=1883
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

---

## VIII. Tài Liệu

| File | Mô tả |
|---|---|
| [FIRMWARE_FLOWCHART.html](FIRMWARE_FLOWCHART.html) | Sơ đồ kiến trúc firmware ESP32: sensor, gateway, HMAC, WiFi, full E2E flow |
| [AUTO_BLOCK_FLOWCHART.html](AUTO_BLOCK_FLOWCHART.html) | Chi tiết cơ chế tự block: REST + MQTT paths, state machine, recovery flow |
| [PROJECT_OVERVIEW.html](PROJECT_OVERVIEW.html) | Bản HTML của tài liệu tổng hợp này |
| `docs/THREAT_MODEL_SECURITY.md` | Phân tích threat model theo STRIDE — attack vectors, countermeasures |
| `docs/RBAC_CHI_TIET.md` | Bảng phân quyền chi tiết từng endpoint theo role |
| `docs/LUONG_DU_LIEU_IOT.md` | Sơ đồ luồng dữ liệu end-to-end từ cảm biến đến dashboard |
| `docs/GIAO_TIEP_HE_THONG.md` | Hướng dẫn tích hợp các thành phần, protocol specs |
| `docs/KET_QUA_TRIEN_KHAI.md` | Kết quả triển khai, performance benchmarks |
| `docs/STATUS_CODES.md` | Danh sách HTTP status codes và error codes của API |
| `docs/IoT_Security_Project_v3_2.md` | Báo cáo học thuật — thiết kế, phân tích bảo mật, đánh giá kết quả |
| `docs/CAU_HOI_PHAN_BIEN.md` | Q&A phản biện về thiết kế và quyết định kỹ thuật |
| `CHAY_LOCAL.md` | Hướng dẫn chạy local development không cần Docker |
| `HUONG_DAN.md` | Hướng dẫn tổng hợp tiếng Việt |
| `README.md` | Cài đặt, cấu hình, API reference đầy đủ |
