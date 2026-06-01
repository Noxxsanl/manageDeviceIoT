# Gateway Node Firmware

Firmware cho **ESP32-S3 N16R8** hoạt động như một IoT Gateway: nhận dữ liệu từ các Sensor Node qua MQTT nội bộ, xác thực HMAC, rồi forward lên Backend API.

---

## Kiến trúc tổng quan

```
Sensor Node (ESP32)
      │  MQTT publish
      │  topic: local/sensors/{sensor_id}/data
      ▼
 MQTT Broker (Mosquitto – LAN)
      │  subscribe: local/sensors/+/data
      ▼
 Gateway Node (ESP32-S3)           ← firmware này
      │  validate HMAC + timestamp
      │  sign với gateway secret
      │  HTTP POST
      ▼
 Backend API
```

---

## Phần cứng

| Thành phần | Thông số |
|---|---|
| Board | ESP32-S3 DevKitC-1 N16R8 |
| Flash | 16 MB (QIO) |
| PSRAM | 8 MB (OPI) |
| LED WiFi | GPIO 4 – xanh lá (220 Ω lên 3.3 V) |
| LED Forward | GPIO 5 – vàng (220 Ω lên 3.3 V) |

> **Lưu ý GPIO ESP32-S3:**
> - GPIO 0 – nút BOOT, không dùng làm output
> - GPIO 19/20 – USB D−/D+, không dùng
> - GPIO 48 – onboard RGB (WS2812B), cần thư viện riêng

---

## Cấu trúc project

```
gateway-node/
├── include/
│   └── config_gw.h          # Cấu hình tập trung (WiFi, MQTT, secrets, sensor whitelist)
├── lib/
│   ├── hmac_util/            # HMAC-SHA256 dùng mbedTLS tích hợp sẵn của ESP-IDF
│   ├── wifi_manager/         # Kết nối và auto-reconnect WiFi
│   ├── ntp_sync/             # Đồng bộ thời gian NTP (UTC+7)
│   ├── mqtt_client/          # MQTT subscriber + auto-reconnect
│   └── forwarder/            # Validate payload, ký gateway HMAC, POST HTTP
├── src/
│   └── main.cpp              # Entry point (setup / loop)
├── partitions_16MB.csv       # Partition table: app0/app1 6.5 MB, SPIFFS 3.4 MB
└── platformio.ini
```

---

## Cấu hình trước khi nạp firmware

Mở [`include/config_gw.h`](include/config_gw.h) và điền đầy đủ các giá trị:

```cpp
// 1. Identity — lấy từ API đăng ký thiết bị
#define GW_DEVICE_ID  "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY "your-64-char-hex-secret"

// 2. WiFi
#define WIFI_SSID "your-ssid"
#define WIFI_PASS "your-password"

// 3. MQTT Broker (IP máy chạy Mosquitto)
#define MQTT_HOST "192.168.1.100"
#define MQTT_PORT 1883

// 4. Backend API
#define BACKEND_URL "http://192.168.1.100:3000/api/device/data"

// 5. Danh sách sensor được phép gửi dữ liệu
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "sensor-64-char-hex-secret" },
};
```

---

## Quy trình xác thực payload

Mỗi message MQTT từ Sensor Node đi qua pipeline 4 bước trước khi được forward:

```
Nhận MQTT payload
      │
      ├─ 1. Parse JSON  →  thiếu field → DROP
      ├─ 2. Whitelist   →  sensor lạ   → REJECT
      ├─ 3. Timestamp   →  ngoài ±300s → REJECT
      └─ 4. Sensor HMAC →  sai hash    → REJECT
                │
                ▼ PASS
      Tính Gateway HMAC
      Build output JSON
      HTTP POST → Backend
```

**Sensor payload (MQTT input):**
```json
{
  "sensor_id":    "ESP32-SN-XXXXXXXX",
  "sn_timestamp": 1717200000,
  "sn_hmac":      "64-char-hex",
  "data": { "temperature": 28.5, "humidity": 65.2 }
}
```

**Forwarded payload (HTTP output):**
```json
{
  "gateway_id":   "ESP32-GW-XXXXXXXX",
  "gw_timestamp": 1717200001,
  "gw_hmac":      "64-char-hex",
  "sensor_id":    "ESP32-SN-XXXXXXXX",
  "sn_timestamp": 1717200000,
  "sn_hmac":      "64-char-hex",
  "data": { "temperature": 28.5, "humidity": 65.2 }
}
```

**Thuật toán HMAC:**
```
sensor_hmac = HMAC-SHA256(sensor_secret, "sensor_id:sn_timestamp")
gateway_hmac = HMAC-SHA256(gw_secret,    "gateway_id:gw_timestamp")
```

---

## Build & Flash

**Yêu cầu:** [PlatformIO](https://platformio.org/) (CLI hoặc VS Code extension)

```bash
# Build
pio run

# Flash + monitor
pio run --target upload && pio device monitor

# Chỉ monitor
pio device monitor --baud 115200
```

> ESP32-S3 dùng USB CDC native. Nếu monitor bị treo sau flash, nhấn nút **RESET** trên board.

---

## Serial log mẫu

```
╔══════════════════════════════════╗
║   IoT Gateway Node – Starting    ║
╚══════════════════════════════════╝
  Gateway ID : ESP32-GW-XXXXXXXX
  Backend URL: http://192.168.1.100:3000/api/device/data

[WiFi] Connecting to 'your-ssid'..........
[WiFi] OK – IP: 192.168.1.42
[NTP] Syncing....
[NTP] OK – 2024-06-01 08:00:00 (UTC+7)
[MQTT] Broker: 192.168.1.100:1883
[MQTT] Connecting as 'gw-ESP32-GW-XXXXXXXX'... OK
[MQTT] Subscribed to 'local/sensors/+/data'

[MAIN] Ready – listening for sensor data...

[MQTT] Received on 'local/sensors/ESP32-SN-XXXXXXXX/data' (128 bytes)
[FWD] Sensor HMAC OK – 'ESP32-SN-XXXXXXXX'
[FWD] Posting 312 bytes to backend
[FWD] Backend OK (200)
```

---

## Thư viện phụ thuộc

| Thư viện | Phiên bản | Mục đích |
|---|---|---|
| [PubSubClient](https://github.com/knolleary/pubsubclient) | ^2.8 | MQTT client |
| [ArduinoJson](https://arduinojson.org/) | ^6.21.5 | Parse/build JSON |
| mbedTLS | tích hợp ESP-IDF | HMAC-SHA256 |
