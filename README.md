# IoT Device Manager — RBAC

Hệ thống quản lý thiết bị IoT full-stack: dashboard web, REST API, firmware ESP32 và bảo mật RBAC.

## Kiến trúc hệ thống

```
managerDeviceIoT-RBAC/
├── frontend/            Next.js 16 + React 19 + TailwindCSS v4   → :3000
├── backend/             Express 5 + TypeScript + MySQL            → :5000
├── firmware/
│   ├── gateway-node/    ESP32 DOIT V1: xác thực + forward qua 2 MQTT broker
│   ├── sensor-node/     ESP32 DOIT V1: đọc DHT22 + publish MQTT Broker 1
│   └── sensor-node-2/   ESP32 DOIT V1: sensor thứ 2 (cấu hình tương tự)
├── database/
│   └── migrations/      Schema MySQL 8.0
├── mosquitto/
│   ├── broker1/         MQTT Broker 1 (Sensor ↔ Gateway)         → :1883
│   └── broker2/         MQTT Broker 2 (Gateway → Backend)        → :1884
├── nginx/               Reverse Proxy                             → :80
├── docker/              Dockerfile production
├── scripts/             Script setup tự động
│   ├── setup.bat        Windows
│   └── setup.sh         Linux / macOS / WSL
├── docker-compose.yml        Development stack (6 services)
└── docker-compose.prod.yml   Production stack
```

---

## Luồng dữ liệu tổng quan

```
[Sensor Node — ESP32 DOIT V1]
  └─ Đọc DHT22 mỗi 5 giây
  └─ Ký HMAC-SHA256(secret_key, "device_id:timestamp")
  └─ Publish MQTT → Broker 1 :1883, topic: local/sensors/{sensor_id}/data

[MQTT Broker 1 — Mosquitto :1883]  ← Lớp Sensor ↔ Gateway (cô lập)

[Gateway Node — ESP32 DOIT V1]
  └─ Subscribe MQTT Broker 1: local/sensors/+/data
  └─ Xác thực: whitelist + timestamp ±300s + HMAC (cục bộ, không cần Backend)
  └─ Lấy danh sách sensor từ Backend: GET /api/device/sensors (mỗi 5 phút)
  └─ Ký lại Gateway HMAC
  └─ Publish MQTT → Broker 2 :1884, topic: gateway/{gw_id}/data

[MQTT Broker 2 — Mosquitto :1884]  ← Lớp Gateway → Backend (có log_dest topic)

[Backend — Express :5000]
  └─ Subscribe MQTT Broker 2: gateway/+/data
  └─ Xác thực 2 lớp độc lập (Gateway HMAC + Sensor HMAC)
  └─ Lưu vào MySQL → sensor_data
  └─ Cập nhật last_seen, fail_count
  └─ Ghi audit_log

[MySQL 8.0 :3308]

[Frontend — Next.js :3000]
  └─ REST API polling: /api/devices, /api/dashboard/stats
  └─ Hiển thị dashboard, biểu đồ, lịch sử dữ liệu
```

---

## Phần 1 — Chạy hệ thống bằng Docker

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop) >= 24.x (đã cài và đang chạy)
- Cổng `80`, `3000`, `5000`, `1883`, `1884`, `3308` chưa bị chiếm

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
> Backend chỉ kết nối **Broker 2** (lớp Gateway → Backend), không kết nối Broker 1.
> `MQTT_PORT=1883` là cổng **nội bộ** Docker; khi chạy local dev dùng `MQTT_PORT=1884`.

### Bước 1.2 — Build và khởi động

**Cách nhanh (script tự động):**

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

Lần đầu mất 3–5 phút để build image. Các lần sau nhanh hơn (dùng cache).

---

### Bước 1.3 — Kiểm tra trạng thái

```bash
docker compose ps
```

Kết quả mong đợi — tất cả phải `running`:

```
NAME                 STATUS                  PORTS
iot-nginx            running                 0.0.0.0:80->80/tcp
iot-frontend         running                 0.0.0.0:3000->3000/tcp
iot-backend          running (healthy)       0.0.0.0:5000->5000/tcp
iot-mqtt-broker-1    running                 0.0.0.0:1883->1883/tcp
iot-mqtt-broker-2    running                 0.0.0.0:1884->1883/tcp
iot-mysql            running (healthy)       0.0.0.0:3308->3306/tcp
```

Nếu có service bị `Exit`, xem log:

```bash
docker compose logs backend
docker compose logs frontend
docker compose logs mqtt-broker-1
docker compose logs mqtt-broker-2
docker compose logs mysql
```

---

### Bước 1.4 — Truy cập hệ thống

