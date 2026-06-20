# IoT Device Manager — RBAC

Hệ thống quản lý thiết bị IoT full-stack với bảo mật nhiều lớp: dashboard web, REST API, firmware ESP32 và phân quyền RBAC (Role-Based Access Control).

---

## Mục lục

- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Tech Stack](#tech-stack)
- [Phần 1 — Docker (khuyến nghị)](#phần-1--chạy-hệ-thống-bằng-docker)
- [Phần 2 — Local Development](#phần-2--chạy-local-không-dùng-docker)
- [Phần 3 — Firmware ESP32](#phần-3--cấu-hình-và-flash-firmware-esp32)
- [Phần 4 — API Documentation](#phần-4--api-documentation)
- [Phần 5 — Biến môi trường](#phần-5--biến-môi-trường)
- [Phần 6 — Cơ sở dữ liệu](#phần-6--cơ-sở-dữ-liệu)
- [Phần 7 — Bảo mật](#phần-7--bảo-mật)

---

## Kiến trúc hệ thống

### Cấu trúc thư mục

```
managerDeviceIoT-RBAC/
├── frontend/                  Next.js 16 + React 19 + TailwindCSS v4    → :3000
├── backend/                   Express 5 + TypeScript + MySQL             → :5000
├── firmware/
│   ├── gateway-node/          ESP32: xác thực 2 lớp + forward qua dual MQTT
│   ├── sensor-node/           ESP32: đọc DHT22 + publish MQTT Broker 1
│   └── sensor-node-2/         ESP32: sensor thứ 2 (cấu hình tương tự)
├── database/
│   └── migrations/            001_schema.sql — MySQL 8.0
├── mosquitto/
│   ├── broker1/               MQTT Broker 1 (Sensor ↔ Gateway)          → :1883
│   └── broker2/               MQTT Broker 2 (Gateway → Backend)         → :1884
├── nginx/                     Reverse Proxy                              → :80
├── scripts/
│   ├── setup.bat              Windows: tự động setup
│   └── setup.sh               Linux / macOS / WSL: tự động setup
├── docs/                      14 tài liệu kỹ thuật chi tiết
├── docker-compose.yml         Development stack (6 services)
└── docker-compose.prod.yml    Production stack
```

### Luồng dữ liệu

```
[Sensor Node — ESP32 DOIT V1]
  ├─ Đọc DHT22 mỗi 5 giây (nhiệt độ / độ ẩm)
  ├─ Ký HMAC-SHA256(secret_key, "device_id:unix_timestamp")
  └─ Publish MQTT → Broker 1 :1883   topic: local/sensors/{sensor_id}/data

[MQTT Broker 1 — Mosquitto :1883]   ← Lớp cô lập Sensor ↔ Gateway

[Gateway Node — ESP32 DOIT V1]
  ├─ Subscribe Broker 1: local/sensors/+/data
  ├─ Xác thực: whitelist + timestamp ±300s + Sensor HMAC (cục bộ, offline)
  ├─ Fetch danh sách sensor từ Backend mỗi 5 phút: GET /api/device/sensors
  ├─ Ký lại Gateway HMAC bằng secret_key riêng
  └─ Publish MQTT → Broker 2 :1884   topic: gateway/{gw_id}/data

[MQTT Broker 2 — Mosquitto :1884]   ← Lớp Gateway → Backend (có log_dest)

[Backend — Express :5000]
  ├─ Subscribe Broker 2: gateway/+/data
  ├─ Xác thực 2 lớp độc lập: Gateway HMAC + Sensor HMAC
  ├─ Lưu vào MySQL → bảng sensor_data (giữ tối đa 150 bản ghi/thiết bị)
  ├─ Cập nhật last_seen, fail_count, last_ip
  └─ Ghi audit_log (DATA_RECV / AUTH_FAIL / REPLAY_ATTACK / DEVICE_BLOCKED)

[MySQL 8.0 :3308]   ← Lưu trữ chính

[Frontend — Next.js :3000]
  └─ REST API polling: /api/devices, /api/dashboard/stats
     Hiển thị dashboard, biểu đồ Recharts, lịch sử dữ liệu
```

**Lý do dùng 2 MQTT Broker riêng biệt:**
- Broker 1 (`:1883`): Vùng cục bộ — Sensor và Gateway cùng mạng LAN. Nếu Broker 1 bị tấn công, dữ liệu giả không vào được Broker 2 vì Gateway kiểm tra HMAC trước khi forward.
- Broker 2 (`:1884`): Chỉ Gateway đã xác thực mới được publish. Backend chỉ nhận dữ liệu qua luồng này.

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | Next.js 16.2.5, React 19.2.4, TailwindCSS v4, Recharts 3.8.1, SWR 2.4.1 |
| **Backend** | Node.js 20, Express 5, TypeScript 6, mysql2, mqtt.js 5 |
| **Database** | MySQL 8.0 |
| **MQTT** | Eclipse Mosquitto 2 (×2 instance) |
| **Security** | bcrypt (cost 12), jsonwebtoken (JWT, 8h), HMAC-SHA256, helmet, express-rate-limit |
| **Firmware** | C++ / PlatformIO, ESP32 DOIT V1, DHT22, MQTT 5 |
| **Infrastructure** | Docker Compose, Nginx Alpine, multi-stage Docker builds |

---

## Phần 1 — Chạy hệ thống bằng Docker

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop) >= 24.x (đang chạy)
- Các cổng chưa bị chiếm: `80`, `3000`, `5000`, `1883`, `1884`, `3308`

### Bước 1.1 — Tạo file môi trường

```bash
# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env

# Linux / macOS / WSL
cp backend/.env.example backend/.env
```

Nội dung mặc định của `backend/.env` khi chạy Docker:

```env
PORT=5000
DB_HOST=mysql
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=dev_secret_please_change_in_production_min32chars
MQTT_HOST=mqtt-broker-2
MQTT_PORT=1883
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> Khi chạy Docker: `DB_HOST=mysql` và `MQTT_HOST=mqtt-broker-2` là tên service nội bộ.
> `MQTT_PORT=1883` là cổng **nội bộ** container; khi chạy local dev dùng `MQTT_PORT=1884`.

### Bước 1.2 — Build và khởi động

**Tự động (khuyến nghị):**

```bat
# Windows
scripts\setup.bat
```

```bash
# Linux / macOS / WSL
bash scripts/setup.sh
```

**Hoặc thủ công:**

```bash
docker compose up -d --build
```

> Lần đầu mất 3–5 phút để pull image và build. Các lần sau nhanh hơn nhờ Docker layer cache.

### Bước 1.3 — Kiểm tra trạng thái

```bash
docker compose ps
```

Kết quả mong đợi — tất cả phải `running (healthy)` hoặc `running`:

```
NAME                 STATUS                  PORTS
iot-nginx            running                 0.0.0.0:80->80/tcp
iot-frontend         running                 0.0.0.0:3000->3000/tcp
iot-backend          running (healthy)       0.0.0.0:5000->5000/tcp
iot-mqtt-broker-1    running                 0.0.0.0:1883->1883/tcp
iot-mqtt-broker-2    running                 0.0.0.0:1884->1883/tcp
iot-mysql            running (healthy)       0.0.0.0:3308->3306/tcp
```

Nếu có service bị `Exit`:

```bash
docker compose logs backend
docker compose logs mysql
docker compose logs mqtt-broker-1
```

### Bước 1.4 — Truy cập hệ thống

| Dịch vụ | URL |
|---------|-----|
| **Dashboard (qua Nginx)** | http://localhost |
| **Dashboard (trực tiếp)** | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **Health check** | http://localhost:5000/api/health |
| **MQTT Broker 1** | mqtt://localhost:1883 |
| **MQTT Broker 2** | mqtt://localhost:1884 |

**Tài khoản mặc định:**

| Trường | Giá trị |
|--------|---------|
| Username | `admin` |
| Password | `admin123` |

### Bước 1.5 — Kiểm tra nhanh

```bash
curl http://localhost:5000/api/health
```

```json
{ "status": "ok", "message": "Backend running" }
```

### Lệnh Docker hay dùng

```bash
# Xem trạng thái
docker compose ps

# Log realtime
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend

# Restart một service
docker compose restart backend

# Dừng (giữ data)
docker compose down

# Dừng và xóa toàn bộ data (reset sạch)
docker compose down -v

# Rebuild sau khi sửa code
docker compose up -d --build backend
docker compose up -d --build frontend

# Production build
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Phần 2 — Chạy Local (không dùng Docker)

### Yêu cầu

- Node.js >= 20, npm >= 10
- MySQL 8.0 (chạy sẵn, tạo DB theo `database/migrations/001_schema.sql`)
- Mosquitto MQTT Broker (2 instance: port 1883 và 1884)

### Backend

```bash
cd backend
cp .env.example .env
# Sửa .env: DB_HOST=localhost, MQTT_HOST=localhost, MQTT_PORT=1884
npm install
npm run dev
# API chạy tại http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard chạy tại http://localhost:3000
```

> Có thể dùng Docker chỉ cho MySQL và Mosquitto, còn Backend/Frontend chạy local:
> ```bash
> docker compose up -d mysql mqtt-broker-1 mqtt-broker-2
> ```

---

## Phần 3 — Cấu hình và Flash Firmware ESP32

> **Thứ tự bắt buộc**: Đăng ký thiết bị trên Web → Flash Sensor → Flash Gateway.
> Gateway cần `device_id` + `secret_key` của các Sensor để xây dựng whitelist xác thực.

### Yêu cầu phần cứng

| Linh kiện | Số lượng | Ghi chú |
|-----------|----------|---------|
| ESP32 DevKit V1 (30-pin) | 2 | 1 Gateway + 1 Sensor (hoặc nhiều hơn) |
| Cảm biến DHT22 (AM2302) | 1 / Sensor | Nhiệt độ & độ ẩm |
| Điện trở 10kΩ | 1 / DHT22 | Pull-up bắt buộc cho chân DATA |
| Dây jumper | Vài cái | |
| Cáp USB Micro-B (có data) | 2 | Cáp chỉ sạc sẽ không flash được |

### Sơ đồ kết nối DHT22 → ESP32 Sensor Node

```
ESP32 (DOIT V1)         DHT22 (AM2302)
──────────────────────────────────────────────────
3V3  ────────────────── Pin 1 (VCC)   [trái nhất]
GPIO4 ──┬────────────── Pin 2 (DATA)  [thứ 2]
        │
       10kΩ  (nối từ DATA lên 3V3)
        │
3V3  ──┘
GND  ────────────────── Pin 4 (GND)   [phải nhất]
                        Pin 3: không nối (N/C)
```

> **Bắt buộc**: Không có điện trở 10kΩ pull-up, DHT22 trả về `NaN` liên tục.

### Yêu cầu phần mềm — PlatformIO

Firmware dùng **PlatformIO**, không phải Arduino IDE thông thường.

- **Cách khuyến nghị**: Cài extension **PlatformIO IDE** trong VS Code
- **CLI**: `pip install platformio` (cần Python >= 3.8)

Sau khi cài, khởi động lại VS Code. PlatformIO tự nhận `platformio.ini` khi mở thư mục firmware.

---

### Bước 3.1 — Xác định IP máy chủ

ESP32 cần biết IP của máy tính đang chạy MQTT Broker và Backend.

```bash
# Windows
ipconfig
# Tìm dòng "IPv4 Address" của adapter WiFi đang dùng → ví dụ: 192.168.1.100

# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

> Máy tính và tất cả ESP32 phải kết nối **cùng một mạng WiFi 2.4 GHz**.

---

### Bước 3.2 — Đăng ký thiết bị trên Dashboard

Phải đăng ký **trước khi flash** để lấy `device_id` và `secret_key`.

1. Truy cập **http://localhost** → đăng nhập (`admin` / `admin123`)
2. Vào **Devices** → click **"Thêm thiết bị"**
3. Đăng ký **Gateway Node**: nhập tên, chọn Type = `gateway` → Lưu → **sao chép ngay** `device_id` và `secret_key`
4. Đăng ký **Sensor Node**: nhập tên, chọn Type = `sensor` → Lưu → **sao chép ngay** `device_id` và `secret_key`

> `secret_key` là chuỗi hex 64 ký tự, chỉ hiển thị **một lần duy nhất** khi đăng ký. Lưu ngay vào file tạm.

---

### Bước 3.3 — Flash Sensor Node (làm trước)

Mở file cấu hình: `firmware/sensor-node/include/config.h`

```cpp
// === Device credentials (lấy từ Bước 3.2) ===
#define DEVICE_ID   "ESP32-SN-XXXXXXXX"    // device_id đã đăng ký
#define SECRET_KEY  "abcdef1234...."       // secret_key 64 ký tự hex

// === WiFi (chỉ hỗ trợ 2.4 GHz) ===
#define WIFI_SSID   "TenMangWifi"
#define WIFI_PASS   "MatKhauWifi"

// === MQTT Broker 1 (IP máy chạy Docker từ Bước 3.1) ===
#define MQTT_HOST   "192.168.1.100"
#define MQTT_PORT   1883

// === Cảm biến DHT22 ===
#define DHT_PIN        4                  // GPIO4 kết nối chân DATA
#define DHT_TYPE       DHT22
#define SEND_INTERVAL  5000              // gửi mỗi 5 giây (ms)
```

Flash firmware:

```bash
cd firmware/sensor-node
pio run --target upload
```

Kiểm tra Serial Monitor (115200 baud) — kết quả thành công:

```
[WiFi] Kết nối thành công! IP: 192.168.1.105
[NTP]  Đồng bộ thành công
[MQTT] Kết nối broker 192.168.1.100:1883
[MQTT] Publish → local/sensors/ESP32-SN-XXXXXXXX/data
[MQTT] Gửi thành công
```

---

### Bước 3.4 — Flash Gateway Node (làm sau Sensor)

Mở file cấu hình: `firmware/gateway-node/include/config_gw.h`

```cpp
// === Gateway credentials (lấy từ Bước 3.2) ===
#define GW_DEVICE_ID   "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY  "abcdef1234...."

// === WiFi ===
#define WIFI_SSID   "TenMangWifi"
#define WIFI_PASS   "MatKhauWifi"

// === MQTT Broker 1 — Subscribe nhận dữ liệu từ Sensor ===
#define MQTT_BROKER1_HOST  "192.168.1.100"
#define MQTT_BROKER1_PORT  1883

// === MQTT Broker 2 — Publish gửi dữ liệu lên Backend ===
#define MQTT_BROKER2_HOST  "192.168.1.100"
#define MQTT_BROKER2_PORT  1884

// === URL lấy danh sách sensor từ Backend ===
#define BACKEND_SENSORS_URL  "http://192.168.1.100/api/device/sensors"

// === Whitelist sensor cục bộ (backup khi backend chưa sẵn sàng) ===
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "secret_key_64_chars_hex" },
    // thêm sensor nếu có nhiều hơn
};
```

> Gateway duy trì **2 kết nối MQTT song song**: subscribe Broker 1 để nhận từ Sensor, publish Broker 2 để chuyển lên Backend.
> `KNOWN_SENSORS` là whitelist backup khi backend chưa khởi động; Gateway tự cập nhật mỗi 5 phút.

Flash firmware:

```bash
cd firmware/gateway-node
pio run --target upload
```

Kiểm tra Serial Monitor (115200 baud) — kết quả thành công:

```
╔══════════════════════════════════╗
║   IoT Gateway Node – Starting    ║
╚══════════════════════════════════╝
[WiFi]    Kết nối thành công!
[NTP]     Đồng bộ thành công
[MQTT-SUB] Broker 1: 192.168.1.100:1883 → OK
[MQTT-SUB] Subscribed: local/sensors/+/data
[MQTT-PUB] Broker 2: 192.168.1.100:1884 → OK
[Registry] Đã lấy danh sách sensor từ backend
[MAIN]    Ready – listening for sensor data...
```

---

### Bước 3.5 — Kích hoạt thiết bị trên Dashboard

Sau khi flash, thiết bị có trạng thái `inactive`. Cần kích hoạt thủ công:

1. Vào **http://localhost/devices**
2. Tìm Gateway và Sensor vừa đăng ký
3. Click **"Kích hoạt"** (đổi status → `active`) cho từng thiết bị

> Thiết bị ở trạng thái `inactive` hoặc `blocked` sẽ bị backend **từ chối toàn bộ dữ liệu**.

---

### Bước 3.6 — Xác nhận dữ liệu lên Dashboard

Truy cập **http://localhost** → **Dashboard**.

Khi hệ thống hoạt động bình thường:
- Biểu đồ nhiệt độ / độ ẩm cập nhật mỗi ~5 giây
- Trạng thái thiết bị hiển thị **online** (last_seen < 60 giây)
- Trang `/audit` xuất hiện sự kiện `DATA_RECV` mới

---

## Phần 4 — API Documentation

### Authentication

Tất cả API (trừ `/api/health` và `/api/auth/login`) yêu cầu JWT trong cookie `token` (HttpOnly, SameSite=Strict, 8 giờ).

---

### Auth

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `POST` | `/api/auth/login` | Public (rate: 10/15min) | Đăng nhập, trả về Set-Cookie |
| `POST` | `/api/auth/logout` | JWT | Xóa cookie |
| `GET` | `/api/auth/me` | JWT | Thông tin user hiện tại |

**POST `/api/auth/login` — Body:**

```json
{ "username": "admin", "password": "admin123" }
```

Response: HTTP 200, Set-Cookie `token` (HttpOnly JWT 8 giờ).

---

### Devices

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/api/devices/register` | admin, operator | Đăng ký thiết bị mới |
| `GET` | `/api/devices` | Tất cả | Danh sách thiết bị + trạng thái online |
| `GET` | `/api/devices/:id` | Tất cả | Chi tiết + 10 bản ghi cảm biến gần nhất |
| `GET` | `/api/devices/:id/data` | Tất cả | Lịch sử dữ liệu phân trang (`?page=1&limit=20`) |
| `PATCH` | `/api/devices/:id/status` | admin, operator | Đổi trạng thái (active / inactive / blocked) |
| `DELETE` | `/api/devices/:id` | admin | Xóa thiết bị và toàn bộ dữ liệu liên quan |

**POST `/api/devices/register` — Body:**

```json
{
  "device_name": "Sensor phòng khách",
  "device_type": "sensor",
  "location": "Phòng khách tầng 1"
}
```

**Response 201:**

```json
{
  "success": true,
  "device": {
    "device_id": "ESP32-SN-A1B2C3D4",
    "device_name": "Sensor phòng khách",
    "device_type": "sensor",
    "status": "inactive",
    "secret_key": "64-char-hex-string"
  }
}
```

> `secret_key` chỉ trả về **một lần duy nhất** khi đăng ký.

---

### Device Data (Firmware)

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `GET` | `/api/device/sensors` | Gateway HMAC | Gateway lấy danh sách sensor active (cache 5 phút) |
| `POST` | `/api/device/data` | HMAC (rate: 60/min) | Nhận dữ liệu cảm biến qua HTTP fallback |

> Luồng chính: Gateway gửi dữ liệu qua **MQTT** (`gateway/{gw_id}/data`), không phải HTTP.
> `POST /api/device/data` là fallback và dùng cho mục đích test.

---

### Dashboard

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/dashboard/stats` | Tất cả | Thống kê tổng quan |

**Response:**

```json
{
  "total_gateway": 1,
  "total_sensor": 2,
  "gateway_online": 1,
  "sensor_online": 2,
  "total_data_points": 1500
}
```

---

### Users (Admin only)

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/users` | admin | Danh sách users |
| `POST` | `/api/users` | admin | Tạo user mới (role: operator hoặc viewer) |
| `PATCH` | `/api/users/:id/password` | admin | Đặt lại mật khẩu |
| `DELETE` | `/api/users/:id` | admin | Xóa user |

**POST `/api/users` — Body:**

```json
{
  "username": "operator1",
  "password": "securepassword",
  "role": "operator"
}
```

---

### Audit Log

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/audit-log` | Tất cả | Xem nhật ký bảo mật (tối đa 500, lọc theo role) |
| `DELETE` | `/api/audit-log/data-recv` | admin | Xóa log DATA_RECV |
| `DELETE` | `/api/audit-log/by-type` | admin | Xóa log theo loại event |
| `DELETE` | `/api/audit-log/bulk` | admin | Xóa nhiều log theo ID |

**GET `/api/audit-log` — Query params:**

| Param | Ví dụ | Mô tả |
|-------|-------|-------|
| `event_type` | `AUTH_FAIL` | Lọc theo loại sự kiện |
| `device_id` | `ESP32-GW-001` | Lọc theo thiết bị |
| `from` | `2025-01-01` | Từ ngày |
| `to` | `2025-12-31` | Đến ngày |

**Các loại sự kiện (event_type):**

| Event | Mô tả |
|-------|-------|
| `DATA_RECV` | Nhận dữ liệu cảm biến thành công |
| `DEVICE_REGISTER` | Đăng ký thiết bị mới |
| `DEVICE_BLOCKED` | Thiết bị bị block tự động |
| `DEVICE_STATUS_CHANGE` | Admin/operator đổi trạng thái |
| `DEVICE_DELETE` | Xóa thiết bị |
| `GATEWAY_AUTH_FAIL` | Xác thực Gateway HMAC thất bại |
| `SENSOR_AUTH_FAIL` | Xác thực Sensor HMAC thất bại |
| `REPLAY_ATTACK` | Phát hiện timestamp nằm ngoài cửa sổ ±300s |
| `PRIVILEGE_ESCALATION` | Truy cập trái phép với role không đủ quyền |
| `LOGIN` | Đăng nhập thành công |

---

### Health Check

```http
GET /api/health
```

```json
{ "status": "ok", "message": "Backend running" }
```

---

## Phần 5 — Biến môi trường

### `backend/.env`

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `5000` | Port backend lắng nghe |
| `DB_HOST` | `localhost` | Host MySQL (Docker: `mysql`) |
| `DB_PORT` | `3306` | Port MySQL nội bộ |
| `DB_USER` | `iot_managerIoT` | MySQL username |
| `DB_PASS` | `iot_managerIoTpassword` | MySQL password |
| `DB_NAME` | `iot_managerDeviceIoT` | Tên database |
| `JWT_SECRET` | — | Khóa ký JWT **(bắt buộc >= 32 ký tự)** |
| `MQTT_HOST` | `localhost` | Host **Broker 2** (Docker: `mqtt-broker-2`) |
| `MQTT_PORT` | `1884` | Port Broker 2 (Docker internal: `1883`) |
| `FRONTEND_URL` | `http://localhost` | URL frontend cho CORS |
| `ADMIN_USERNAME` | `admin` | Tên tài khoản admin seed |
| `ADMIN_PASSWORD` | `admin123` | Mật khẩu admin seed |

```bash
cp backend/.env.example backend/.env
```

> File `.env` đã được `.gitignore`. Không bao giờ commit file này.
> Trong production, đổi `JWT_SECRET` thành chuỗi random >= 32 ký tự và đổi mật khẩu admin.

---

## Phần 6 — Cơ sở dữ liệu

### Schema tổng quan

```
users           ← Tài khoản đăng nhập (admin / operator / viewer)
devices         ← Danh sách thiết bị IoT (gateway / sensor)
sensor_data     ← Dữ liệu cảm biến nhận được (JSON payload)
device_tokens   ← Token revocation tracking
audit_log       ← Nhật ký toàn bộ sự kiện bảo mật
```

### Bảng `devices`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INT PK | Auto increment |
| `device_id` | VARCHAR UNIQUE | ID định danh thiết bị |
| `device_name` | VARCHAR | Tên hiển thị |
| `device_type` | ENUM | `gateway` hoặc `sensor` |
| `secret_key` | VARCHAR(64) | Khóa HMAC (hex) |
| `status` | ENUM | `inactive` / `active` / `blocked` |
| `location` | VARCHAR | Vị trí vật lý |
| `fail_count` | INT | Số lần xác thực thất bại liên tiếp |
| `last_seen` | DATETIME | Lần cuối nhận dữ liệu hợp lệ |
| `last_ip` | VARCHAR | IP lần cuối kết nối |
| `created_by` | INT FK | User đăng ký thiết bị |

### Bảng `sensor_data`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INT PK | Auto increment |
| `device_id` | VARCHAR FK | Sensor gửi dữ liệu |
| `gateway_id` | VARCHAR | Gateway đã xác thực và forward |
| `payload` | JSON | `{ "temperature": 28.5, "humidity": 65 }` |
| `received_at` | DATETIME | Thời điểm backend nhận |

> Tự động prune: giữ tối đa **150 bản ghi gần nhất** mỗi thiết bị sau mỗi lần insert.

### Bảng `audit_log`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INT PK | Auto increment |
| `event_type` | VARCHAR | Loại sự kiện bảo mật |
| `device_id` | VARCHAR | Thiết bị liên quan (có thể NULL) |
| `ip_address` | VARCHAR | IP nguồn |
| `user_agent` | TEXT | User-Agent header |
| `details` | JSON | Chi tiết ngữ cảnh sự kiện |
| `created_at` | DATETIME | Thời điểm ghi log |

> Auto-prune: giữ tối đa **150 bản ghi DATA_RECV** mỗi thiết bị.

---

## Phần 7 — Bảo mật

### Xác thực thiết bị — 2 lớp HMAC

```
Công thức: HMAC-SHA256(secret_key, "device_id:unix_timestamp")
```

| Lớp | Thực hiện tại | Xác thực |
|-----|---------------|---------|
| **Lớp 1 — Sensor** | Sensor ký HMAC | Gateway kiểm tra (offline, không cần backend) |
| **Lớp 2 — Gateway** | Gateway ký lại HMAC | Backend kiểm tra độc lập |

**Cơ chế bảo vệ:**
- Timestamp phải trong cửa sổ **±300 giây** — ngăn replay attack
- So sánh bằng `crypto.timingSafeEqual()` — ngăn timing attack
- Sau **5 lần thất bại liên tiếp**: tự động `blocked`, ghi audit log `DEVICE_BLOCKED`
- `fail_count` reset về 0 khi xác thực thành công hoặc admin kích hoạt lại

### Xác thực người dùng

| Cơ chế | Chi tiết |
|--------|---------|
| JWT | HttpOnly cookie, SameSite=Strict, hết hạn 8 giờ |
| Bcrypt | Cost factor 12 |
| Đăng nhập | Rate limit 10 req/15 phút |
| Dữ liệu thiết bị | Rate limit 60 req/phút |
| API chung | Rate limit 100 req/15 phút |

### Phân quyền RBAC

| Role | Dashboard | Devices | Audit Log | Users | Xóa dữ liệu |
|------|:---------:|:-------:|:---------:|:-----:|:-----------:|
| `admin` | Xem | CRUD + block | Xem + xóa | CRUD | Có |
| `operator` | Xem | Tạo + sửa trạng thái | Xem | — | — |
| `viewer` | Xem | Chỉ xem | Chỉ xem | — | — |

### Phân lớp mạng MQTT

| Lớp | Broker | Ai kết nối | Bảo vệ |
|-----|--------|-----------|--------|
| Sensor ↔ Gateway | Broker 1 `:1883` | Sensor + Gateway | Cô lập với backend; Gateway kiểm tra HMAC trước khi forward |
| Gateway → Backend | Broker 2 `:1884` | Gateway + Backend | Chỉ dữ liệu đã qua Gateway xác thực mới vào đây |
