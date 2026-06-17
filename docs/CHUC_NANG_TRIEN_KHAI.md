# Những Chức Năng Đã Triển Khai

**Dự án:** Hệ thống quản lý thiết bị IoT và phân quyền truy cập  
**Ngày cập nhật:** 2026-06-17  
**Người viết:** Nguyễn Hoàng Đạt  

---

## 1. Tổng quan hệ thống

Hệ thống là một nền tảng IoT đầy đủ (full-stack) cho phép:

- Thu thập dữ liệu cảm biến từ các thiết bị ESP32 thông qua giao thức MQTT
- Xác thực nguồn gốc dữ liệu bằng cơ chế HMAC hai lớp (two-layer HMAC)
- Lưu trữ và quản lý dữ liệu trên MySQL 8.0
- Hiển thị trạng thái thiết bị và biểu đồ cảm biến theo thời gian thực trên Dashboard Next.js
- Phân quyền truy cập theo vai trò (Role-Based Access Control — RBAC) với 3 cấp: `admin`, `operator`, `viewer`

Toàn bộ hạ tầng được đóng gói bằng Docker Compose với 6 service (`docker-compose.yml`), bao gồm 2 MQTT broker độc lập.

---

## 2. Kiến trúc hệ thống đã xây dựng

### 2.1. Sơ đồ luồng dữ liệu tổng thể

```
[ESP32 Sensor Node]
    │  MQTT publish: local/sensors/{sensor_id}/data
    │  Payload: { sensor_id, sn_timestamp, sn_hmac, sensor_ip, data:{temperature,humidity} }
    ▼
[MQTT Broker 1 — Eclipse Mosquitto :1883]   ← Lớp Sensor ↔ Gateway
    │
    │  (wildcard subscribe: local/sensors/+/data)
    ▼
[ESP32 Gateway Node]
    │  1. Parse JSON từ sensor
    │  2. Tra cứu sensor trong registry (KNOWN_SENSORS[] + HTTP /api/device/sensors)
    │  3. Verify sn_hmac cục bộ (HMAC#1)
    │  4. Tính gw_hmac = HMAC(GW_SECRET, gw_id:gw_ts)
    │  5. Build payload lồng ghép (sensor_payload)
    │  MQTT publish: gateway/{gw_id}/data → Broker 2 :1884
    ▼
[MQTT Broker 2 — Eclipse Mosquitto :1884]   ← Lớp Gateway → Backend
    │
    │  (Backend subscribe: gateway/+/data)
    ▼
[Backend Express – port 5000]   ← mqttDataService.ts
    │  Level 1: Verify gw_hmac  (lookup GW secret từ DB)
    │  Level 2: Verify sn_hmac  (lookup SN secret từ DB)
    │  INSERT sensor_data, UPDATE last_seen, ghi audit_log
    ▼
[MySQL 8.0] ── port 3308 (host) / 3306 (container)
    │
    ▼
[Nginx] ── port 80
    │  /api/* → backend:5000
    │  /*     → frontend:3000
    ▼
[Next.js Dashboard – port 3000]
    SWR polling 10s → hiển thị trạng thái và dữ liệu cảm biến
```

### 2.2. Các Docker service (`docker-compose.yml`)

| Container | Image | Port host:container | Vai trò |
|-----------|-------|---------------------|---------|
| `iot-mysql` | mysql:8.0 | 3308:3306 | Cơ sở dữ liệu |
| `iot-mqtt-broker-1` | eclipse-mosquitto:2 | 1883:1883 | MQTT Broker 1 — Sensor ↔ Gateway |
| `iot-mqtt-broker-2` | eclipse-mosquitto:2 | 1884:1883 | MQTT Broker 2 — Gateway → Backend |
| `iot-nginx` | nginx:alpine | 80:80 | Reverse proxy (single entry point) |
| `iot-backend` | build từ `backend/Dockerfile.dev` | 5000:5000 | API server |
| `iot-frontend` | build từ `frontend/Dockerfile.dev` | 3000:3000 | Dashboard |

### 2.3. Stack công nghệ đã sử dụng

