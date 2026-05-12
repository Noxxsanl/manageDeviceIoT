# IoT Device Manager

Hệ thống quản lý thiết bị IoT full-stack: dashboard web, REST API, và firmware ESP32.

## Kiến trúc hệ thống

```
managerDeviceIoT/
├── frontend/            Next.js 16 + React 19 + TailwindCSS   → :3000
├── backend/             Express 5 + TypeScript                 → :5000
├── firmware/
│   ├── gateway-node/    ESP32 nhận dữ liệu từ Sensor → forward về Backend
│   └── sensor-node/     ESP32 đọc cảm biến → gửi về Gateway
├── scripts/             Script setup tự động
│   ├── setup.bat        Windows
│   └── setup.sh         Linux / macOS / WSL
└── docker-compose.yml   Development stack
```

---

## Phần 1 — Chạy Backend + Frontend (Docker)

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop) đã cài và đang chạy
- Cổng `3000`, `5000` chưa bị chiếm

### Bước 1.1 — Khởi động hệ thống

**Cách nhanh nhất — dùng script tự động:**

```bat
# Windows (CMD hoặc PowerShell)
scripts\setup.bat
```

```bash
# Linux / macOS / WSL
bash scripts/setup.sh
```

**Hoặc thủ công:**

```bash
# Bước 1: Copy file môi trường (chỉ cần làm lần đầu)
cp backend/.env.example backend/.env

# Bước 2: Build và khởi động
docker compose up -d --build
```

Lần đầu chạy sẽ mất 2–5 phút để build image. Các lần sau nhanh hơn.

---

### Bước 1.2 — Kiểm tra trạng thái

```bash
docker compose ps
```

Kết quả mong đợi — tất cả phải `running`:

```
NAME             STATUS
iot_backend      running
iot_frontend     running
```

Nếu một service bị `Exit` → xem log để tìm nguyên nhân:

```bash
docker compose logs backend
docker compose logs frontend
```

---

### Bước 1.3 — Truy cập hệ thống

| Dịch vụ | URL |
|---|---|
| **Dashboard** | http://localhost:3000 |
| **Backend API** | http://localhost:5000 |
| **Health check** | http://localhost:5000/api/health |

**Đăng nhập mặc định:**

| Trường | Giá trị |
|---|---|
| Username | `admin` |
| Password | `123456` |

---

### Bước 1.4 — Test nhanh bằng curl

```bash
# Kiểm tra backend còn sống
curl http://localhost:5000/api/health
```

Kết quả mong đợi:
```json
{ "status": "ok", "message": "Backend running" }
```

---

### Dừng hệ thống

```bash
# Dừng tất cả container, giữ nguyên dữ liệu
docker compose down

# Dừng riêng từng service
docker compose stop backend
docker compose stop frontend
```

---

### Khởi động lại sau khi đã dừng

```bash
# Chạy lại (không build lại image)
docker compose up -d

# Build lại image sau khi sửa code
docker compose up -d --build backend
docker compose up -d --build frontend
```

---

### Các lệnh Docker hay dùng

```bash
# Xem trạng thái
docker compose ps

# Xem log realtime tất cả services
docker compose logs -f

# Xem log riêng từng service
docker compose logs -f backend
docker compose logs -f frontend

# Restart một service
docker compose restart backend
```

**Production build:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Phần 2 — Chạy Local (không dùng Docker)

### Yêu cầu

- Node.js >= 20
- npm >= 10

### Backend

```bash
cd backend
cp .env.example .env
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

## Phần 3 — Cấu hình và Flash ESP32

> **Tổng quan**: Flash Gateway trước → lấy IP Gateway → Flash Sensor → kiểm tra Dashboard.

### Yêu cầu phần cứng

| Linh kiện | Số lượng |
|---|---|
| ESP32 DevKit V1 (30-pin hoặc 38-pin) | 2 |
| Cảm biến DHT22 (AM2302) | 1 |
| Điện trở 10kΩ | 1 |
| Dây jumper | Vài cái |
| Cáp USB Micro/Type-C | 2 |

### Sơ đồ kết nối DHT22 → ESP32 Sensor

```
ESP32               DHT22
──────────────────────────────────────────────────
3V3  ────────────── Pin 1 (VCC)     [chân trái nhất]
GPIO4 ──┬────────── Pin 2 (DATA)    [chân thứ 2]
        │
       10kΩ
        │
3V3  ──┘
GND  ────────────── Pin 4 (GND)     [chân phải nhất]
                    Pin 3 bỏ trống
