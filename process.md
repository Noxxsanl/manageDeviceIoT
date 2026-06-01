# 📋 QUY TRÌNH CHẠY HỆ THỐNG IoT — ĐẦY ĐỦ TỪNG BƯỚC

> Tài liệu này mô tả toàn bộ các bước để chạy hệ thống từ phần mềm (Docker) đến phần cứng (ESP32).
> Đọc kỹ từng bước, **không bỏ qua thứ tự**.

---

## 🗺️ Tổng quan luồng dữ liệu

```
┌─────────────┐    MQTT publish         ┌──────────────────────────┐
│  DHT22      │ ──────────────────────► │  Mosquitto MQTT Broker   │
│  (cảm biến) │   topic:                │  (Docker, port 1883)     │
└─────────────┘   local/sensors/        └──────────┬───────────────┘
      │           {DEVICE_ID}/data                 │ subscribe wildcard
      │ GPIO 4                                      │ local/sensors/+/data
      ▼                                             ▼
┌─────────────┐                         ┌──────────────────────────┐
│  ESP32      │                         │  ESP32 Gateway Node      │
│  Sensor Node│                         │  (đọc MQTT, forward HTTP)│
└─────────────┘                         └──────────┬───────────────┘
                                                   │ HTTP POST
                                                   │ /api/device/data
                                                   ▼
                                        ┌──────────────────────────┐
                                        │  Backend (Node.js :5000) │
                                        │  + MySQL (:3308)         │
                                        └──────────┬───────────────┘
                                                   │ REST API
                                                   ▼
                                        ┌──────────────────────────┐
                                        │  Frontend (Next.js :3000)│
                                        │  Dashboard               │
                                        └──────────────────────────┘
```

---

## ✅ YÊU CẦU TRƯỚC KHI BẮT ĐẦU

| Công cụ | Version tối thiểu | Cách kiểm tra |
|---|---|---|
| Docker Desktop | 24.x (đang chạy) | `docker info` |
| PlatformIO IDE | Extension VS Code | Cài từ VS Code Marketplace |
| VS Code | Bất kỳ | — |
| Cable USB Micro/Type-C | 2 cái | — |
| 2x ESP32 DevKit V1 | — | — |
| 1x DHT22 + điện trở 10kΩ | — | — |

---

---

# PHẦN 1 — KHỞI ĐỘNG PHẦN MỀM (DOCKER)

---

## Bước 1 — Lấy IP máy tính

> ⚠️ Phải lấy IP **trước** khi cấu hình firmware. ESP32 dùng IP này để kết nối MQTT và Backend.
> Máy tính và 2 board ESP32 **phải cùng một mạng WiFi**.

**Windows — mở CMD:**
```
Win + R  →  gõ "cmd"  →  Enter

Gõ lệnh:
    ipconfig

Tìm dòng này (dưới "Wireless LAN adapter Wi-Fi"):
    IPv4 Address. . . . . . . . . . . : 192.168.1.50
                                        ↑
                                        ĐÂY LÀ IP CẦN GHI LẠI
```

**→ Ví dụ IP máy tính: `192.168.1.50` — ghi ra giấy hoặc notepad ngay bây giờ.**

---

## Bước 2 — Tạo file `.env` cho Backend

> Chỉ cần làm **một lần duy nhất**. Nếu file đã tồn tại thì bỏ qua bước này.

```bat
rem Windows CMD
copy backend\.env.example backend\.env
```

File `backend\.env` sau khi tạo sẽ có nội dung:

```env
PORT=5000

# Database — kết nối qua Docker network, không đổi
DB_HOST=mysql
DB_PORT=3306
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT

# JWT — nên đổi thành chuỗi ngẫu nhiên dài >= 32 ký tự trong production
JWT_SECRET=dev_secret_please_change_in_production_min32chars

# MQTT Broker — kết nối qua Docker network, không đổi
MQTT_HOST=mosquitto
MQTT_PORT=1883

# Tài khoản admin mặc định
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> **Lưu ý:** `DB_HOST=mysql` và `MQTT_HOST=mosquitto` là tên **Docker service**, không phải IP.
> Backend kết nối nội bộ qua Docker network — **KHÔNG** đổi sang `localhost`.

---

## Bước 3 — Khởi động toàn bộ hệ thống Docker

```bat
rem Cách 1 — Script tự động (khuyến nghị)
scripts\setup.bat