| Lớp | Công nghệ | Ghi chú |
|-----|-----------|---------|
| Firmware | C++/Arduino (PlatformIO), esp32doit-devkit-v1 | Cả Sensor Node và Gateway Node |
| Hardware | ESP32 DOIT DevKit V1 (cả 2 board) | — |
| Cảm biến | DHT22 (1-Wire protocol, GPIO4) | NOT I2C |
| Protocol | MQTT (Eclipse Mosquitto 2) | Luồng chính; HTTP là fallback |
| Backend | Node.js + Express + TypeScript | — |
| Database | MySQL 8.0 | 5 bảng, tự động migrate khi khởi động |
| Frontend | Next.js 16 | SWR polling, Recharts |
| Container | Docker Compose | 6 service (2 MQTT broker độc lập) |
| Proxy | Nginx alpine | `/api/*` → backend, `/*` → frontend |

---

## 3. Các chức năng đã làm theo yêu cầu

### 3.1. IoT Device / Thiết bị

#### 3.1.1. Sensor Node (`firmware/sensor-node/`)

**Đã triển khai đầy đủ.**

- **Đọc dữ liệu cảm biến DHT22:** GPIO4 (1-Wire), đọc nhiệt độ và độ ẩm mỗi 5 giây (`SEND_INTERVAL 5000` trong `firmware/sensor-node/include/config.h`).
- **Kết nối WiFi và tự duy trì:** `wifiSetup()` + `wifiMaintain()` trong vòng lặp chính (`firmware/sensor-node/src/main.cpp`).
- **Đồng bộ thời gian NTP:** `ntpSetup()` lấy UTC để tính timestamp chống replay attack.
- **Ký HMAC trước khi gửi:**
  - Công thức: `HMAC-SHA256(SECRET_KEY, "device_id:unix_timestamp")`
  - Triển khai tại `firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp` hàm `mqttPublishSensorData()`
- **Publish MQTT lên topic `local/sensors/{DEVICE_ID}/data`** với payload:
  ```json
  {
    "sensor_id": "ESP32-SN-XXXXXXXX",
    "sn_timestamp": 1748000000,
    "sn_hmac": "abcdef...",
    "sensor_ip": "192.168.x.x",
    "data": {
      "temperature": 28.5,
      "humidity": 65.2
    }
  }
  ```
- **Blink LED** để báo hiệu trạng thái gửi dữ liệu.
- **Cấu hình thiết bị:** `firmware/sensor-node/include/config.h` (DEVICE_ID, SECRET_KEY, WIFI_SSID, WIFI_PASS, MQTT_HOST, MQTT_PORT, DHT_PIN, SEND_INTERVAL).

#### 3.1.2. Gateway Node (`firmware/gateway-node/`)

**Đã triển khai đầy đủ.**

- **Subscribe MQTT topic `local/sensors/+/data`:** Nhận toàn bộ dữ liệu từ các sensor trong mạng nội bộ.
- **Lấy danh sách sensor hợp lệ qua HTTP mỗi 5 phút:**
  - `GET /api/device/sensors` với HMAC xác thực gateway
  - Lưu vào registry nội bộ (`SENSOR_REGISTRY_TTL_MS 300000`)
  - Triển khai tại `firmware/gateway-node/src/main.cpp` hàm `fetchSensorList()`
- **Xác thực sensor (HMAC lớp 1):**
  - Tra cứu sensor trong `KNOWN_SENSORS[]` và registry động
  - So sánh `sn_hmac` với giá trị tính lại từ secret_key của sensor
  - Constant-time compare bằng `safeEq64()` chống timing attack (`firmware/gateway-node/lib/forwarder/forwarder.cpp`)
  - Kiểm tra `|sn_timestamp - now| <= TIMESTAMP_WINDOW_SEC (300s)` chống replay attack
- **Ký HMAC gateway (HMAC lớp 2):**
  - `gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "gw_device_id:gw_timestamp")`
- **Build payload lồng ghép và publish lên `gateway/{GW_DEVICE_ID}/data`:**
  ```json
  {
    "gw_device_id": "ESP32-GW-XXXXXXXX",
    "gw_timestamp": 1748000001,
    "gw_hmac": "xyz...",
    "sensor_payload": {
      "sensor_id": "ESP32-SN-XXXXXXXX",
      "sn_timestamp": 1748000000,
      "sn_hmac": "abcdef...",
      "sensor_ip": "192.168.x.x",
      "data": { "temperature": 28.5, "humidity": 65.2 }
    }
  }
  ```