```

> **Quan trọng**: Điện trở 10kΩ nối từ DATA lên 3V3 (pull-up resistor).
> Thiếu điện trở này DHT22 sẽ trả về `NaN` liên tục.

---

### Yêu cầu phần mềm — PlatformIO

Firmware dùng **PlatformIO** (không phải Arduino IDE thông thường).

**Cài PlatformIO:**
- Cách 1 (khuyến nghị): Cài extension **PlatformIO IDE** trong VS Code
- Cách 2: Cài CLI — xem [docs.platformio.org](https://docs.platformio.org/en/latest/core/installation/index.html)

Sau khi cài, khởi động lại VS Code. PlatformIO tự nhận `platformio.ini` khi mở thư mục firmware.

---

### Bước 3.1 — Tìm IP máy tính (cần cho Gateway)

ESP32 Gateway cần biết IP máy tính để forward dữ liệu về Backend.

**Windows:**

```
Win + R → gõ "cmd" → Enter → gõ lệnh: ipconfig

Tìm dòng "IPv4 Address" dưới adapter WiFi:
   Wireless LAN adapter Wi-Fi:
      IPv4 Address. . . . . . : 192.168.1.50   ← ĐÂY LÀ IP CẦN LẤY
```

**Linux / macOS:**

```bash
# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

> **Lưu ý**: Máy tính và 2 ESP32 phải kết nối **cùng một mạng WiFi**.

---

### Bước 3.2 — Flash ESP32 Gateway

Gateway nhận dữ liệu từ Sensor qua HTTP và forward về Backend.

**3.2.1 — Mở thư mục firmware trong VS Code:**

```
firmware/gateway-node/
```

**3.2.2 — Sửa file cấu hình** (`src/main.cpp`, phần đầu file):

```cpp
// ─── CẤU HÌNH NGƯỜI DÙNG ──────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // ← Tên WiFi nhà bạn
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";  // ← Mật khẩu WiFi

// IP máy tính đang chạy Docker backend
const char* BACKEND_URL = "http://192.168.1.50:5000/api/iot/data"; // ← Sửa IP
```

**Ví dụ sau khi sửa:**

```cpp
const char* WIFI_SSID     = "MyHomeWifi";
const char* WIFI_PASSWORD = "matkhau123";
const char* BACKEND_URL   = "http://192.168.1.50:5000/api/iot/data";
```

**3.2.3 — Upload firmware:**

Trong VS Code với PlatformIO:
```
Thanh dưới cùng → click biểu tượng → (Upload)
```

Hoặc dùng CLI:
```bash
cd firmware/gateway-node
pio run --target upload
```

**3.2.4 — Lấy IP của Gateway:**

Mở **Serial Monitor** (PlatformIO → Serial Monitor, baud rate **115200**), chờ thấy:

```
[WiFi] Gateway IP: 192.168.1.100
→ Dùng IP này làm GATEWAY_URL trong firmware sensor
```

**Ghi lại IP này** — dùng ở bước tiếp theo.

---

### Bước 3.3 — Flash ESP32 Sensor

Sensor đọc DHT22 và gửi dữ liệu về Gateway.

**3.3.1 — Mở thư mục firmware:**

```
firmware/sensor-node/
```

**3.3.2 — Sửa file cấu hình** (`src/main.cpp`):

```cpp
// ─── CẤU HÌNH NGƯỜI DÙNG ──────────────────────────────────────────
#define DHTPIN        4           // GPIO kết nối DATA của DHT22

const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // ← Tên WiFi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";  // ← Mật khẩu WiFi
const char* GATEWAY_URL   = "http://192.168.1.100:8080/iot/data"; // ← IP Gateway từ bước 3.2.4
const char* DEVICE_ID     = "sensor_01";           // ← ID thiết bị
```

**3.3.3 — Upload firmware:**

```bash
cd firmware/sensor-node
pio run --target upload
```

**3.3.4 — Kiểm tra Serial Monitor của Sensor:**

```
=== IoT Sensor Node khởi động ===
Device ID : sensor_01
Gateway   : http://192.168.1.100:8080/iot/data
[WiFi] Kết nối thành công! IP: 192.168.1.101
[DATA] Gửi: {"device_id":"sensor_01","temperature":29.5,"humidity":68.2}
[HTTP] Response: 200 — Gateway nhận thành công
```

---

### Bước 3.4 — Xác nhận Gateway forward dữ liệu

Serial Monitor của Gateway sẽ hiển thị:

```
[GATEWAY] ← Nhận request từ Sensor
[VALIDATE] device_id=sensor_01 | temp=29.5°C | hum=68.2%
[FORWARD] → http://192.168.1.50:5000/api/iot/data
[FORWARD] Backend response: 200
```

---

### Bước 3.5 — Xem Dashboard

Mở trình duyệt: **http://localhost:3000**

Dashboard tự cập nhật khi có dữ liệu mới từ thiết bị.

---

## Phần 4 — API Documentation

### GET `/api/health` — Kiểm tra trạng thái server

```http
GET http://localhost:5000/api/health
```

**Response 200:**
```json
{
  "status": "ok",
  "message": "Backend running"
}
```

---

## Phần 5 — Biến môi trường

### `backend/.env`

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `5000` | Port backend lắng nghe |

Tạo từ file mẫu:
```bash
cp backend/.env.example backend/.env
```

> File `.env` đã được `.gitignore` — không bao giờ commit file này lên git.
