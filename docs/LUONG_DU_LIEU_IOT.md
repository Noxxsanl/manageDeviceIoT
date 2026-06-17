# Luồng Dữ Liệu IoT — Sensor → Gateway → Backend

---

## 1. Sensor Node gửi lên MQTT Broker gì?

**Topic:**
```
local/sensors/<DEVICE_ID>/data
```

**Payload (JSON):**
```json
{
  "sensor_id":    "ESP32-SN-CBF05770",
  "sn_timestamp": 1718700000,
  "sn_hmac":      "abc123...",
  "sensor_ip":    "192.168.1.x",
  "data": {
    "temperature": 28.5,
    "humidity":    65.2
  }
}
```

**Chi tiết từng field:**

| Field | Mô tả |
|---|---|
| `sensor_id` | ID thiết bị (định danh duy nhất) |
| `sn_timestamp` | Unix timestamp lấy từ NTP — dùng để chống replay attack |
| `sn_hmac` | HMAC-SHA256 của `"<DEVICE_ID>:<timestamp>"` ký bằng `SECRET_KEY` — xác thực tính toàn vẹn |
| `sensor_ip` | IP của sensor node trên mạng LAN |
| `data.temperature` | Nhiệt độ đọc từ DHT22 (°C) |
| `data.humidity` | Độ ẩm đọc từ DHT22 (%) |

**Chu kỳ gửi:** mỗi 5000ms (5 giây).

**Luồng:** Sensor → MQTT Broker (local, port 1883) → Gateway subscribe topic này → forward lên Backend.

---

## 2. Gateway làm gì sau khi nhận dữ liệu từ Sensor?

Gateway **subscribe** `local/sensors/+/data` (Broker 1) và thực hiện **7 bước**:

### Bước 1 — Parse JSON
Giải mã payload từ sensor, kiểm tra đủ các field bắt buộc: `sensor_id`, `sn_timestamp`, `sn_hmac`, `data`. Thiếu field nào → **REJECT**.

### Bước 2 — Tra cứu secret từ Registry
Tìm `SECRET_KEY` của sensor trong registry nội bộ (đã fetch từ Backend). Nếu không thấy, thử **lazy-refresh** từ backend một lần nữa. Sensor không có trong registry → **REJECT** (chặn thiết bị lạ).

### Bước 3 — Kiểm tra Timestamp Window
So sánh `sn_timestamp` (của sensor) với `gw_now` (NTP của gateway). Nếu lệch quá `±TIMESTAMP_WINDOW_SEC` → **REJECT** (chống replay attack).

### Bước 4 — Xác thực HMAC của Sensor
Tính lại `HMAC-SHA256("<sensor_id>:<sn_timestamp>", SECRET_KEY)` và so sánh với `sn_hmac` bằng **constant-time compare** (chống timing attack). Sai → **REJECT**.

### Bước 5 — Ký HMAC của Gateway
Gateway tự ký: `HMAC-SHA256("<GW_DEVICE_ID>:<gw_timestamp>", GW_SECRET_KEY)` → tạo `gw_hmac` để backend xác thực gateway.

### Bước 6 — Build payload mới
```json
{
  "gateway_id":   "ESP32-GW-78867B14",
  "gateway_ip":   "192.168.100.139",
  "gw_timestamp": 1718700010,
  "gw_hmac":      "def456...",
  "sensor_payload": {
    "sensor_id":    "ESP32-SN-CBF05770",
    "sn_timestamp": 1718700000,
    "sn_hmac":      "abc123...",
    "sensor_ip":    "192.168.1.x",
    "data": {
      "temperature": 28.5,
      "humidity":    65.2
    }
  }
}
```

### Bước 7 — Publish lên Backend (Broker 2)
**Topic:** `gateway/<GW_DEVICE_ID>/data`

Gửi qua **Broker 2** (broker riêng của backend, port khác với broker local của sensor).

---

## 3. Có 2 Sensor Node — Gateway xử lý như thế nào?

Gateway **không gom 2 sensor lại thành 1 payload**. Nó xử lý **độc lập từng message** nhờ wildcard topic `local/sensors/+/data`.

