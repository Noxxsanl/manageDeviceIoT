# Integration Test – Luồng End-to-End

## Kiến trúc luồng dữ liệu

```
[ESP32 Sensor Node]
    │  MQTT publish: local/sensors/{sensor_id}/data
    │  Payload: { sensor_id, sn_timestamp, sn_hmac, data:{temp,hum} }
    ▼
[Mosquitto Broker] ─── port 1883
    │
    │  (wildcard subscribe: local/sensors/+/data)
    ▼
[ESP32 Gateway Node]
    │  1. Parse JSON từ sensor
    │  2. Verify sn_hmac locally (whitelist + HMAC#1)
    │  3. Tính gw_hmac = HMAC(GW_SECRET, gw_id:gw_ts)
    │  4. Build merged payload (sensor data lồng trong sensor_payload)
    │  MQTT publish: gateway/{gw_id}/data
    ▼
[Mosquitto Broker] ─── port 1883
    │
    │  (Backend subscribe: gateway/+/data)
    ▼
[Backend Express – port 5000]  ← mqttDataService.ts
    │  Xử lý trong MQTT callback:
    │    - Level 1: Verify gw_hmac (lookup GW secret từ DB)
    │    - Level 2: Verify sn_hmac (lookup SN secret từ DB)
    │  Handler: INSERT sensor_data, UPDATE last_seen
    ▼
[MySQL 8.0]
    │
    ▼
[Next.js Dashboard – port 3000]  (hoặc qua Nginx port 80)
    SWR polling 10s → hiển thị real-time
```

---

## Checklist Chuẩn Bị

### 1. Backend & Database
- [ ] `docker compose up -d` → MySQL + Mosquitto + Backend + Frontend + Nginx đang chạy
- [ ] Kiểm tra: `curl http://localhost:5000/api/health` → `{"status":"ok","db":"connected","mqtt":"connected"}`
- [ ] Đăng nhập Dashboard: `http://localhost` (qua Nginx) hoặc `http://localhost:3000` → admin / admin123

### 2. Đăng ký thiết bị

Đăng ký Gateway qua Dashboard (`/devices/new`, loại: gateway):
```
device_id:  ESP32-GW-XXXXXXXX  ← ghi lại
secret_key: <64 hex chars>     ← ghi lại (chỉ hiện 1 lần!)
```

Đăng ký Sensor qua Dashboard (`/devices/new`, loại: sensor):
```
device_id:  ESP32-SN-XXXXXXXX  ← ghi lại
secret_key: <64 hex chars>     ← ghi lại (chỉ hiện 1 lần!)
```

Kích hoạt cả 2 thiết bị: `PATCH /api/devices/:id/status` → `active`

### 3. Cấu hình Firmware

**Sensor Node** – sửa `firmware/sensor-node/include/config.h`:
```cpp
#define DEVICE_ID   "ESP32-SN-XXXXXXXX"   // từ bước đăng ký
#define SECRET_KEY  "..."                  // từ bước đăng ký
#define WIFI_SSID   "your-wifi"
#define WIFI_PASS   "your-pass"
#define MQTT_HOST   "192.168.x.x"          // IP máy chủ (LAN)
#define MQTT_PORT   1883
#define SEND_INTERVAL 5000
```

**Gateway Node** – sửa `firmware/gateway-node/include/config_gw.h`:
```cpp
#define GW_DEVICE_ID   "ESP32-GW-XXXXXXXX"
#define GW_SECRET_KEY  "..."
#define WIFI_SSID      "your-wifi"
#define WIFI_PASS      "your-pass"
#define MQTT_HOST      "192.168.x.x"       // IP máy chủ (LAN)
#define MQTT_PORT      1883
// Gateway lấy danh sách sensor hợp lệ qua HTTP mỗi 5 phút:
#define BACKEND_SENSORS_URL "http://192.168.x.x/api/device/sensors"

static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-XXXXXXXX", "sensor-secret-key" },  // từ bước đăng ký
};
```

### 4. Flash Firmware
```bash
# Flash Sensor Node
cd firmware/sensor-node
pio run --target upload --environment esp32doit-devkit-v1

# Flash Gateway Node
cd firmware/gateway-node
pio run --target upload --environment esp32doit-devkit-v1
```

---

## Integration Test – Step by Step

### Test 1: Khởi động hệ thống

1. Cắm điện Sensor Node → mở Serial Monitor (115200 baud)
2. Cắm điện Gateway Node → mở Serial Monitor thứ hai
3. Kỳ vọng Serial Monitor Sensor:
   ```
   [WiFi] OK – IP: 192.168.x.x
   [NTP] OK – 2026-05-20 10:00:00 (UTC+7)
   [MQTT] Connected as 'sn-ESP32-SN-XXXXXXXX'
   [MAIN] Setup hoàn tất – vào vòng lặp chính
   ```