| Dịch vụ | URL |
|---|---|
| **Dashboard (qua Nginx)** | http://localhost |
| **Dashboard (trực tiếp)** | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **Health check** | http://localhost:5000/api/health |
| **MQTT Broker 1** (Sensor ↔ Gateway) | mqtt://localhost:1883 |
| **MQTT Broker 2** (Gateway → Backend) | mqtt://localhost:1884 |

**Tài khoản mặc định:**

| Trường | Giá trị |
|---|---|
| Username | `admin` |
| Password | `admin123` |

---

### Bước 1.5 — Test nhanh

```bash
# Kiểm tra backend
curl http://localhost:5000/api/health
```

Kết quả mong đợi:
```json
{ "status": "ok", "message": "Backend running" }
```

---

### Lệnh Docker hay dùng

```bash
# Xem trạng thái
docker compose ps

# Log realtime tất cả services
docker compose logs -f

# Log từng service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx

# Restart một service
docker compose restart backend

# Dừng (giữ data)
docker compose down

# Dừng và xóa toàn bộ data (reset sạch)
docker compose down -v

# Build lại sau khi sửa code
docker compose up -d --build backend
docker compose up -d --build frontend
```

**Production build:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Phần 2 — Chạy Local (không dùng Docker)

### Yêu cầu

- Node.js >= 20, npm >= 10
- MySQL 8.0 (cài sẵn hoặc dùng Docker chỉ MySQL)
- Mosquitto MQTT Broker (cài sẵn hoặc dùng Docker chỉ Mosquitto)

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

---

## Phần 3 — Cấu hình và Flash Firmware ESP32

> **Thứ tự bắt buộc**: Đăng ký thiết bị trên Web → Flash Sensor → Flash Gateway.
> Gateway cần danh sách `device_id` + `secret_key` của Sensor để xác thực.

### Yêu cầu phần cứng

| Linh kiện | Số lượng |
|---|---|
| ESP32 DevKit V1 (30-pin) | 2 (1 cho Gateway, 1 cho Sensor) |
| Cảm biến DHT22 (AM2302) | 1 |
| Điện trở 10kΩ | 1 |
| Dây jumper | Vài cái |
| Cáp USB Micro-B có data | 2 |

### Sơ đồ kết nối DHT22 → ESP32 Sensor Node

```
ESP32 (DOIT V1)         DHT22 (AM2302)
──────────────────────────────────────────────────
3V3  ────────────────── Pin 1 (VCC)   [trái nhất]
GPIO4 ──┬────────────── Pin 2 (DATA)  [thứ 2]
        │
       10kΩ  (pull-up lên 3V3)
        │
3V3  ──┘
GND  ────────────────── Pin 4 (GND)   [phải nhất]
                        Pin 3: không nối
```

> **Quan trọng**: Điện trở 10kΩ nối từ DATA lên 3V3 là bắt buộc.
> Thiếu điện trở này DHT22 trả về `NaN` liên tục.

---

### Yêu cầu phần mềm — PlatformIO

Firmware dùng **PlatformIO**, không phải Arduino IDE thông thường.

**Cài PlatformIO:**
- **Cách khuyến nghị**: Cài extension **PlatformIO IDE** trong VS Code
- **Hoặc CLI**: `pip install platformio` (cần Python >= 3.8)

Sau khi cài, khởi động lại VS Code. PlatformIO tự nhận `platformio.ini` khi mở thư mục firmware.

---

### Bước 3.1 — Xác định IP máy chủ

ESP32 cần kết nối đến MQTT Broker và Backend. Lấy IP máy tính đang chạy Docker:

**Windows:**
```
Win + R → "cmd" → ipconfig
Tìm dòng "IPv4 Address" của adapter WiFi đang dùng
Ví dụ: 192.168.1.100
```

**Linux / macOS:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1  # Linux
ipconfig getifaddr en0                             # macOS
```

> Máy tính và 2 ESP32 phải kết nối **cùng mạng WiFi**.

---

### Bước 3.2 — Đăng ký thiết bị trên Dashboard

Trước khi flash firmware, cần đăng ký thiết bị trên web để lấy credentials.

1. Truy cập **http://localhost** → đăng nhập (`admin` / `admin123`)
2. Vào **Devices** → click **"Thêm thiết bị"**
3. Đăng ký **Gateway Node**: nhập tên, chọn Type = `gateway` → Lưu → **sao chép ngay** `device_id` và `secret_key`
4. Đăng ký **Sensor Node**: nhập tên, chọn Type = `sensor` → Lưu → **sao chép ngay** `device_id` và `secret_key`

> `secret_key` chỉ hiển thị **một lần duy nhất** khi đăng ký. Sao chép và lưu ngay.

---

### Bước 3.3 — Flash Sensor Node (làm trước)

Mở file cấu hình: `firmware/sensor-node/include/config.h`

```cpp
// === Device credentials (lấy từ Bước 3.2) ===
#define DEVICE_ID   "ESP32-SN-XXXXXXXX"    // device_id đã đăng ký
#define SECRET_KEY  "abcdef1234...."       // secret_key 64 ký tự hex

