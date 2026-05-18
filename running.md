# Hướng Dẫn Chạy Hệ Thống

Hệ thống gồm 4 thành phần: **MySQL** · **Mosquitto (MQTT)** · **Backend (Node.js)** · **Frontend (Next.js)**

---

## Yêu Cầu Môi Trường

| Công cụ | Version tối thiểu | Kiểm tra |
|---|---|---|
| Docker Desktop | 24.x | `docker --version` |
| Docker Compose | 2.x | `docker compose version` |
| Node.js (nếu chạy local) | 20.x | `node --version` |
| npm | 9.x | `npm --version` |
| PlatformIO CLI (firmware) | 6.x | `pio --version` |

---

## Cách 1 – Chạy Bằng Docker (Khuyến nghị)

### Bước 1 – Clone và chuẩn bị

```bash
git clone <repo-url>
cd managerDeviceIoT
```

### Bước 2 – Tạo file `.env`

```bash
# Windows
copy backend\.env.example backend\.env

# Linux / macOS
cp backend/.env.example backend/.env
```

> Mở `backend/.env` và kiểm tra lại các giá trị nếu cần.

### Bước 3 – Chạy toàn bộ hệ thống

**Windows (dùng script có sẵn):**

```bat
scripts\setup.bat
```

**Hoặc chạy thủ công:**

```bash
docker compose up --build -d
```

### Bước 4 – Kiểm tra trạng thái

```bash
docker compose ps
```

Kết quả mong đợi – tất cả `STATUS` phải là `running`:

```
NAME              STATUS
iot-mysql         running (healthy)
iot-mosquitto     running
iot-backend       running
iot-frontend      running
```

### Bước 5 – Truy cập

| Dịch vụ | URL |
|---|---|
| **Dashboard (Frontend)** | http://localhost:3000 |
| **Backend API** | http://localhost:5000/api/health |
| **MySQL** | localhost:3306 |
| **MQTT Broker** | localhost:1883 |

**Tài khoản đăng nhập mặc định:**

```
Username: admin
Password: admin123
```

---

## Cách 2 – Chạy Từng Service Riêng (Local Dev)

Dùng khi cần debug từng thành phần mà không muốn dùng Docker.

### 2.1 – Khởi động MySQL và Mosquitto qua Docker

```bash
docker compose up mysql mosquitto -d
```

### 2.2 – Chạy Backend

```bash
cd backend
npm install
npm run dev
```

Backend khởi động tại `http://localhost:5000`

> Log thành công: `Server running on port 5000` + `MySQL connected` + `MQTT connected`

### 2.3 – Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend khởi động tại `http://localhost:3000`

---

## Cách 3 – Nạp Firmware ESP32 (PlatformIO)

### Sensor Node

```bash
cd firmware/sensor-node
```

**Bước 1 – Tạo file config** (chỉ làm 1 lần):

```bash
# Tạo file firmware/sensor-node/include/config.h
# Điền Device ID và Secret Key lấy từ Dashboard
```

Nội dung mẫu `config.h`:

```cpp
#define DEVICE_ID     "ESP32-SN-XXXXXXXX"
#define SECRET_KEY    "64_ky_tu_hex_lay_tu_dashboard"
#define WIFI_SSID     "ten_wifi"
#define WIFI_PASS     "mat_khau_wifi"
#define MQTT_HOST     "192.168.x.x"   // IP máy chạy server
#define MQTT_PORT     1883
#define SEND_INTERVAL 5000
```

**Bước 2 – Build và upload:**

```bash
# Build kiểm tra
pio run

# Upload lên ESP32 (kết nối USB trước)
pio run --target upload

# Xem Serial Monitor
pio device monitor --baud 115200
```

### Gateway Node

```bash
cd firmware/gateway-node
```

Tương tự, tạo `config_gw.h` rồi:

```bash
pio run --target upload
pio device monitor --baud 115200
```

---

## Lệnh Quản Lý Docker Thường Dùng

```bash
# Xem log tất cả services (theo dõi real-time)
docker compose logs -f

# Xem log 1 service cụ thể
docker compose logs -f backend
docker compose logs -f mysql

# Dừng toàn bộ (giữ data)
docker compose down

# Dừng và xoá toàn bộ data (reset sạch)
docker compose down -v

# Restart 1 service
docker compose restart backend

# Vào shell MySQL
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

---

## Thứ Tự Khởi Động (Tự Động Khi Dùng Docker)

```
MySQL (healthy) ──► Backend ──► Frontend
Mosquitto ────────► Backend
```

Backend sẽ chờ MySQL healthy trước khi start (healthcheck 10s interval, 5 retries).

---

## Xử Lý Lỗi Thường Gặp

**Lỗi: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`**

Docker Desktop chưa được khởi động.

```bash
# 1. Mở Docker Desktop từ Start Menu hoặc taskbar
# 2. Chờ icon Docker ở system tray chuyển sang màu trắng (không còn loading)
# 3. Kiểm tra Docker đã sẵn sàng
docker info

# 4. Chạy lại lệnh
docker compose up --build -d
```

---

**Lỗi: `Ports are not available: exposing port TCP 0.0.0.0:3306`**

Port 3306 đang bị chiếm bởi MySQL đang chạy sẵn trên máy.

**Cách 1 – Đổi port mapping (không cần tắt MySQL local):**

Sửa `docker-compose.yml`, đổi port MySQL từ `3306:3306` thành `3307:3306`:

```yaml
ports:
  - "3308:3306"
```

Sau đó chạy lại `docker compose up -d`.
Backend vẫn kết nối qua `mysql:3306` (internal Docker network), không bị ảnh hưởng.
Kết nối từ ngoài (DBeaver, TablePlus): dùng port `3307`.

**Cách 2 – Tắt MySQL local:**

```bash
# Windows (PowerShell as Admin)
net stop MySQL

# Linux
sudo systemctl stop mysql
```

**Lỗi: `backend` exit ngay sau khi start**

```bash
# Kiểm tra log lỗi
docker compose logs backend

# Thường do .env chưa có đủ biến – kiểm tra lại
cat backend/.env
```

**Lỗi: ESP32 không kết nối được MQTT**

- Đảm bảo `MQTT_HOST` trong `config.h` là IP máy chủ (không phải `localhost`)
- Kiểm tra firewall không chặn port `1883`
- Chạy `docker compose logs mosquitto` để xem broker log

**Lỗi: `Cannot connect to MySQL` trong backend log**

```bash
# Chờ MySQL healthy xong mới check backend
docker compose ps mysql
# STATUS phải là: running (healthy)
```