- **Cấu hình thiết bị:** `firmware/gateway-node/include/config_gw.h` (GW_DEVICE_ID, GW_SECRET_KEY, MQTT_HOST, BACKEND_SENSORS_URL, GATEWAY_DATA_TOPIC, SENSOR_REGISTRY_TTL_MS, TIMESTAMP_WINDOW_SEC, KNOWN_SENSORS[]).

---

### 3.2. Backend Server (`backend/`)

#### 3.2.1. Cấu hình và bảo mật ứng dụng (`backend/src/app.ts`)

**Đã triển khai đầy đủ.**

- **Helmet:** Thiết lập HTTP security headers.
- **CORS:** Giới hạn origin từ `FRONTEND_URL` (mặc định `http://localhost`).
- **Body limit:** 10 KB cho JSON request body.
- **Rate limiting:**
  - Auth endpoints: 10 request / 15 phút (`authLimiter`)
  - Device data endpoint: 60 request / phút (`deviceDataLimiter`)
  - API chung: 100 request / 15 phút (`apiLimiter`)

#### 3.2.2. MQTT Data Service (`backend/src/services/mqttDataService.ts`)

**Đây là luồng chính nhận dữ liệu từ thiết bị. Đã triển khai đầy đủ.**

- Subscribe MQTT topic `gateway/+/data` qua Mosquitto Broker.
- **Xác thực HMAC lớp 1 (Gateway):** Lookup `secret_key` của gateway từ DB, tính lại và so sánh `gw_hmac` bằng `crypto.timingSafeEqual()`.
- **Xác thực HMAC lớp 2 (Sensor):** Lookup `secret_key` của sensor từ DB, tính lại và so sánh `sn_hmac`.
- Kiểm tra `device_type` của cả gateway và sensor trong DB.
- Kiểm tra `status` thiết bị: `active` mới được phép gửi dữ liệu.
- **INSERT vào `sensor_data`:** Lưu payload đầy đủ.
- **Giới hạn 150 bản ghi:** Tự động xóa bản ghi cũ nhất khi vượt quá.
- **UPDATE `last_seen`** của sensor: Dùng để tính trạng thái online/offline.
- **Reset `fail_count = 0`** sau khi xác thực thành công.
- **Ghi `audit_log`** event `DATA_RECV`.

#### 3.2.3. HMAC Service (`backend/src/services/hmacService.ts`)

**Đã triển khai đầy đủ.**

- `TIMESTAMP_WINDOW_SECONDS = 300`: Cửa sổ ±300 giây để chống replay attack.
- `computeHMAC()`: Tính HMAC-SHA256.
- `safeCompare()`: So sánh bằng `crypto.timingSafeEqual()` chống timing attack.
- `verifyGatewayHMAC()` và `verifyDeviceHMAC()`: Xác thực HMAC cho từng lớp.

#### 3.2.4. Middleware xác thực thiết bị (`backend/src/middleware/validateDevice.ts`)

**Đã triển khai — dùng cho HTTP fallback endpoint `POST /api/device/data`.**

- Logic HMAC 2 lớp tương tự MQTT service.
- **`incrementFailCount()`:** Tăng `fail_count` khi xác thực thất bại.
- **Block thiết bị** khi `fail_count >= 5`: Cập nhật `status = 'blocked'`, ghi `audit_log` event `DEVICE_BLOCKED`.

#### 3.2.5. Authentication (`backend/src/routes/auth.ts`)

**Đã triển khai đầy đủ.**

- `POST /api/auth/login`:
  - Tra cứu user trong DB, so sánh mật khẩu bằng `bcrypt.compare()`.
  - Ký JWT với `JWT_SECRET`, thời hạn 8 giờ.
  - Set cookie `token` với `HttpOnly`, `SameSite=Strict`.
  - Cập nhật `last_login` trong DB.
- `POST /api/auth/logout`: Xóa cookie `token`.
- `GET /api/auth/me`: Xác thực JWT, trả về thông tin user hiện tại.

