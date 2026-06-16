# Hướng Dẫn Chạy Hệ Thống IoT Device Manager — Từ Đầu Đến Cuối

## Kiến trúc hệ thống

```
                        ┌─────────────────────────────────────────┐
                        │              Docker Network              │
Browser / ESP32         │                                          │
      │                 │   ┌──────────┐    /api/*  ┌──────────┐  │
      │  port 80 ───────┼──►│  Nginx   │──────────►│ Backend  │  │
      │                 │   │ (proxy)  │           │ :5000    │  │
      │                 │   │          │    /*     │          │  │
      │                 │   │          │──────────►│ Frontend │  │
      │                 │   └──────────┘           │ :3000    │  │
      │                 │                          └──────────┘  │
      │  MQTT :1883 ────┼──────────────────────────► Mosquitto   │
      │                 │                                         │
      │                 │                          MySQL :3306    │
      └─────────────────┴─────────────────────────────────────────┘
```

**Nginx là điểm vào duy nhất tại cổng 80.**
- `http://localhost/` → Frontend (Next.js)
- `http://localhost/api/...` → Backend API (Express)
- MQTT vẫn dùng cổng `1883` trực tiếp (không qua Nginx)

## Tổng quan luồng thao tác

```
[GIAI ĐOẠN 1] Cài phần mềm cần thiết
        ↓
[GIAI ĐOẠN 2] Khởi động Server (Docker)
        ↓
[GIAI ĐOẠN 3] Đăng ký thiết bị trên Web → lấy credentials
        ↓
[GIAI ĐOẠN 4] Nạp firmware SENSOR NODE ← PHẢI LÀM TRƯỚC
        ↓
[GIAI ĐOẠN 5] Nạp firmware GATEWAY NODE ← LÀM SAU
        ↓
[GIAI ĐOẠN 6] Kiểm tra dữ liệu trên Dashboard
```

> **Tại sao Sensor trước, Gateway sau?**
> Gateway cần biết danh sách `device_id` + `secret_key` của từng Sensor để xác thực.
> Đăng ký Sensor trên Frontend trước → lấy credentials → điền vào config Gateway → flash Gateway.
> Làm ngược lại, Gateway sẽ từ chối dữ liệu vì Sensor không có trong whitelist.

---