rem Cách 2 — Thủ công
docker compose up --build -d
```

Lần đầu chạy sẽ mất **3–7 phút** để tải image và build. Các lần sau nhanh hơn (< 30 giây).

---

## Bước 4 — Kiểm tra các service đã chạy

```bash
docker compose ps
```

**Kết quả mong đợi — tất cả STATUS phải là `running`:**

```
NAME              IMAGE                STATUS
iot-mysql         mysql:8.0            running (healthy)
iot-mosquitto     eclipse-mosquitto:2  running
iot-backend       iot-backend          running
iot-frontend      iot-frontend         running
```

> Nếu `iot-mysql` vẫn đang `starting` → chờ thêm 30 giây rồi kiểm tra lại.
> Backend tự chờ MySQL healthy trước khi khởi động (healthcheck 10s, retry 5 lần).

---

## Bước 5 — Xác nhận Backend hoạt động

```bash
curl http://localhost:5000/api/health
```

Kết quả mong đợi:
```json
{ "status": "ok", "message": "Backend running" }
```

---

## Bước 6 — Truy cập Dashboard

Mở trình duyệt: **http://localhost:3000**

**Đăng nhập:**
| Trường | Giá trị |
|---|---|
| Username | `admin` |
| Password | `admin123` |

---

## Bước 7 — Đăng ký thiết bị trên Dashboard

> Cần lấy `device_id` và `secret_key` cho mỗi ESP32 **trước khi flash firmware**.

**7.1 — Đăng ký Gateway:**
1. Đăng nhập Dashboard → mục **Devices** → **Add Device** (hoặc Register)
2. Điền tên thiết bị, chọn type: **gateway**
3. Nhấn Register → **chép lại `device_id` và `secret_key`**

Ví dụ kết quả:
```
device_id  : ESP32-GW-A1B2C3D4
secret_key : a1b2c3d4e5f6...  (64 ký tự hex)
```

**7.2 — Đăng ký Sensor:**
1. Tương tự → chọn type: **sensor**
2. **Chép lại `device_id` và `secret_key`**

Ví dụ kết quả:
```
device_id  : ESP32-SN-11223344
secret_key : 11223344aabbcc...  (64 ký tự hex)
```

> ⚠️ `secret_key` chỉ hiển thị **một lần**. Ghi lại ngay, mất thì phải đăng ký lại.

---

---

# PHẦN 2 — PHẦN CỨNG (NỐI DÂY ESP32)

---

## Bước 8 — Nối dây DHT22 vào ESP32 Sensor Node

```
ESP32 Sensor Node          DHT22
─────────────────────────────────────────────────────────
3V3  ─────────────────── Pin 1 (VCC)   [chân trái nhất]
                                          │
GPIO 4 ─────┬─────────── Pin 2 (DATA)  [chân thứ 2]
             │
           10kΩ   ← BẮT BUỘC — điện trở pull-up
             │
3V3  ───────┘
GND  ─────────────────── Pin 4 (GND)   [chân phải nhất]
                         Pin 3          [bỏ trống]
```

> ⚠️ **Thiếu điện trở 10kΩ** → DHT22 luôn trả về `NaN` dù đã nối đúng chân.
> Điện trở nối từ chân DATA lên 3V3 (pull-up), không phải xuống GND.

**ESP32 Gateway Node:** Không cần nối cảm biến, chỉ cắm điện/USB.

---

---

# PHẦN 3 — FLASH FIRMWARE (PLATFORMIO)

---

## Bước 9 — Cấu hình firmware Gateway

Mở file: `firmware/gateway-node/src/config_gw.h`

```cpp
// =============================================================
//  Điền thông tin lấy từ Dashboard (Bước 7.1)
// =============================================================

// --- Gateway Identity ---
#define GW_DEVICE_ID   "ESP32-GW-A1B2C3D4"           // ← device_id từ Dashboard
#define GW_SECRET_KEY  "a1b2c3d4e5f6..."              // ← secret_key từ Dashboard

// --- WiFi ---
#define WIFI_SSID      "TenMangWifi"                  // ← Tên WiFi của bạn
#define WIFI_PASS      "MatKhauWifi"                  // ← Mật khẩu WiFi