#### 3.2.6. Quản lý thiết bị (`backend/src/routes/devices.ts`)

**Đã triển khai đầy đủ.**

- `POST /api/devices/register`:
  - Tự động sinh `device_id`: format `ESP32-SN-XXXXXXXX` (sensor) hoặc `ESP32-GW-XXXXXXXX` (gateway), 8 ký tự hex ngẫu nhiên.
  - Tự động sinh `secret_key`: 32 bytes ngẫu nhiên, encode hex (64 ký tự).
  - `status` mặc định: `inactive`.
- `GET /api/devices`: Lấy danh sách thiết bị, tính `is_online` bằng `TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`.
- `GET /api/devices/:id`: Chi tiết một thiết bị.
- `GET /api/devices/:id/data`: Dữ liệu cảm biến có phân trang (paginated).
- `PATCH /api/devices/:id/status`: Cập nhật trạng thái (`inactive` / `active` / `blocked`). Khi set `active` thì reset `fail_count = 0`.
- `DELETE /api/devices/:id`: Xóa thiết bị (cascade xóa `sensor_data`, `audit_log` liên quan).

#### 3.2.7. Dashboard Stats (`backend/src/routes/dashboard.ts`)

**Đã triển khai đầy đủ.**

- `GET /api/dashboard/stats`: Trả về:
  - `total_gateway`, `total_sensor`
  - `gateway_online`, `sensor_online` (dựa trên `last_seen < 60 giây`)
  - `total_data_points` (tổng bản ghi trong `sensor_data`)

#### 3.2.8. Danh sách sensor cho Gateway (`backend/src/routes/`)

**Đã triển khai — endpoint `GET /api/device/sensors`.**

- Trả về danh sách sensor đang `active` trong DB.
- Yêu cầu HMAC xác thực từ Gateway trước khi trả về.
- Gateway gọi endpoint này mỗi 5 phút để cập nhật registry cục bộ.

#### 3.2.9. Quản lý người dùng (`backend/src/routes/users.ts`)

**Đã triển khai đầy đủ — chỉ admin mới có quyền.**

- `GET /api/users`: Lấy danh sách user.
- `POST /api/users`: Tạo user mới (chỉ được tạo role `operator` hoặc `viewer`).
- `PATCH /api/users/:id/password`: Đổi mật khẩu.
- `DELETE /api/users/:id`: Xóa user. Giới hạn: không thể xóa chính mình và không thể xóa tài khoản `admin`.

#### 3.2.10. Audit Log (`backend/src/routes/audit.ts`)

**Đã triển khai đầy đủ.**

- `GET /api/audit-log`: Lọc theo `event_type`, `device_id`, `from`, `to`; giới hạn tối đa 500 bản ghi.
- `DELETE /api/audit-log/data-recv`: Xóa toàn bộ event `DATA_RECV` (chỉ admin và operator).

#### 3.2.11. HTTP Fallback Endpoint

**Đã triển khai một phần — tồn tại nhưng KHÔNG phải luồng chính.**

- `POST /api/device/data` (`backend/src/routes/data.routes.ts`): Nhận dữ liệu qua HTTP thay vì MQTT.
- Sử dụng `validateDevice` middleware với logic HMAC 2 lớp tương tự.
- **Lưu ý:** Luồng chính của hệ thống đi qua MQTT (`mqttDataService.ts`). HTTP endpoint này là fallback dự phòng.

---

### 3.3. Database (`database/migrations/001_schema.sql`)

**Đã triển khai đầy đủ — 5 bảng.**

#### Bảng `users`
- Cột: `id`, `username` (UNIQUE), `password_hash` (bcrypt), `role` (ENUM: admin/operator/viewer), `created_at`, `last_login`.
- Seed mặc định: `admin` / `admin123` (bcrypt hash).

#### Bảng `devices`
- Cột: `id`, `device_id` (UNIQUE), `device_name`, `device_type` (ENUM: sensor/gateway), `secret_key`, `location`, `status` (ENUM: inactive/active/blocked), `fail_count`, `last_seen`, `last_ip`, `created_at`.
- `status` lifecycle: `inactive` → `active` → `blocked` (auto khi `fail_count >= 5`).
- `is_online`: Tính toán runtime bằng `TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`, KHÔNG lưu vào DB.