4. Kỳ vọng Serial Monitor Gateway:
   ```
   [WiFi] OK – IP: 192.168.x.x
   [NTP] OK – 2026-05-20 10:00:00 (UTC+7)
   [MQTT] Subscribed to 'local/sensors/+/data'
   [MAIN] Setup hoàn tất – lắng nghe sensor data...
   ```

### Test 2: Gửi dữ liệu cảm biến

Sau mỗi 5 giây, Sensor Node publish MQTT. Kỳ vọng Gateway Serial Monitor:
```
[MQTT] Received on 'local/sensors/ESP32-SN-XXXXXXXX/data' (186 bytes)
[FWD] Sensor HMAC OK – 'ESP32-SN-XXXXXXXX'
[FWD] Publishing to 'gateway/ESP32-GW-XXXXXXXX/data' (412 bytes)
[FWD] MQTT publish OK
```

Kỳ vọng Backend log (docker compose logs backend):
```
[mqttData] saved id=N from ESP32-SN-XXXXXXXX via ESP32-GW-XXXXXXXX
```

### Test 3: Kiểm tra Database

```sql
-- Dữ liệu đang vào DB
SELECT d.device_id, s.payload, s.received_at
FROM sensor_data s
JOIN devices d ON d.id = s.device_id
ORDER BY s.received_at DESC
LIMIT 5;

-- last_seen được cập nhật
SELECT device_id, last_seen, fail_count
FROM devices
WHERE device_type IN ('sensor', 'gateway');
```

### Test 4: Kiểm tra Dashboard real-time

1. Mở `http://localhost` (qua Nginx) hoặc `http://localhost:3000`
2. Vào trang Devices: Gateway và Sensor phải hiển thị **Online** (chấm xanh)
3. Vào trang chi tiết Sensor: biểu đồ nhiệt độ/độ ẩm tự cập nhật mỗi 10s
4. Vào trang Audit Log: thấy các event `DATA_RECV`

### Test 5: Chạy liên tục ≥ 10 phút

- Để hệ thống chạy ít nhất 10 phút
- Kiểm tra: `SELECT COUNT(*) FROM sensor_data WHERE received_at > NOW() - INTERVAL 10 MINUTE`
- Kỳ vọng: ~120 bản ghi (12 lần/phút × 10 phút)

---

## Demo Attack Scenarios

Chạy script demo sau khi đã cập nhật credentials vào file:

```bash
chmod +x scripts/attack_demo.sh
./scripts/attack_demo.sh \
    http://localhost:5000 \
    "ESP32-GW-XXXXXXXX" \
    "gw-secret-key" \
    "ESP32-SN-XXXXXXXX" \
    "sn-secret-key"
```

### Kỳ vọng kết quả từng scenario:

| # | Scenario | Kỳ vọng | Cơ chế bảo vệ |
|---|----------|---------|---------------|
| 0 | Baseline (valid) | 200 OK | – |
| 1 | Device Spoofing | 401 GATEWAY_AUTH_FAIL | HMAC-SHA256 verify |
| 2 | Replay Attack | 401 TIMESTAMP_EXPIRED | Timestamp window ±300s |
| 3 | Brute Force (×6) | 401×4 → 403 DEVICE_BLOCKED | fail_count >= 5 → block |
| 4 | Unregistered Device | 401 GATEWAY_AUTH_FAIL | DB lookup |
| 5 | Privilege Escalation | 403 INVALID_DEVICE_TYPE | RBAC device_type check |

### Kiểm tra audit_log sau demo:

```sql
SELECT event_type, device_id, ip_address, created_at, details
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;
```

Phải thấy các event: `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`, `DATA_RECV`

---

## Checklist Hoàn Thành Task 15

- [ ] Gateway Node firmware build thành công (PlatformIO)
- [ ] Sensor → MQTT → Gateway: Serial Monitor hiện HMAC OK
- [ ] Gateway → Backend: MQTT publish thành công, backend log `[mqttData] saved id=N`
- [ ] Dữ liệu vào MySQL: `sensor_data` có bản ghi mới
- [ ] Dashboard: thiết bị hiện Online, biểu đồ cập nhật
- [ ] Hệ thống chạy liên tục ≥ 10 phút không lỗi
- [ ] Attack demo script chạy thành công, tất cả scenario đúng kỳ vọng
- [ ] Audit log có đầy đủ các event type