// --- MQTT Broker (Mosquitto chạy trong Docker trên máy tính) ---
#define MQTT_HOST      "192.168.1.50"                 // ← IP máy tính (lấy từ Bước 1)
#define MQTT_PORT      1883

// --- Backend API ---
#define BACKEND_URL    "http://192.168.1.50:5000/api/device/data"  // ← Sửa IP

// =============================================================
//  Danh sách Sensor được phép gửi dữ liệu qua Gateway này
//  Điền thông tin Sensor đã đăng ký (Bước 7.2)
// =============================================================
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-11223344", "11223344aabbcc..." },  // ← device_id và secret_key của Sensor
    // Thêm sensor thứ 2 nếu có:
    // { "ESP32-SN-YYYYYYYY", "another-secret-key" },
};
```

**Lưu file lại.**

---

## Bước 10 — Flash firmware lên ESP32 Gateway

**Cắm USB Gateway vào máy tính** (chỉ cắm Gateway, chưa cắm Sensor).

### Cách 1 — Dùng VS Code + PlatformIO (khuyến nghị)

1. Mở VS Code → mở thư mục `firmware/gateway-node/`
2. Thanh dưới cùng VS Code → click biểu tượng **→ (Upload)**
3. Chờ `SUCCESS` xuất hiện trong terminal PlatformIO

### Cách 2 — Dùng CLI

```bash
cd firmware/gateway-node
pio run --target upload
```

Output thành công:
```
Linking .pio/build/esp32doit-devkit-v1/firmware.elf
Building .pio/build/esp32doit-devkit-v1/firmware.bin
...
Writing at 0x00010000... (100 %)
Hard resetting via RTS pin...
========================= [SUCCESS] =========================
```

> Nếu lỗi **"No device found"**: kiểm tra driver USB (cài CP2102 hoặc CH340 driver).
> Nếu lỗi **"Could not open port"**: đóng Serial Monitor đang mở ở tab khác.

---

## Bước 11 — Kiểm tra Gateway qua Serial Monitor

```bash
# Mở Serial Monitor (baud 115200)
pio device monitor --baud 115200
```

**Hoặc trong VS Code:** Thanh dưới → biểu tượng **🔌 (Serial Monitor)**

Output mong đợi sau khi flash thành công:

```
╔══════════════════════════════════╗
║   IoT Gateway Node – Khởi động   ║
╚══════════════════════════════════╝
  Gateway ID : ESP32-GW-A1B2C3D4
  Backend URL: http://192.168.1.50:5000/api/device/data

[WiFi] Đang kết nối WiFi...
[WiFi] Kết nối thành công! IP: 192.168.1.100     ← GHI LẠI IP NÀY (không cần dùng)
[NTP] Đồng bộ thời gian...OK
[MQTT] Broker: 192.168.1.50:1883
[MQTT] Connecting as 'gw-ESP32-GW-A1B2C3D4'... OK
[MQTT] Subscribed to 'local/sensors/+/data'
[MAIN] Setup hoàn tất – lắng nghe sensor data...
```

> Nếu thấy `[MQTT] FAILED (rc=-2)` → kiểm tra lại `MQTT_HOST` trong `config_gw.h` có đúng IP máy tính không.
> Nếu thấy `[WiFi] Connecting...` mãi không dừng → kiểm tra `WIFI_SSID` và `WIFI_PASS`.

**Đóng Serial Monitor Gateway** (hoặc rút USB ra) rồi tiếp tục bước tiếp theo.

---

## Bước 12 — Cấu hình firmware Sensor

Mở file: `firmware/sensor-node/src/config.h`

```cpp
// =============================================================
//  Điền thông tin lấy từ Dashboard (Bước 7.2)
// =============================================================

// --- Device Identity ---
#define DEVICE_ID   "ESP32-SN-11223344"              // ← device_id của Sensor
#define SECRET_KEY  "11223344aabbcc..."               // ← secret_key của Sensor

// --- WiFi (cùng mạng với máy tính và Gateway) ---
#define WIFI_SSID   "TenMangWifi"                    // ← Tên WiFi
#define WIFI_PASS   "MatKhauWifi"                    // ← Mật khẩu WiFi