// === WiFi (chỉ 2.4 GHz) ===
#define WIFI_SSID   "TenMangWifi"
#define WIFI_PASS   "MatKhauWifi"

// === MQTT Broker (IP máy chạy Docker từ Bước 3.1) ===
#define MQTT_HOST   "192.168.1.100"        // IP máy chủ
#define MQTT_PORT   1883

// === Cảm biến DHT22 ===
#define DHT_PIN     4                      // GPIO4 (kết nối DATA)
#define DHT_TYPE    DHT22
#define SEND_INTERVAL  5000               // gửi mỗi 5 giây
```

Flash firmware:
```bash
cd firmware/sensor-node
pio run --target upload
```

Kiểm tra Serial Monitor (115200 baud):
```
[WiFi] Kết nối thành công! IP: 192.168.1.105
[NTP] Đồng bộ thành công
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

// === MQTT Broker 1 (Subscribe: nhận dữ liệu từ Sensor) ===
#define MQTT_BROKER1_HOST  "192.168.1.100"    // IP máy chạy Docker
#define MQTT_BROKER1_PORT  1883

// === MQTT Broker 2 (Publish: gửi dữ liệu lên Backend) ===
#define MQTT_BROKER2_HOST  "192.168.1.100"    // IP máy chạy Docker
#define MQTT_BROKER2_PORT  1884

// === URL lấy danh sách sensor từ Backend (qua Nginx cổng 80) ===
#define BACKEND_SENSORS_URL  "http://192.168.1.100/api/device/sensors"

// === Danh sách sensor được phép (backup nếu backend chưa sẵn sàng) ===
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "secret_key_64_chars_hex" },
    // thêm sensor nếu có nhiều hơn
};
```

> Gateway duy trì **2 kết nối MQTT song song**: subscribe Broker 1 (:1883) để nhận từ Sensor,
> publish Broker 2 (:1884) để chuyển lên Backend.
> Danh sách `KNOWN_SENSORS` là backup khi backend chưa khởi động; tự cập nhật mỗi 5 phút.

Flash firmware:
```bash
cd firmware/gateway-node
pio run --target upload
```

Kiểm tra Serial Monitor (115200 baud):
```
╔══════════════════════════════════╗
║   IoT Gateway Node – Starting    ║
╚══════════════════════════════════╝
[WiFi] Kết nối thành công!
[NTP] Đồng bộ thành công
[MQTT-SUB] Broker 1: 192.168.1.100:1883
[MQTT-SUB] Connecting... OK
[MQTT-SUB] Subscribed to 'local/sensors/+/data'
[MQTT-PUB] Broker 2: 192.168.1.100:1884
[MQTT-PUB] Connecting... OK
[Registry] Đã lấy danh sách sensor từ backend
[MAIN] Ready – listening for sensor data...
```

---

### Bước 3.5 — Kích hoạt thiết bị trên Dashboard

Sau khi firmware đã flash và thiết bị đã kết nối, thiết bị có trạng thái `inactive`.
Cần kích hoạt thủ công:

1. Vào **http://localhost/devices**
2. Tìm Gateway và Sensor vừa đăng ký
3. Click **"Kích hoạt"** (đổi status → `active`) cho từng thiết bị

> Thiết bị ở trạng thái `inactive` hoặc `blocked` sẽ bị backend từ chối dữ liệu.

---

### Bước 3.6 — Xác nhận dữ liệu lên Dashboard

Truy cập **http://localhost** → **Dashboard**.

Khi hệ thống hoạt động:
- Biểu đồ nhiệt độ / độ ẩm cập nhật mỗi 5 giây
- Trạng thái thiết bị hiển thị **online** (last_seen < 60 giây)

---

## Phần 4 — API Documentation

### Authentication

Tất cả API (trừ `/api/health` và `/api/auth/login`) yêu cầu JWT token trong cookie `token`.

---

### GET `/api/health` — Kiểm tra trạng thái

```http
GET http://localhost:5000/api/health
```

Response:
```json
{ "status": "ok", "message": "Backend running" }
```

---

### POST `/api/auth/login` — Đăng nhập

```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "admin123" }
```

Response: Set-Cookie `token` (HttpOnly, JWT 8 giờ)

---

### Devices API

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `POST` | `/api/devices/register` | admin, operator | Đăng ký thiết bị mới |
| `GET` | `/api/devices` | Tất cả (đã đăng nhập) | Danh sách thiết bị |
| `GET` | `/api/devices/:id` | Tất cả | Chi tiết + 10 bản ghi gần nhất |
| `GET` | `/api/devices/:id/data` | Tất cả | Lịch sử dữ liệu (phân trang) |
| `PATCH` | `/api/devices/:id/status` | admin, operator | Đổi trạng thái (active/inactive/blocked) |
| `DELETE` | `/api/devices/:id` | admin | Xóa thiết bị |

**POST `/api/devices/register` — Body:**
```json
{
  "device_name": "Sensor phòng khách",
  "device_type": "sensor",
  "location": "Phòng khách tầng 1"
}
```

Response (201):
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

> `secret_key` chỉ trả về **một lần duy nhất**.

---

### Device Data API (dùng cho Firmware)

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| `POST` | `/api/device/data` | HMAC | Nhận dữ liệu cảm biến (HTTP fallback) |
| `GET` | `/api/device/sensors` | Gateway HMAC | Gateway lấy danh sách sensor đang active |

> Luồng chính hiện tại: Gateway gửi dữ liệu qua **MQTT** (`gateway/{gw_id}/data`), không phải HTTP POST.
> `POST /api/device/data` vẫn hoạt động như fallback hoặc cho mục đích test.

---

### Dashboard API

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/dashboard/stats` | Tất cả | Thống kê: tổng thiết bị, online, data points |