#### Bảng `sensor_data`
- Cột: `id`, `device_id` (FK → devices.id), `payload` (JSON), `received_at`.
- Giới hạn 150 bản ghi / sensor: Auto-cleanup trong `mqttDataService.ts`.

#### Bảng `device_tokens`
**Đã triển khai một phần — schema tồn tại nhưng CHƯA được dùng bởi bất kỳ route nào.**

- Schema: `id`, `device_id` (FK), `token_hash`, `expires_at`, `created_at`.
- Được dự kiến cho cơ chế xác thực dài hạn (session token cho thiết bị), nhưng backend chưa có route nào đọc/ghi bảng này.

#### Bảng `audit_log`
- Cột: `id`, `event_type`, `device_id` (text, không FK), `ip_address`, `details` (JSON), `created_at`.
- Event types tự động ghi: `DATA_RECV`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`.

---

### 3.4. Dashboard Frontend (`frontend/`)

#### 3.4.1. Trang Dashboard (`frontend/src/containers/Dashboard/index.tsx`)

**Đã triển khai đầy đủ.**

- 4 stats card: Total Gateway, Total Sensor, Gateway Online, Sensor Online.
- Health Overview panel: Tổng quan trạng thái hệ thống.
- Security Preview panel: Xem trước các sự kiện bảo mật.
- Dữ liệu từ `GET /api/dashboard/stats`, tự refresh theo SWR.

#### 3.4.2. Trang Devices (`frontend/src/containers/Devices/index.tsx`)

**Đã triển khai đầy đủ.**

- Tab phân loại: Gateway / Sensor.
- Bảng hiển thị: Device ID, Name, Type, Location, Status, Connection (Online/Offline), Last Seen, Actions.
- Actions: View (chi tiết), Activate (kích hoạt), Lock (khóa), Unlock (mở khóa), Delete (xóa).
- SWR polling mỗi 10 giây (`frontend/src/package/features/useDeviceList.ts`, `refreshInterval: 10000`).
- Gọi `PATCH /api/devices/:id/status` và `DELETE /api/devices/:id`.

#### 3.4.3. Trang Device Detail (`frontend/src/containers/DeviceDetail/index.tsx`)

**Đã triển khai đầy đủ.**

- Info cards: Type, Status, Connection, Last Seen, Location, Fail Count, Device ID.
- **SensorChart** (chỉ hiển thị với sensor): Biểu đồ Recharts LineChart, dual Y-axis (nhiệt độ màu cam, độ ẩm màu xanh), filter theo khoảng thời gian 1h / 6h / 24h (`frontend/src/components/compound/device/SensorChart.tsx`).
- Bảng Recent Data: Hiển thị time, temperature, humidity, gateway.
- SWR polling mỗi 10 giây (`frontend/src/package/features/useSensorData.ts`, limit 200 bản ghi mới nhất).

#### 3.4.4. Trang Audit Log (`frontend/src/containers/Audit/index.tsx`)

**Đã triển khai đầy đủ.**

- Filter: `event_type` (dropdown), `device_id` (number input), `from`/`to` (datetime-local).
- Phân trang (pagination).
- Nút xóa DATA_RECV (chỉ hiện với admin/operator).

#### 3.4.5. Trang Users (`frontend/src/containers/Users/index.tsx`)

**Đã triển khai đầy đủ.**

- Form tạo user mới (chỉ role operator/viewer).
- Bảng user: Đổi mật khẩu, Xóa.
- Logic frontend: Không hiển thị nút xóa cho chính mình và cho tài khoản admin.

#### 3.4.6. Cơ chế realtime

**Đã triển khai bằng SWR polling — KHÔNG dùng WebSocket/Socket.io.**

- Tất cả các trang dùng `useSWR` với `refreshInterval: 10000` (10 giây).
- Không có WebSocket endpoint nào được triển khai trong hệ thống này.

---

## 4. Luồng hoạt động chính của hệ thống

### 4.1. Luồng đăng ký thiết bị

```
Người dùng (admin/operator)
    │  POST /api/devices/register
    │  Body: { device_name, device_type, location }
    ▼