// --- MQTT Broker (Mosquitto trên máy tính, giống Gateway) ---
#define MQTT_HOST   "192.168.1.50"                   // ← IP máy tính (Bước 1)
#define MQTT_PORT   1883

// --- DHT22 ---
#define DHT_PIN     4                                // GPIO 4 (không đổi)
#define DHT_TYPE    DHT22

// --- LED onboard GPIO 2 nháy khi gửi thành công ---
#define LED_SEND_PIN  2

// --- Gửi dữ liệu mỗi 5 giây ---
#define SEND_INTERVAL     5000
#define MQTT_BUFFER_SIZE  512
```

**Lưu file lại.**

---

## Bước 13 — Flash firmware lên ESP32 Sensor

**Rút USB Gateway ra. Cắm USB Sensor vào máy tính.**

### Cách 1 — VS Code

1. Mở thư mục `firmware/sensor-node/`
2. Thanh dưới cùng → **→ (Upload)**

### Cách 2 — CLI

```bash
cd firmware/sensor-node
pio run --target upload
```

---

## Bước 14 — Kiểm tra Sensor qua Serial Monitor

```bash
pio device monitor --baud 115200
```

Output mong đợi:

```
╔══════════════════════════════════╗
║   IoT Sensor Node – Khởi động    ║
╚══════════════════════════════════╝
  Device ID  : ESP32-SN-11223344
  DHT22 Pin  : GPIO 4
  Gửi mỗi   : 5000 ms

[WiFi] Đang kết nối WiFi...
[WiFi] Kết nối thành công! IP: 192.168.1.101
[NTP] Đồng bộ thời gian...OK
[MQTT] Broker: 192.168.1.50:1883
[MQTT] Connecting as 'sn-ESP32-SN-11223344'... OK
[MAIN] Setup hoàn tất – vào vòng lặp chính

[MQTT] Published (128 bytes): {"sensor_id":"ESP32-SN-11223344","sn_timestamp":1716552000,"sn_hmac":"...","data":{"temperature":29.50,"humidity":68.20}}
[MQTT] Published (128 bytes): {"sensor_id":"ESP32-SN-11223344",...}
```

LED onboard (GPIO 2) nháy mỗi 5 giây khi gửi thành công.

---

---

# PHẦN 4 — XÁC NHẬN TOÀN BỘ PIPELINE

---

## Bước 15 — Kiểm tra Gateway nhận và forward

Cắm lại USB Gateway, mở Serial Monitor:

```bash
pio device monitor --baud 115200
```

Khi Sensor gửi dữ liệu, Gateway phải hiển thị:

```
[MQTT] Received on 'local/sensors/ESP32-SN-11223344/data' (128 bytes)
[FWD] Xác thực HMAC OK cho sensor 'ESP32-SN-11223344'
[FWD] → POST http://192.168.1.50:5000/api/device/data
[FWD] Backend response: 200
```

> Nếu `[FWD] Backend response: 403` → Sensor chưa được thêm vào `KNOWN_SENSORS[]` trong `config_gw.h`.
> Nếu `[FWD] Backend response: 401` → `secret_key` của Sensor sai → kiểm tra lại `KNOWN_SENSORS[]`.

---

## Bước 16 — Kiểm tra Backend nhận dữ liệu

```bash
docker compose logs -f backend
```

Khi có dữ liệu từ Gateway, Backend log hiển thị:
```
POST /api/device/data 200 15ms
```

---

## Bước 17 — Xem dữ liệu trên Dashboard

Mở trình duyệt: **http://localhost:3000**

- Dashboard tự cập nhật khi có dữ liệu mới
- Vào mục **Devices** → chọn thiết bị → xem biểu đồ nhiệt độ/độ ẩm theo thời gian

---

---

# PHẦN 5 — LỆNH QUẢN LÝ THƯỜNG DÙNG

---

## Docker

```bash
# Xem trạng thái tất cả services
docker compose ps

# Xem log realtime tất cả services
docker compose logs -f

# Xem log riêng từng service
docker compose logs -f backend
docker compose logs -f mosquitto
docker compose logs -f mysql

# Dừng toàn bộ (giữ dữ liệu)
docker compose down

# Dừng và XOÁ toàn bộ dữ liệu (reset sạch)
docker compose down -v

# Restart một service
docker compose restart backend

# Build lại sau khi sửa code
docker compose up --build -d backend
docker compose up --build -d frontend