Response:
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

### Users API (Admin only)

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/users` | admin | Danh sách user |
| `POST` | `/api/users` | admin | Tạo user mới |
| `PATCH` | `/api/users/:id/password` | admin | Đặt lại mật khẩu |
| `DELETE` | `/api/users/:id` | admin | Xóa user |

---

### Audit Log API

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/audit-log` | Tất cả (nội dung lọc theo role) | Xem nhật ký bảo mật |
| `DELETE` | `/api/audit-log/data-recv` | admin | Xóa log DATA_RECV |
| `DELETE` | `/api/audit-log/by-type` | admin | Xóa log theo loại event |
| `DELETE` | `/api/audit-log/bulk` | admin | Xóa nhiều log theo ID |

---

## Phần 5 — Biến môi trường

### `backend/.env`

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `5000` | Port backend lắng nghe |
| `DB_HOST` | `localhost` | Host MySQL (Docker: `mysql`) |
| `DB_PORT` | `3306` | Port MySQL |
| `DB_USER` | `iot_managerIoT` | MySQL username |
| `DB_PASS` | `iot_managerIoTpassword` | MySQL password |
| `DB_NAME` | `iot_managerDeviceIoT` | Tên database |
| `JWT_SECRET` | — | Khóa ký JWT (tối thiểu 32 ký tự) |
| `MQTT_HOST` | `localhost` | Host MQTT **Broker 2** (Docker: `mqtt-broker-2`) |
| `MQTT_PORT` | `1884` | Port MQTT Broker 2 (Docker internal: `1883`) |
| `FRONTEND_URL` | `http://localhost` | URL frontend (dùng cho CORS) |
| `ADMIN_USERNAME` | `admin` | Username tài khoản admin mặc định |
| `ADMIN_PASSWORD` | `admin123` | Password tài khoản admin mặc định |

Tạo từ file mẫu:
```bash
cp backend/.env.example backend/.env
```

> File `.env` đã được `.gitignore` — không bao giờ commit file này lên git.
> Trong production, thay `JWT_SECRET` bằng chuỗi ngẫu nhiên >= 32 ký tự.

---

## Phần 6 — Bảo mật

### Xác thực thiết bị (2 lớp HMAC)

```
HMAC-SHA256(secret_key, "device_id:unix_timestamp")
```

- **Lớp 1 — Sensor**: Sensor ký HMAC bằng `SECRET_KEY` riêng
- **Lớp 2 — Gateway**: Gateway xác thực HMAC của Sensor, rồi ký lại bằng `GW_SECRET_KEY`
- Backend xác thực cả hai HMAC trước khi lưu dữ liệu
- Timestamp phải trong cửa sổ ±300 giây (chống replay attack)
- Sau 5 lần xác thực thất bại: thiết bị tự động bị `blocked`

### Xác thực người dùng

- JWT với thời hạn 8 giờ, lưu trong HttpOnly cookie
- Mật khẩu băm bằng bcrypt (cost factor 12)
- Rate limiting: login 10 req/15 phút, device data 60 req/phút

### Phân quyền RBAC

| Role | Quyền |
|------|-------|
| `admin` | Toàn quyền (CRUD users, devices, audit log) |
| `operator` | Đăng ký và quản lý thiết bị, xem audit log |
| `viewer` | Chỉ xem (dashboard, devices, dữ liệu) |