Backend (devices.ts)
    │  1. Sinh device_id:  "ESP32-SN-" + 8 hex ngẫu nhiên
    │                   hoặc "ESP32-GW-" + 8 hex ngẫu nhiên
    │  2. Sinh secret_key: 32 bytes ngẫu nhiên → 64 ký tự hex
    │  3. status = 'inactive', fail_count = 0
    │  4. INSERT vào bảng devices
    ▼
Response: { device_id, secret_key }  ← secret_key CHỈ hiện 1 lần
    │
    ▼
Người dùng copy device_id + secret_key → nạp vào firmware
    │  firmware/sensor-node/include/config.h     (Sensor Node)
    │  firmware/gateway-node/include/config_gw.h  (Gateway Node)
    ▼
Người dùng kích hoạt thiết bị:
    PATCH /api/devices/:id/status → { status: "active" }
    (fail_count reset về 0)
```

### 4.2. Luồng xác thực thiết bị khi gửi dữ liệu

Xác thực xảy ra trong `backend/src/services/mqttDataService.ts` mỗi khi nhận MQTT message trên topic `gateway/+/data`:

```
MQTT message đến từ Gateway
    │
    ▼
[Level 1 — Xác thực Gateway]
    │  1. Parse gw_device_id từ topic
    │  2. Lookup secret_key của gateway trong DB (status phải là 'active')
    │  3. Kiểm tra |gw_timestamp - now| <= 300s (chống replay)
    │  4. Tính lại HMAC: HMAC-SHA256(gw_secret, "gw_device_id:gw_timestamp")
    │  5. So sánh với gw_hmac bằng crypto.timingSafeEqual()
    │     ↳ Fail → tăng fail_count, ghi GATEWAY_AUTH_FAIL → DEVICE_BLOCKED nếu >= 5
    │
    ▼
[Level 2 — Xác thực Sensor]
    │  1. Parse sensor_id từ sensor_payload
    │  2. Lookup secret_key của sensor trong DB (status phải là 'active')
    │  3. Kiểm tra |sn_timestamp - now| <= 300s
    │  4. Tính lại HMAC: HMAC-SHA256(sn_secret, "sensor_id:sn_timestamp")
    │  5. So sánh với sn_hmac bằng crypto.timingSafeEqual()
    │     ↳ Fail → tăng fail_count, ghi SENSOR_AUTH_FAIL → DEVICE_BLOCKED nếu >= 5
    │
    ▼
[Kiểm tra device_type]
    │  gateway.device_type phải là 'gateway'
    │  sensor.device_type phải là 'sensor'
    │     ↳ Không đúng → từ chối (chống privilege escalation)
    │
    ▼
[Lưu dữ liệu]
    │  INSERT INTO sensor_data (device_id, payload, received_at)
    │  UPDATE devices SET last_seen=NOW(), fail_count=0 WHERE id=sensor.id
    │  Cleanup nếu COUNT > 150: DELETE bản ghi cũ nhất
    │  INSERT INTO audit_log (event_type='DATA_RECV', ...)
```

### 4.3. Luồng gửi dữ liệu cảm biến

Chi tiết từng bước end-to-end mỗi 5 giây:

```
[Sensor Node — firmware/sensor-node/src/main.cpp]
    │  1. Đọc DHT22 (GPIO4): temperature, humidity
    │  2. Lấy unix timestamp từ NTP
    │  3. Tính sn_hmac = HMAC-SHA256(SECRET_KEY, "DEVICE_ID:timestamp")
    │  4. Build JSON payload (xem mẫu ở mục 3.1.1)
    │  5. mqttClient.publish("local/sensors/ESP32-SN-XXXX/data", payload) → Broker 1 :1883
    ▼
[MQTT Broker 1 — Mosquitto :1883]   ← Sensor ↔ Gateway layer
    ▼
[Gateway Node — firmware/gateway-node/lib/forwarder/forwarder.cpp]
    │  Callback onSensorMessage() được kích hoạt:
    │  1. Parse JSON
    │  2. Tra cứu sensor_id trong registry (KNOWN_SENSORS[] + fetchSensorList cache)
    │  3. Kiểm tra |sn_timestamp - now| <= 300s
    │  4. Tính lại sn_hmac từ sensor secret, so sánh bằng safeEq64()
    │  5. Tính gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "GW_ID:gw_timestamp")
    │  6. Build payload lồng ghép (sensor_payload)
    │  7. mqttClient.publish("gateway/ESP32-GW-XXXX/data", forwardedPayload) → Broker 2 :1884
    ▼