## Mục lục
1. [Giai đoạn 1 — Cài phần mềm](#giai-đoạn-1--cài-phần-mềm)
2. [Giai đoạn 2 — Khởi động Server](#giai-đoạn-2--khởi-động-server)
3. [Giai đoạn 3 — Đăng ký thiết bị trên Web](#giai-đoạn-3--đăng-ký-thiết-bị-trên-web)
4. [Giai đoạn 4 — Nạp firmware Sensor Node](#giai-đoạn-4--nạp-firmware-sensor-node)
5. [Giai đoạn 5 — Nạp firmware Gateway Node](#giai-đoạn-5--nạp-firmware-gateway-node)
6. [Giai đoạn 6 — Kiểm tra hệ thống](#giai-đoạn-6--kiểm-tra-hệ-thống)
7. [Quản lý hệ thống](#quản-lý-hệ-thống)
8. [Xử lý sự cố](#xử-lý-sự-cố)

---

## Giai đoạn 1 — Cài phần mềm

### Phần mềm bắt buộc

| Phần mềm | Phiên bản | Link |
|---|---|---|
| **Docker Desktop** | >= 24.x | https://www.docker.com/products/docker-desktop |
| **Python** | >= 3.8 | https://www.python.org/downloads |
| **PlatformIO CLI** | Latest | cài qua pip bên dưới |

### Cài PlatformIO

```powershell
pip install platformio

# Kiểm tra cài thành công
pio --version
```

Hoặc cài extension trong VS Code: tìm **"PlatformIO IDE"** trong Extensions (`Ctrl+P` → `ext install platformio.platformio-ide`).

### Kiểm tra Docker

```powershell
docker --version
docker compose version
```

Nếu lệnh không nhận ra, mở Docker Desktop và đợi khởi động xong.

---

## Giai đoạn 2 — Khởi động Server

### Bước 2.1 — Tạo file cấu hình Backend

Tạo file `backend/.env` (nếu chưa có):

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
FRONTEND_URL=http://localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> Khi chạy qua Docker:
> - `DB_HOST=mysql` và `MQTT_HOST=mosquitto` là tên service nội bộ, **không dùng `localhost`**
> - `FRONTEND_URL=http://localhost` trỏ về Nginx (cổng 80), không phải cổng 3000

### Bước 2.2 — Khởi động toàn bộ hệ thống

```powershell
docker compose up -d --build
```

Lần đầu mất 3–5 phút để build image. Docker sẽ khởi động 5 service:

| Service | Vai trò | Cổng bên ngoài |
|---|---|---|
| **iot-nginx** | Reverse proxy — điểm vào chính | `80` |
| **iot-frontend** | Next.js Web App | `3000` (trực tiếp) |
| **iot-backend** | Express API | `5000` (trực tiếp) |
| **iot-mosquitto** | MQTT Broker | `1883` |
| **iot-mysql** | Database MySQL 8.0 | `3308` |

### Bước 2.3 — Kiểm tra trạng thái

```powershell
docker compose ps
```

Kết quả mong đợi — tất cả phải `running`:

```
NAME            STATUS               PORTS
iot-nginx       running              0.0.0.0:80->80/tcp
iot-frontend    running              0.0.0.0:3000->3000/tcp
iot-backend     running (healthy)    0.0.0.0:5000->5000/tcp
iot-mosquitto   running              0.0.0.0:1883->1883/tcp
iot-mysql       running (healthy)    0.0.0.0:3308->3306/tcp
```

Nếu có service nào chưa `running`, đợi thêm 30 giây rồi kiểm tra lại.

### Bước 2.4 — Xác định IP máy chủ (cần cho firmware)

```powershell
ipconfig
```

Tìm dòng **IPv4 Address** của adapter WiFi hoặc Ethernet đang dùng. Ví dụ: `192.168.1.100`.

**Ghi lại IP này** — sẽ điền vào firmware ở các bước sau.

### Bước 2.5 — Kiểm tra Nginx hoạt động

```powershell
# Truy cập qua Nginx (cổng 80)
Invoke-RestMethod -Uri "http://localhost/api/health"
# Kết quả mong đợi: { "status": "ok", "db": "connected", "mqtt": "connected" }
```

---

## Giai đoạn 3 — Đăng ký thiết bị trên Web

### Bước 3.1 — Đăng nhập

Truy cập: **http://localhost** (cổng 80, qua Nginx)

| Trường | Giá trị mặc định |
|---|---|
| Username | `admin` |
| Password | `admin123` |

### Bước 3.2 — Đăng ký Gateway Node

1. Vào menu **Devices** → click **"Thêm thiết bị"**
2. Điền:
   - **Device ID**: `ESP32-GW-001` (hoặc tên tùy chọn)
   - **Type**: `gateway`
3. Click **Lưu**
4. **SAO CHÉP NGAY** `device_id` và `secret_key` — key chỉ hiện một lần

```
Ví dụ:
  device_id  = ESP32-GW-001
  secret_key = a1b2c3d4e5f6....(64 ký tự hex)
```

### Bước 3.3 — Đăng ký Sensor Node(s)

Lặp lại cho mỗi sensor:

1. Click **"Thêm thiết bị"**
2. Điền:
   - **Device ID**: `ESP32-SN-001`, `ESP32-SN-002`, ...
   - **Type**: `sensor`
3. Click **Lưu**
4. **SAO CHÉP NGAY** `device_id` và `secret_key`

> Nếu có nhiều sensor, đăng ký tất cả và ghi lại đủ credentials trước khi sang bước tiếp.

---

## Giai đoạn 4 — Nạp firmware Sensor Node

> **Làm bước này trước Gateway.**

### Bước 4.1 — Sửa file cấu hình Sensor

Mở file: `firmware/sensor-node/include/config.h`

```cpp
// === Credentials lấy từ Bước 3.3 ===
#define DEVICE_ID   "ESP32-SN-001"           // device_id đã đăng ký trên web
#define SECRET_KEY  "f6e5d4c3b2a1...."       // secret_key 64 ký tự

// === Thông tin WiFi ===
#define WIFI_SSID   "TenMangWifi"            // tên WiFi (chỉ 2.4 GHz)
#define WIFI_PASS   "MatKhauWifi"            // mật khẩu WiFi

// === IP máy chủ (lấy từ Bước 2.4) ===
#define MQTT_HOST   "192.168.1.100"          // IP máy chạy Docker
#define MQTT_PORT   1883

// === Cảm biến DHT22 ===
#define DHT_PIN     4                        // GPIO4
#define DHT_TYPE    DHT22
#define SEND_INTERVAL  5000                  // gửi dữ liệu mỗi 5 giây
```

**Sơ đồ đấu dây DHT22:**

```
DHT22 Pin 1 (VCC)  → ESP32 3V3
DHT22 Pin 2 (DATA) → ESP32 GPIO4  (+ điện trở 10kΩ kéo lên 3V3)
DHT22 Pin 4 (GND)  → ESP32 GND
```

### Bước 4.2 — Kết nối ESP32 DevKit V1 vào máy tính

- Dùng cáp **Micro-USB** có data (không phải cáp sạc thường)

### Bước 4.3 — Kiểm tra cổng COM

```powershell
[System.IO.Ports.SerialPort]::GetPortNames()
# Kết quả ví dụ: COM3, COM4, COM6
```

### Bước 4.4 — Flash firmware Sensor

```powershell
cd firmware\sensor-node
pio run --target upload
```

Chỉ định cổng COM nếu tự phát hiện sai:

```powershell
pio run --target upload --upload-port COM4
```

**Flash thất bại → vào chế độ BOOT thủ công (ESP32 DevKit V1):**
1. Giữ nút **BOOT** (hoặc IO0)
2. Bấm nút **EN** (Reset) rồi thả ngay
3. Thả nút **BOOT**
4. Chạy lại lệnh upload ngay lập tức

### Bước 4.5 — Kiểm tra Sensor hoạt động

```powershell
cd firmware\sensor-node
pio device monitor --baud 115200
```

Output mong đợi:

```
[WiFi] Kết nối thành công! IP: 192.168.1.105
[MQTT] Đã kết nối tới broker 192.168.1.100:1883
[Sensor] DHT22 sẵn sàng
[Send] {"device_id":"ESP32-SN-001","temperature":27.5,"humidity":65.3,...}
[Send] HTTP 200 OK
```

Khi thấy `HTTP 200 OK` → Sensor hoạt động tốt. Nhấn `Ctrl+C` để thoát.

---

## Giai đoạn 5 — Nạp firmware Gateway Node

> **Làm sau Sensor.** Gateway cần danh sách Sensor trong config trước khi flash.

### Bước 5.1 — Sửa file cấu hình Gateway

Mở file: `firmware/gateway-node/include/config_gw.h`

```cpp
// === Credentials lấy từ Bước 3.2 ===
#define GW_DEVICE_ID   "ESP32-GW-001"
#define GW_SECRET_KEY  "a1b2c3d4e5f6...."

// === Thông tin WiFi ===
#define WIFI_SSID      "TenMangWifi"            // tên WiFi (chỉ 2.4 GHz)
#define WIFI_PASS      "MatKhauWifi"

// === IP máy chủ (lấy từ Bước 2.4) ===
#define MQTT_HOST      "192.168.1.100"
#define MQTT_PORT      1883

// === URL Backend API qua Nginx (cổng 80) ===
#define BACKEND_URL    "http://192.168.1.100/api/iot/data"
#define HTTP_TIMEOUT   10000

// === Danh sách Sensor được phép gửi qua Gateway này ===
// Điền TẤT CẢ sensor đã đăng ký ở Bước 3.3
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-001", "f6e5d4c3b2a1...." },
    // { "ESP32-SN-002", "..." },   // thêm dòng này nếu có sensor 002
};
```

> `BACKEND_URL` trỏ về **cổng 80 qua Nginx** (`http://IP/api/iot/data`).
> Nginx tự chuyển tiếp `/api/*` vào backend nội bộ.
> Không dùng cổng 3000 (Frontend) hay trực tiếp cổng 5000 trong firmware.

### Bước 5.2 — Kết nối ESP32-S3 N16R8 vào máy tính

- Dùng cáp **USB-C** có data
- Cắm vào cổng **USB-C** trên board (USB CDC, không cần driver thêm)

### Bước 5.3 — Kiểm tra cổng COM

```powershell
[System.IO.Ports.SerialPort]::GetPortNames()
```

Nếu không thấy cổng COM mới: tải driver tại https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers

### Bước 5.4 — Flash firmware Gateway

```powershell
cd firmware\gateway-node
pio run --target upload
```

Chỉ định cổng COM nếu cần:

```powershell
pio run --target upload --upload-port COM6
```

**Flash thất bại → vào chế độ BOOT thủ công (ESP32-S3):**
1. Giữ nút **BOOT** trên board
2. Rút và cắm lại cáp USB
3. Thả nút **BOOT**
4. Chạy lại lệnh upload ngay lập tức

### Bước 5.5 — Kiểm tra Gateway hoạt động

```powershell
cd firmware\gateway-node
pio device monitor --baud 115200
```

Output mong đợi:

```
[WiFi] Kết nối thành công! IP: 192.168.1.106
[MQTT] Đã kết nối tới broker 192.168.1.100:1883
[MQTT] Subscribe: sensor/+/data
[GW] Nhận dữ liệu từ ESP32-SN-001
[GW] HMAC hợp lệ, chuyển tiếp lên Backend...
[GW] HTTP 200 OK
```

---

## Giai đoạn 6 — Kiểm tra hệ thống

### Bước 6.1 — Mở Dashboard

Truy cập **http://localhost** → đăng nhập → vào **Dashboard**.

Nếu hệ thống hoạt động đúng:
- Biểu đồ nhiệt độ / độ ẩm cập nhật mỗi 5 giây
- Trạng thái thiết bị: **online**

### Bước 6.2 — Kiểm tra từng lớp

```powershell
# Kiểm tra Nginx + Backend (qua proxy)
Invoke-RestMethod -Uri "http://localhost/api/health"

# Kiểm tra Backend trực tiếp (bỏ qua Nginx)
Invoke-RestMethod -Uri "http://localhost:5000/api/health"

# Kết quả mong đợi cả hai:
# { "status": "ok", "db": "connected", "mqtt": "connected" }
```

### Bước 6.3 — Xem log real-time

```powershell
# Tất cả services
docker compose logs -f

# Chỉ Nginx (kiểm tra request đến từ firmware)
docker compose logs -f nginx

# Chỉ Backend
docker compose logs -f backend
```

### Bước 6.4 — Kiểm tra database (nếu cần)

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT

# Trong MySQL shell:
SELECT * FROM sensor_data ORDER BY created_at DESC LIMIT 10;
SELECT device_id, type, status FROM devices;
```

---

## Quản lý hệ thống

### Các lệnh thường dùng

```powershell
# Khởi động
docker compose up -d

# Khởi động lần đầu hoặc sau khi sửa Dockerfile
docker compose up -d --build

# Dừng
docker compose down

# Xem trạng thái
docker compose ps

# Xem log real-time
docker compose logs -f nginx
docker compose logs -f backend
docker compose logs -f frontend

# Reset toàn bộ (xóa database)
docker compose down -v
docker compose up -d --build
```

### Thêm Sensor mới vào hệ thống

1. Đăng ký trên **http://localhost** → Devices → lấy `device_id` + `secret_key`
2. Flash firmware sensor mới theo Giai đoạn 4
3. Thêm entry vào `KNOWN_SENSORS` trong `firmware/gateway-node/include/config_gw.h`:
   ```cpp
   static const SensorCredential KNOWN_SENSORS[] = {
       { "ESP32-SN-001", "secret_key_001" },
       { "ESP32-SN-002", "secret_key_002" },  // thêm dòng này
   };
   ```
4. Flash lại Gateway theo Giai đoạn 5 — **bắt buộc flash lại** vì whitelist thay đổi

### Đổi mạng WiFi hoặc đổi IP máy chủ

1. Tìm IP mới: `ipconfig` → ghi lại IPv4
2. Sửa cả hai file config firmware:
   - `firmware/sensor-node/include/config.h` — sửa `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`
   - `firmware/gateway-node/include/config_gw.h` — sửa `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`, `BACKEND_URL`
3. Flash lại cả Sensor và Gateway

---

## Xử lý sự cố

### Nginx báo 502 Bad Gateway

Nginx đã chạy nhưng backend hoặc frontend chưa sẵn sàng.

```powershell
# Kiểm tra backend và frontend có running không
docker compose ps

# Xem log lỗi
docker compose logs backend
docker compose logs frontend
```

Nguyên nhân thường gặp: MySQL chưa `healthy` nên backend chưa start được. Đợi 30 giây rồi thử lại.

### Nginx báo 404 cho route Frontend

Next.js chưa build xong. Đợi thêm rồi refresh, hoặc xem log:

```powershell
docker compose logs -f frontend
```

### Docker không khởi động được

```powershell
# Xem log tổng
docker compose logs

# Khởi động lại service cụ thể
docker compose restart backend
docker compose restart nginx
```

Nguyên nhân thường gặp:
- `DB_HOST` đang là `localhost` thay vì `mysql` trong `backend/.env`
- Port 80 bị chiếm bởi ứng dụng khác (IIS, XAMPP, Skype...) — kiểm tra và tắt trước khi chạy Docker

### Flash firmware thất bại

| Triệu chứng | Cách xử lý |
|---|---|
| `No serial ports found` | Kiểm tra cáp (phải có data), thử cổng USB khác |
| `Connection refused` | Vào chế độ BOOT thủ công (xem Bước 4.4 hoặc 5.4) |
| ESP32-S3 không nhận diện | Cài driver CP210x hoặc CH340 |
| Cổng COM xuất hiện rồi biến mất | Đổi cáp USB khác |

### ESP32 không kết nối WiFi

- Kiểm tra `WIFI_SSID` và `WIFI_PASS` (phân biệt hoa thường)
- ESP32 **chỉ hỗ trợ WiFi 2.4 GHz**, không kết nối được mạng 5 GHz
- ESP32 và máy chủ phải cùng một mạng LAN

### Dữ liệu không hiển thị trên Dashboard

Kiểm tra theo thứ tự:

1. Serial Monitor Sensor báo `HTTP 200 OK` chưa?
2. Serial Monitor Gateway báo `HTTP 200 OK` chưa?
3. `MQTT_HOST` có đúng IP máy chủ chưa?
4. `BACKEND_URL` trong `config_gw.h` có đúng định dạng `http://IP/api/iot/data` chưa?
5. `device_id` trong firmware có khớp với đã đăng ký trên web chưa?
6. Sensor có trong `KNOWN_SENSORS` của Gateway chưa?
7. Thiết bị có bị **blocked** trên web không? → Devices → mở khoá

```powershell
# Xem request từ Gateway có vào đến Nginx không
docker compose logs -f nginx

# Xem Backend xử lý có lỗi không
docker compose logs -f backend
```

### Quên secret_key

Secret key chỉ hiển thị một lần khi tạo. Nếu mất:
1. Xoá thiết bị trên web
2. Tạo lại với cùng `device_id`
3. Sao chép `secret_key` mới
4. Sửa firmware và flash lại

---

## Tóm tắt nhanh (cheat sheet)

```
# ── SERVER ──────────────────────────────────────────────────────────
docker compose up -d --build        # khởi động lần đầu
docker compose up -d                # khởi động lại
docker compose ps                   # kiểm tra trạng thái
docker compose down                 # dừng
docker compose logs -f nginx        # xem log Nginx

# ── TRUY CẬP ────────────────────────────────────────────────────────
http://localhost                    # Web App (qua Nginx)
http://localhost/api/health         # API health check (qua Nginx)
http://localhost:5000/api/health    # API health check (trực tiếp)

# ── IP MÁY CHỦ CHO FIRMWARE ─────────────────────────────────────────
ipconfig     # → ghi lại IPv4, ví dụ: 192.168.1.100

# ── FIRMWARE (Sensor TRƯỚC, Gateway SAU) ────────────────────────────
# 1. Đăng ký thiết bị tại http://localhost → lấy credentials

# 2. Sửa config Sensor → Flash Sensor
#    file: firmware\sensor-node\include\config.h
#    MQTT_HOST = "192.168.1.100"
cd firmware\sensor-node
pio run --target upload
pio device monitor --baud 115200

# 3. Sửa config Gateway (điền KNOWN_SENSORS) → Flash Gateway
#    file: firmware\gateway-node\include\config_gw.h
#    BACKEND_URL = "http://192.168.1.100/api/iot/data"   ← qua Nginx cổng 80
cd firmware\gateway-node
pio run --target upload
pio device monitor --baud 115200
```
