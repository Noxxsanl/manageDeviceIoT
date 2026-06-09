# Hướng Dẫn Chạy & Vận Hành Hệ Thống IoT Device Manager

## Mục lục
1. [Yêu cầu phần mềm](#1-yêu-cầu-phần-mềm)
2. [Chạy toàn bộ hệ thống (Docker - Khuyên dùng)](#2-chạy-toàn-bộ-hệ-thống-docker---khuyên-dùng)
3. [Chạy từng phần (Local - Không dùng Docker)](#3-chạy-từng-phần-local---không-dùng-docker)
4. [Các thao tác trên Frontend](#4-các-thao-tác-trên-frontend)
5. [Cấu hình và nạp Firmware ESP32](#5-cấu-hình-và-nạp-firmware-esp32)
6. [Luồng dữ liệu & kiểm tra hệ thống](#6-luồng-dữ-liệu--kiểm-tra-hệ-thống)
7. [Xử lý sự cố thường gặp](#7-xử-lý-sự-cố-thường-gặp)

---

## 1. Yêu cầu phần mềm

### Bắt buộc
| Phần mềm | Phiên bản | Dùng cho |
|---|---|---|
| **Docker Desktop** | >= 24.x | Chạy toàn bộ stack (MySQL, MQTT, Backend, Frontend) |
| **Node.js** | >= 20.x | Chạy local (không dùng Docker) |
| **Python** | >= 3.8 | PlatformIO CLI |
| **PlatformIO CLI** hoặc **VS Code Extension** | Latest | Build & Flash firmware ESP32 |
| **Git** | >= 2.x | Clone repo |

### Cài PlatformIO CLI (nếu chưa có)
```bash
# Cài qua pip
pip install platformio

# Hoặc cài VS Code Extension: "PlatformIO IDE"
```

### Kiểm tra Docker đang chạy
```powershell
docker --version
docker compose version
```

---

## 2. Chạy toàn bộ hệ thống (Docker - Khuyên dùng)

### Bước 1 — Clone và mở dự án
```powershell
cd e:\WorkSpace\managerDeviceIoT
```

### Bước 2 — Tạo file môi trường Backend

Tạo file `backend/.env` (nếu chưa có) từ template:
```powershell
Copy-Item backend\.env.example backend\.env
```

Nội dung file `backend/.env`:
```env
PORT=5000
DB_HOST=mysql
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT
JWT_SECRET=dev_secret_please_change_in_production_min32chars
MQTT_HOST=mosquitto
MQTT_PORT=1883
FRONTEND_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> **Lưu ý:** Khi chạy Docker, `DB_HOST=mysql` và `MQTT_HOST=mosquitto` là tên service trong Docker network, **không phải** `localhost`.

### Bước 3 — Tạo file môi trường Frontend

Tạo file `frontend/.env.local` (nếu chưa có):
```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=IoT Device Manager
```

### Bước 4 — Build và khởi động toàn bộ dịch vụ
```powershell
docker compose up -d --build
```

Lần đầu sẽ mất 3–5 phút để build image. Sau đó Docker sẽ tự động:
- Khởi động **MySQL 8.0** (port `3308` bên ngoài → `3306` bên trong)
- Khởi động **Mosquitto MQTT Broker** (port `1883`)
- Khởi động **Backend Express** (port `5000`)
- Khởi động **Frontend Next.js** (port `3000`)
- Tự động import schema SQL từ `database/migrations/001_schema.sql`

### Bước 5 — Kiểm tra trạng thái
```powershell
docker compose ps
```

Kết quả mong đợi — tất cả phải `healthy` hoặc `running`:
```
NAME          STATUS          PORTS
mysql         running (healthy)  0.0.0.0:3308->3306/tcp
mosquitto     running         0.0.0.0:1883->1883/tcp
backend       running (healthy)  0.0.0.0:5000->5000/tcp
frontend      running         0.0.0.0:3000->3000/tcp
```

### Bước 6 — Truy cập ứng dụng

| Dịch vụ | URL |
|---|---|
| **Frontend (Web App)** | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **API Health Check** | http://localhost:5000/api/health |
| **MySQL** (dùng MySQL Workbench) | `localhost:3308` |

**Tài khoản mặc định:**
- Username: `admin`
- Password: `admin123`

### Dừng toàn bộ hệ thống
```powershell
docker compose down
```

Nếu muốn xóa cả data (reset database):
```powershell
docker compose down -v
```

### Xem log real-time
```powershell
# Tất cả services
docker compose logs -f

# Chỉ backend
docker compose logs -f backend

# Chỉ frontend
docker compose logs -f frontend

# Chỉ MySQL
docker compose logs -f mysql
```

---

## 3. Chạy từng phần (Local - Không dùng Docker)

Cách này dùng khi muốn debug hoặc không có Docker.

### 3.1 — Khởi động Database (MySQL)

Cần cài MySQL 8.0 trên máy. Sau đó tạo database và user:
```sql
CREATE DATABASE iot_managerDeviceIoT CHARACTER SET utf8mb4;
CREATE USER 'iot_managerIoT'@'localhost' IDENTIFIED BY 'iot_managerIoTpassword';
GRANT ALL PRIVILEGES ON iot_managerDeviceIoT.* TO 'iot_managerIoT'@'localhost';
FLUSH PRIVILEGES;
```

Import schema:
```powershell
mysql -u iot_managerIoT -p iot_managerDeviceIoT < database\migrations\001_schema.sql
```

### 3.2 — Khởi động MQTT Broker (Mosquitto)

Cài Mosquitto: https://mosquitto.org/download/

```powershell
mosquitto -c mosquitto\mosquitto.conf
```

### 3.3 — Khởi động Backend

Sửa `backend/.env` — đổi host về localhost:
```env
DB_HOST=localhost
MQTT_HOST=localhost
```

```powershell
cd backend
npm install
npm run dev
```

Backend chạy tại: http://localhost:5000

Seed dữ liệu mặc định (admin user):
```powershell
npm run seed
```

### 3.4 — Khởi động Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend chạy tại: http://localhost:3000

---

## 4. Các thao tác trên Frontend

### 4.1 — Đăng nhập

Truy cập http://localhost:3000/account/login

| Trường | Giá trị |
|---|---|
| Username | `admin` |
| Password | `admin123` |

### 4.2 — Dashboard

Sau khi đăng nhập, màn hình Dashboard hiển thị:
- Tổng số thiết bị đang hoạt động / không hoạt động / bị khóa
- Biểu đồ dữ liệu sensor theo thời gian thực
- Trạng thái kết nối MQTT

### 4.3 — Quản lý thiết bị (Devices)

Vào menu **Devices** → danh sách toàn bộ thiết bị ESP32 đã đăng ký.

#### Đăng ký thiết bị mới

1. Click **"Thêm thiết bị"** (Add Device)
2. Điền thông tin:
   - **Device ID**: Tên định danh (ví dụ: `ESP32-GW-001`, `ESP32-SN-001`)
   - **Type**: Chọn `gateway` hoặc `sensor`
   - **Description**: Mô tả vị trí đặt thiết bị
3. Click **Lưu** → Hệ thống tự sinh `secret_key` (64 ký tự hex)
4. **SAO CHÉP `device_id` VÀ `secret_key` NGAY** — key này chỉ hiện một lần, dùng để nạp vào firmware

#### Thay đổi IP / URL Backend trong thiết bị

Đây là bước quan trọng khi đổi mạng WiFi hoặc đổi máy chủ. Sau khi lấy IP mới:

1. Vào **Devices** → click vào thiết bị cần cập nhật
2. Ghi lại `device_id` và `secret_key`
3. Mở file firmware tương ứng (xem mục 5) và sửa IP
4. Flash lại firmware

#### Xem dữ liệu sensor

Click vào thiết bị sensor → tab **"Dữ liệu"** → xem lịch sử nhiệt độ, độ ẩm theo thời gian.

#### Khoá / mở khoá thiết bị

- **Khoá**: Thiết bị gửi dữ liệu sẽ bị từ chối (HTTP 403)
- **Mở khoá**: Thiết bị hoạt động bình thường lại

### 4.4 — Quản lý người dùng (Users)

Vào menu **Users** (chỉ admin mới thấy):

- **Admin**: Toàn quyền (xem, sửa, xoá, quản lý user)
- **Operator**: Xem và điều khiển thiết bị
- **Viewer**: Chỉ xem

Tạo user mới → điền username, password, chọn role → Lưu.

### 4.5 — Audit Log

Vào menu **Audit** → xem toàn bộ lịch sử thao tác:
- Ai đăng nhập lúc nào
- Thiết bị nào gửi dữ liệu
- Ai thêm / xoá / sửa thiết bị

### 4.6 — Kiểm tra kết nối WiFi & IP

Để biết IP máy chủ (cần điền vào firmware):

```powershell
# Xem IP của máy trên mạng LAN
ipconfig
# Tìm dòng "IPv4 Address" của adapter WiFi hoặc Ethernet
# Ví dụ: 192.168.1.100
```

Điền IP này vào `MQTT_HOST` và `BACKEND_URL` trong file config firmware.

---

## 5. Cấu hình và nạp Firmware ESP32

### 5.1 — Cài đặt môi trường

#### Cài PlatformIO

```bash
# Qua pip
pip install platformio

# Hoặc cài extension VS Code: "PlatformIO IDE" (nhấn Ctrl+P → ext install platformio.platformio-ide)
```

Kiểm tra:
```powershell
pio --version
```

### 5.2 — Cấu hình Sensor Node (ESP32 DevKit V1)

**File cần sửa:** `firmware/sensor-node/include/config.h`

```cpp
// --- Device Identity (lấy từ bước đăng ký trên Frontend) ---
#define DEVICE_ID   "ESP32-SN-001"                        // <-- Thay bằng device_id thực tế
#define SECRET_KEY  "abcdef1234...64kytu"                  // <-- Thay bằng secret_key thực tế

// --- WiFi ---
#define WIFI_SSID   "TenMangWifi"                          // <-- Tên WiFi nhà/văn phòng
#define WIFI_PASS   "MatKhauWifi"                          // <-- Mật khẩu WiFi

// --- MQTT Broker ---
#define MQTT_HOST   "192.168.1.100"                        // <-- IP máy chủ chạy Docker
#define MQTT_PORT   1883

// --- DHT22 Sensor ---
#define DHT_PIN     4                                       // GPIO4 (mặc định)
#define DHT_TYPE    DHT22

// --- Timing ---
#define SEND_INTERVAL  5000                                 // Gửi dữ liệu mỗi 5 giây
```

**Sơ đồ đấu dây DHT22:**
```
DHT22 Pin 1 (VCC)  → ESP32 3V3
DHT22 Pin 2 (DATA) → ESP32 GPIO4  + điện trở 10kΩ kéo lên 3V3
DHT22 Pin 4 (GND)  → ESP32 GND
```

### 5.3 — Cấu hình Gateway Node (ESP32-S3 N16R8)

**File cần sửa:** `firmware/gateway-node/include/config_gw.h`

```cpp
// --- Gateway Identity (lấy từ bước đăng ký trên Frontend) ---
#define GW_DEVICE_ID   "ESP32-GW-001"                      // <-- Thay bằng device_id thực tế
#define GW_SECRET_KEY  "abcdef1234...64kytu"                // <-- Thay bằng secret_key thực tế

// --- WiFi ---
#define WIFI_SSID      "TenMangWifi"                        // <-- Tên WiFi
#define WIFI_PASS      "MatKhauWifi"                        // <-- Mật khẩu WiFi

// --- MQTT Broker ---
#define MQTT_HOST      "192.168.1.100"                      // <-- IP máy chủ Docker
#define MQTT_PORT      1883

// --- Backend API ---
#define BACKEND_URL    "http://192.168.1.100:5000/api/iot/data"  // <-- URL Backend
#define HTTP_TIMEOUT   10000

// --- Danh sách Sensor được phép gửi qua Gateway này ---
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-001", "secret_key_cua_sensor_001" },        // <-- Thêm từng sensor
    { "ESP32-SN-002", "secret_key_cua_sensor_002" },
};
```

> **Quan trọng:** `BACKEND_URL` phải trỏ đúng port `5000` và endpoint `/api/iot/data`, không phải port `3000` (Frontend).

### 5.4 — Build Firmware

#### Sensor Node
```powershell
cd firmware\sensor-node

# Build
pio run

# Build chỉ định environment
pio run -e esp32doit-devkit-v1
```

#### Gateway Node
```powershell
cd firmware\gateway-node

# Build
pio run

# Build chỉ định environment
pio run -e esp32s3-n16r8
```

### 5.5 — Nạp Firmware (Flash)

#### Bước 1 — Kết nối ESP32 vào máy tính

- Dùng cáp USB (chú ý phải là cáp **data**, không phải cáp sạc thường)
- ESP32-S3 N16R8: Cắm vào cổng **USB-C** (USB CDC, không cần driver thêm)
- ESP32 DevKit V1: Cắm vào cổng **Micro-USB**

#### Bước 2 — Kiểm tra cổng COM

```powershell
# Windows: Xem trong Device Manager hoặc
[System.IO.Ports.SerialPort]::GetPortNames()
# Kết quả ví dụ: COM3, COM4, COM6
```

#### Bước 3 — Flash firmware

```powershell
# Sensor Node
cd firmware\sensor-node
pio run --target upload

# Gateway Node
cd firmware\gateway-node
pio run --target upload
```

PlatformIO tự phát hiện cổng COM. Nếu có nhiều cổng, chỉ định thủ công:
```powershell
pio run --target upload --upload-port COM6
```

#### Bước 4 — Chế độ BOOT (nếu flash thất bại)

Nếu ESP32 không tự vào chế độ flash:

**ESP32 DevKit V1:**
1. Giữ nút **BOOT** (hoặc IO0)
2. Bấm nút **EN** (Reset) rồi thả ra
3. Thả nút **BOOT**
4. Chạy lại lệnh upload

**ESP32-S3 N16R8:**
1. Giữ nút **BOOT**
2. Cắm lại cáp USB
3. Thả nút **BOOT**
4. Chạy lại lệnh upload

#### Bước 5 — Xem Serial Monitor (kiểm tra hoạt động)

```powershell
# Sensor Node
cd firmware\sensor-node
pio device monitor --baud 115200

# Gateway Node
cd firmware\gateway-node
pio device monitor --baud 115200
```

Output mong đợi khi khởi động thành công:
```
[WiFi] Đang kết nối tới TenMangWifi...
[WiFi] Kết nối thành công! IP: 192.168.1.105
[NTP] Đồng bộ thời gian thành công
[MQTT] Kết nối tới broker 192.168.1.100:1883...
[MQTT] Đã kết nối!
[Sensor] DHT22 sẵn sàng. Gửi dữ liệu mỗi 5000ms
[Send] Gửi: {"device_id":"ESP32-SN-001","temperature":27.5,"humidity":65.3,...}
[Send] HTTP 200 OK
```

### 5.6 — Quy trình khi đổi mạng WiFi hoặc đổi IP máy chủ

1. Xác định IP mới của máy chủ: `ipconfig` → ghi lại IPv4
2. Mở file config:
   - Sensor: `firmware/sensor-node/include/config.h`
   - Gateway: `firmware/gateway-node/include/config_gw.h`
3. Sửa `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`, `BACKEND_URL`
4. Build và flash lại theo bước 5.4 và 5.5
5. Mở Serial Monitor kiểm tra kết nối

### 5.7 — Thêm Sensor mới vào Gateway

Khi thêm một sensor node mới, cần cập nhật whitelist trong Gateway:

1. Đăng ký sensor mới trên Frontend → lấy `device_id` và `secret_key`
2. Mở `firmware/gateway-node/include/config_gw.h`
3. Thêm entry vào `KNOWN_SENSORS`:
   ```cpp
   static const SensorCredential KNOWN_SENSORS[] = {
       { "ESP32-SN-001", "secret_key_sensor_001" },
       { "ESP32-SN-002", "secret_key_sensor_002" },  // <-- Thêm dòng này
   };
   ```
4. Build và flash lại Gateway node

---

## 6. Luồng dữ liệu & kiểm tra hệ thống

### Luồng dữ liệu

```
DHT22 Sensor
    ↓ (đọc nhiệt độ/độ ẩm mỗi 5 giây)
ESP32 Sensor Node
    ↓ (MQTT publish: topic "sensor/{device_id}/data" + HMAC-SHA256)
Mosquitto MQTT Broker (port 1883)
    ↓ (subscribe topic)
ESP32 Gateway Node
    ↓ (validate HMAC + forward qua HTTP POST)
Backend Express API (port 5000, endpoint /api/iot/data)
    ↓ (lưu vào DB)
MySQL Database
    ↑
Frontend Next.js (port 3000) ← người dùng xem dashboard
```

### Kiểm tra từng bước

#### Kiểm tra Backend API
```powershell
# Health check
Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get

# Kết quả mong đợi:
# { "status": "ok", "db": "connected", "mqtt": "connected" }
```

#### Kiểm tra MQTT Broker
```powershell
# Subscribe test (cần cài mosquitto-clients)
mosquitto_sub -h localhost -p 1883 -t "#" -v
```

#### Kiểm tra Database
```powershell
# Kết nối qua Docker
docker exec -it managerdeviceiot-mysql-1 mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT

# Xem dữ liệu sensor
SELECT * FROM sensor_data ORDER BY created_at DESC LIMIT 10;

# Xem danh sách thiết bị
SELECT * FROM devices;
```

---

## 7. Xử lý sự cố thường gặp

### Backend không kết nối được Database
```powershell
# Kiểm tra MySQL có chạy không
docker compose ps mysql

# Xem log MySQL
docker compose logs mysql

# Thử kết nối thủ công
docker exec -it managerdeviceiot-mysql-1 mysql -u root -p
```

Nguyên nhân thường gặp:
- `DB_HOST` đang là `localhost` thay vì `mysql` (khi dùng Docker)
- MySQL chưa khởi động xong (đợi thêm 30 giây rồi thử lại)

### Frontend không load được dữ liệu
- Kiểm tra `BACKEND_URL` trong `frontend/.env.local` trỏ đúng `http://localhost:5000`
- Kiểm tra Backend đang chạy: http://localhost:5000/api/health

### ESP32 không kết nối WiFi
- Kiểm tra `WIFI_SSID` và `WIFI_PASS` trong file config (phân biệt hoa thường)
- ESP32 chỉ kết nối WiFi 2.4 GHz (không hỗ trợ 5 GHz)
- Xem Serial Monitor để đọc thông báo lỗi chi tiết

### ESP32 kết nối WiFi nhưng không gửi được dữ liệu
- Kiểm tra `MQTT_HOST` có đúng IP máy chủ không (`ipconfig` để kiểm tra lại)
- Đảm bảo ESP32 và máy chủ **cùng mạng LAN**
- Kiểm tra Mosquitto đang chạy: `docker compose ps mosquitto`
- Tắt Windows Firewall tạm thời để test

### Flash firmware thất bại ("No serial ports found")
- Kiểm tra cáp USB (phải là cáp có data, không phải cáp sạc)
- Cài driver CP210x hoặc CH340 (tuỳ board)
- Thử chế độ BOOT thủ công (xem mục 5.5 - Bước 4)
- Đổi cáp USB khác, đổi cổng USB khác

### ESP32-S3 không nhận diện trên Windows
- Cài driver: tải từ https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- Hoặc thử cắm vào cổng USB khác (ưu tiên dùng cổng USB-A gốc của máy)

### Dữ liệu không hiển thị trên Dashboard dù Serial Monitor báo thành công
- Kiểm tra `BACKEND_URL` trong `config_gw.h` — đúng IP và port `5000`
- Kiểm tra `device_id` và `secret_key` trong firmware khớp với thiết bị đã đăng ký trên Frontend
- Xem log backend: `docker compose logs -f backend`
- Thiết bị có thể đang ở trạng thái **"blocked"** trên Frontend → vào Devices → mở khoá

---

## Tóm tắt nhanh

```
# 1. Khởi động toàn bộ hệ thống
docker compose up -d --build

# 2. Truy cập web
http://localhost:3000  (admin / admin123)

# 3. Đăng ký thiết bị → lấy device_id + secret_key

# 4. Sửa config firmware
firmware\sensor-node\include\config.h   (Sensor Node)
firmware\gateway-node\include\config_gw.h  (Gateway Node)

# 5. Flash firmware
cd firmware\sensor-node && pio run --target upload
cd firmware\gateway-node && pio run --target upload

# 6. Monitor serial
pio device monitor --baud 115200

# 7. Dừng hệ thống
docker compose down
```