[MQTT Broker 2 — Mosquitto :1884]   ← Gateway → Backend layer
    ▼
[Backend mqttDataService.ts]
    │  (Xem luồng xác thực chi tiết ở mục 4.2)
    ▼
[MySQL — bảng sensor_data, devices, audit_log]
    ▼
[Frontend Dashboard]
    SWR polling 10s → fetch GET /api/devices/:id/data
    → Cập nhật biểu đồ SensorChart và bảng Recent Data
```

### 4.4. Luồng cập nhật trạng thái online/offline

**Không có cơ chế heartbeat riêng. Trạng thái online/offline được tính toán động.**

```
Mỗi lần DATA_RECV thành công:
    UPDATE devices SET last_seen = NOW() WHERE id = sensor.id
                                                (backend/src/services/mqttDataService.ts)

Mỗi khi Dashboard fetch GET /api/devices:
    SELECT *, TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60 AS is_online
    FROM devices
                                                (backend/src/routes/devices.ts)

Frontend hiển thị:
    is_online = true  → chấm xanh "Online"
    is_online = false → chấm đỏ "Offline"
    (refresh mỗi 10 giây qua SWR — frontend/src/package/features/useDeviceList.ts)
```

**Ngưỡng:** 60 giây. Sensor gửi mỗi 5 giây nên thiết bị đang chạy sẽ luôn trong trạng thái Online. Nếu mất kết nối, sau 60 giây sẽ hiển thị Offline.

---

## 5. Đối chiếu yêu cầu và kết quả

| # | Yêu cầu | Trạng thái | Ghi chú |
|---|---------|-----------|---------|
| 1 | Thu thập dữ liệu cảm biến từ ESP32 | Đã triển khai | DHT22/GPIO4, mỗi 5 giây |
| 2 | Gửi dữ liệu qua MQTT | Đã triển khai | Luồng 2 lớp: Sensor→Gateway→Backend |
| 3 | Xác thực HMAC-SHA256 | Đã triển khai | Hai lớp độc lập, constant-time compare |
| 4 | Chống replay attack | Đã triển khai | Timestamp window ±300s ở cả firmware và backend |
| 5 | Chống timing attack | Đã triển khai | `safeEq64()` firmware, `timingSafeEqual()` backend |
| 6 | Tự động block thiết bị sau 5 lần thất bại | Đã triển khai | `fail_count >= 5 → status = 'blocked'` |
| 7 | RBAC 3 vai trò (admin/operator/viewer) | Đã triển khai | JWT, kiểm tra role trên từng route |
| 8 | Dashboard quản lý thiết bị | Đã triển khai | Xem, kích hoạt, khóa, xóa, xem dữ liệu |
| 9 | Biểu đồ dữ liệu cảm biến theo thời gian thực | Đã triển khai | SWR 10s, Recharts, filter 1h/6h/24h |
| 10 | Trạng thái online/offline thiết bị | Đã triển khai | `TIMESTAMPDIFF < 60s`, refresh 10s |
| 11 | Audit log đầy đủ | Đã triển khai | 4 event types, filter, export |
| 12 | Đóng gói Docker Compose | Đã triển khai | 6 service (2 MQTT broker), Nginx entry point |
| 13 | Giới hạn lưu trữ dữ liệu (max 150/sensor) | Đã triển khai | Auto-cleanup trong `mqttDataService.ts` |
| 14 | Rate limiting API | Đã triển khai | 3 mức giới hạn khác nhau |
| 15 | Quản lý người dùng (CRUD) | Đã triển khai | Admin tạo/xóa/đổi mật khẩu |
| 16 | JWT HttpOnly cookie | Đã triển khai | SameSite=Strict, 8h expiry |
| 17 | Gateway tự động fetch danh sách sensor | Đã triển khai | Mỗi 5 phút qua HTTP HMAC |
| 18 | Session token thiết bị (`device_tokens`) | Đã triển khai một phần | Schema tồn tại, chưa có route sử dụng |
| 19 | Realtime qua WebSocket/Socket.io | Chưa triển khai | Chỉ dùng SWR polling 10s |
| 20 | TLS/MQTT over SSL | Chưa triển khai | Mosquitto cấu hình không có TLS |
| 21 | HTTP fallback endpoint (`POST /api/device/data`) | Đã triển khai một phần | Tồn tại và có HMAC validation; không phải luồng chính |

---

## 6. Những phần có thể triển khai tiếp

Dựa trên cấu trúc hiện tại của hệ thống, các phần sau đây có thể được bổ sung mà không cần thay đổi kiến trúc lõi:

### 6.1. Device Token (`device_tokens` table)
- Schema (`database/migrations/001_schema.sql`) đã có bảng `device_tokens`.
- Cần bổ sung: route `POST /api/device/token` để cấp token, middleware verify token, cơ chế revoke.
- Mục đích: Cho phép thiết bị xác thực bằng long-lived token thay vì HMAC per-request.

### 6.2. MQTT TLS/SSL
- Hiện tại cả 2 broker chạy plain TCP: Broker 1 (`mosquitto/broker1/mosquitto.conf` :1883) và Broker 2 (`mosquitto/broker2/mosquitto.conf` :1884).
- Cần bổ sung: Cấu hình TLS cert trong cả 2 file mosquitto.conf, cập nhật firmware để dùng WiFiClientSecure.

### 6.3. Realtime WebSocket
- Frontend hiện dùng SWR polling 10 giây. Có thể nâng cấp lên WebSocket (Socket.io hoặc ws native) để giảm latency.
- Nginx (`nginx/nginx.conf`) đã có `proxy_set_header Upgrade $http_upgrade` cho WebSocket (hiện chỉ dùng cho Next.js HMR).

### 6.4. Hỗ trợ nhiều loại cảm biến
- Firmware sensor-node hiện chỉ đọc DHT22 (nhiệt độ + độ ẩm).
- Cơ chế `data: {}` trong payload đã generic, có thể thêm các trường cảm biến khác (CO2, áp suất, ánh sáng) mà không cần thay đổi schema DB (`payload` là JSON).

### 6.5. Cảnh báo ngưỡng (Threshold Alert)
- Chưa có cơ chế gửi cảnh báo khi nhiệt độ/độ ẩm vượt ngưỡng.
- Có thể thêm bảng `alert_rules` và notification service (email/webhook) trong backend.

### 6.6. Export dữ liệu
- Chưa có tính năng export CSV/Excel từ dashboard.

### 6.7. Refresh token
- JWT hiện không có refresh token. Sau 8 giờ, người dùng phải đăng nhập lại.

---

## 7. Kết luận

Hệ thống đã hoàn thiện đầy đủ các thành phần cốt lõi của một nền tảng IoT có bảo mật:

**Điểm mạnh đã triển khai:**
- Cơ chế bảo mật HMAC hai lớp với constant-time comparison chống các tấn công phổ biến (replay, timing, spoofing, brute force).
- Kiến trúc MQTT hai giai đoạn (Sensor→Gateway→Backend) đảm bảo không thiết bị nào trực tiếp truy cập backend, tạo lớp cách ly quan trọng.
- Full-stack từ firmware C++ đến database đến dashboard đều đồng bộ cùng một định nghĩa payload và cùng logic xác thực.
- Docker Compose với Nginx single entry point cho phép deploy dễ dàng trên một máy chủ duy nhất.

**Điểm cần lưu ý:**
- `device_tokens` table tồn tại nhưng chưa được backend sử dụng.
- MQTT chưa có TLS — phù hợp cho môi trường LAN nội bộ nhưng cần bổ sung nếu deploy trên mạng public.
- Realtime dashboard dùng polling 10 giây, không phải WebSocket; đây là lựa chọn đơn giản nhưng hoạt động đúng với yêu cầu hiện tại.

Hệ thống hiện tại đủ để chạy thực tế trong môi trường phòng lab hoặc mạng LAN nội bộ, với dữ liệu cảm biến DHT22 (nhiệt độ, độ ẩm) từ một hoặc nhiều Sensor Node qua một Gateway Node.