# Vào shell MySQL
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

## PlatformIO

```bash
# Build kiểm tra (không upload)
pio run

# Upload firmware
pio run --target upload

# Xem Serial Monitor
pio device monitor --baud 115200

# Xem danh sách cổng COM
pio device list

# Xóa build cache
pio run --target clean
```

---

---

# PHẦN 6 — XỬ LÝ LỖI THƯỜNG GẶP

---

### ❌ Docker Desktop chưa chạy

**Lỗi:** `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`

```
→ Mở Docker Desktop từ Start Menu
→ Chờ icon Docker ở system tray chuyển trắng (hết loading)
→ Chạy lại: docker compose up --build -d
```

---

### ❌ Port 3306 bị chiếm

**Lỗi:** `Ports are not available: exposing port TCP 0.0.0.0:3306`

Docker đã cấu hình dùng port **3308** (bên ngoài) → 3306 (bên trong).
Nếu vẫn lỗi, sửa `docker-compose.yml`:
```yaml
ports:
  - "3309:3306"   # đổi 3308 thành 3309
```

---

### ❌ `iot-backend` exit sau khi start

```bash
docker compose logs backend
# Xem dòng lỗi cuối cùng để tìm nguyên nhân

# Thường do:
# 1. backend/.env chưa tạo → copy lại từ .env.example
# 2. MySQL chưa healthy → chờ thêm
# 3. JWT_SECRET quá ngắn (cần >= 32 ký tự)
```

---

### ❌ ESP32 không kết nối được MQTT (`rc=-2`)

```
Nguyên nhân: MQTT_HOST sai IP
→ Kiểm tra lại IP máy tính bằng ipconfig
→ Sửa MQTT_HOST trong config.h / config_gw.h
→ Flash lại firmware
→ Đảm bảo ESP32 và máy tính cùng mạng WiFi
→ Kiểm tra firewall Windows không chặn port 1883:
   Windows Defender Firewall → Advanced Settings
   → Inbound Rules → New Rule → Port → 1883 → Allow
```

---

### ❌ DHT22 trả về `NaN` liên tục

```
Nguyên nhân 1: Thiếu điện trở 10kΩ pull-up
→ Gắn điện trở từ chân DATA lên 3V3

Nguyên nhân 2: Sai GPIO
→ Kiểm tra DHT_PIN = 4 trong config.h và dây thực tế gắn vào GPIO 4

Nguyên nhân 3: DHT22 bị hỏng hoặc nguồn không ổn định
→ Dùng nguồn 3.3V (không phải 5V) cho DHT22
```

---

### ❌ Gateway nhận được MQTT nhưng Backend trả 403/401

```
403 INVALID_DEVICE_TYPE     → device_id của Gateway chưa đăng ký đúng type "gateway"
403 SENSOR_NOT_ALLOWED      → Sensor chưa được thêm vào KNOWN_SENSORS[] trong config_gw.h
401 INVALID_HMAC             → secret_key trong KNOWN_SENSORS[] sai
→ Kiểm tra lại Dashboard → Devices và cập nhật config_gw.h
```

---

### ❌ Không tìm thấy cổng COM (PlatformIO)

```
→ Cài driver USB:
   CH340/CH341: https://www.wch-ic.com/downloads/CH341SER_EXE.html
   CP2102:      https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
→ Kiểm tra Device Manager → Ports (COM & LPT)
→ Thử cổng USB khác trên máy tính
```

---

---

# PHẦN 7 — THỨ TỰ KHỞI ĐỘNG TÓM TẮT

```
1. Lấy IP máy tính (ipconfig)
         ↓
2. Tạo backend/.env (copy từ .env.example)
         ↓
3. docker compose up --build -d
         ↓
4. Chờ iot-mysql (healthy) → kiểm tra docker compose ps
         ↓
5. Mở Dashboard http://localhost:3000 → đăng ký Gateway + Sensor
         ↓
6. Điền config_gw.h (Gateway) → Flash Gateway → Xem Serial Monitor
         ↓
7. Điền config.h (Sensor) → Flash Sensor → Xem Serial Monitor
         ↓
8. Xác nhận: Gateway forward OK → Backend log 200 → Dashboard hiện data
```

---

*Cập nhật lần cuối: 2026-05-24*