```
Sensor-1 ──[local/sensors/ESP32-SN-CBF05770/data]──▶ ┐
                                                        Gateway ──[gateway/ESP32-GW-.../data]──▶ Backend
Sensor-2 ──[local/sensors/ESP32-SN-6A7F4B74/data]──▶ ┘
```

Mỗi message kích hoạt `forwardSensorData()` **riêng biệt**, publish **2 message riêng** lên cùng 1 topic backend. Backend phân biệt 2 sensor qua `sensor_payload.sensor_id` trong từng message.

**Message từ Sensor-1:**
```json
{
  "gateway_id": "ESP32-GW-78867B14",
  "sensor_payload": { "sensor_id": "ESP32-SN-CBF05770", ... }
}
```

**Message từ Sensor-2:**
```json
{
  "gateway_id": "ESP32-GW-78867B14",
  "sensor_payload": { "sensor_id": "ESP32-SN-6A7F4B74", ... }
}
```

---

## 4. Backend làm gì sau khi nhận từ Broker 2?

Backend **subscribe** `gateway/+/data` (Broker 2, port 1884) và thực hiện:

### Bước 1 — Parse JSON & kiểm tra field
Giải mã payload, kiểm tra có đủ `gateway_id`, `gw_timestamp`, `gw_hmac`, `sensor_payload`. Thiếu → **drop**.

### Bước 2 — Xác thực HMAC Gateway (Level 1)
Gọi `verifyGatewayHMAC()` → tra DB lấy `secret_key` của gateway, tính lại HMAC, so sánh.
- Fail → ghi audit log `GATEWAY_AUTH_FAIL`, tăng `fail_count`
- Nếu `fail_count >= 5` → tự động **block gateway** (`status = 'blocked'`)

### Bước 3 — Xác thực HMAC Sensor (Level 2)
Gọi `verifyDeviceHMAC()` → tra DB lấy `secret_key` của sensor, xác thực `sn_hmac`.
- Fail → ghi audit log `SENSOR_AUTH_FAIL`, tăng `fail_count`, có thể **block sensor**

### Bước 4 — Kiểm tra device_type & status
Tra DB xác nhận:
- Gateway phải có `device_type = 'gateway'` và `status = 'active'`
- Sensor phải có `device_type = 'sensor'` và `status = 'active'`

Sai bất kỳ → **drop**.

### Bước 5 — Insert vào DB
```sql
INSERT INTO sensor_data (device_id, gateway_id, payload)
VALUES (sensor.id, gateway.id, '{"temperature":28.5,"humidity":65.2}')
```

Sau đó **xóa bớt**, chỉ giữ **150 bản ghi gần nhất** mỗi sensor:
```sql
DELETE FROM sensor_data WHERE device_id = ? AND id NOT IN (
  SELECT id FROM (...ORDER BY id DESC LIMIT 150)
)
```

### Bước 6 — Cập nhật last_seen & last_ip
```sql
UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?
```
Cập nhật cho cả **gateway** lẫn **sensor**.

### Bước 7 — Ghi audit log
```
DATA_RECV: { gateway_id, sensor_id, data_id, source: "mqtt" }
```

### Bonus — mqttTracker (chạy song song)
Subscribe `$SYS/broker/log/N` → đọc log Mosquitto khi có client mới kết nối → tự động cập nhật `last_ip` cho gateway/sensor theo IP thực từ TCP connection.

---

## Tổng quan luồng hoàn chỉnh

```
Sensor-1 ──▶ ┐
              Broker 1 (port 1883) ──▶ Gateway
Sensor-2 ──▶ ┘    local/sensors/+/data
                                       │
                               [Verify HMAC sensor]
                               [Kiểm tra registry]
                               [Kiểm tra timestamp]
                               [Ký HMAC gateway]
                                       │
                                       ▼
                               Broker 2 (port 1884) ──▶ Backend
                                   gateway/+/data
                                                          │
                                                  [Verify HMAC gateway]
                                                  [Verify HMAC sensor]
                                                  [Kiểm tra status DB]
                                                  [Insert sensor_data]
                                                  [Cập nhật last_seen]
                                                  [Ghi audit log]
```
