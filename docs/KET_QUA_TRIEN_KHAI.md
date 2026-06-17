# Kết quả triển khai hệ thống IoT

**Tên đề tài:** Hệ thống quản lý thiết bị IoT và phân quyền truy cập  
**Ngày cập nhật:** 2026-06-17

---

## Mục tiêu

> **Xây dựng hệ thống IoT có chức năng quản lý danh tính thiết bị, xác thực thiết bị khi kết nối và kiểm soát quyền truy cập cơ bản, đảm bảo chỉ các thiết bị hợp lệ mới được phép gửi dữ liệu và truy cập tài nguyên của hệ thống.**

Mục tiêu được triển khai thành một hệ thống đầy đủ (full-stack) gồm bốn lớp kỹ thuật hoàn chỉnh: **firmware nhúng → giao thức MQTT → backend API → dashboard web**, với dữ liệu thực tế từ cảm biến DHT22 trên phần cứng ESP32.

---

## 1. Kiến trúc hệ thống đã xây dựng

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP THIẾT BỊ (Firmware C++/Arduino)                                        │
│                                                                              │
│   [ESP32 Sensor Node]                    [ESP32 Gateway Node]                │
│   ┌──────────────────┐                  ┌──────────────────────────┐         │
│   │ Đọc DHT22 (GPIO4)│                  │ Subscribe Broker 1 :1883 │         │
│   │ Tính sn_hmac     │                  │ Verify sensor HMAC       │         │
│   │ (mbedTLS SHA256) │ ─MQTT :1883─────►│ Kiểm tra timestamp ±300s │         │
│   │ Publish MQTT     │ local/sensors/   │ safeEq64() constant-time │         │
│   │ → Broker 1 :1883 │   /+/data        │ Ký gw_hmac               │         │
│   └──────────────────┘                  │ Publish → Broker 2 :1884 │         │
│                                         └──────────────────────────┘         │
└──────────────────────────────────────────────────┬──────────────────────────┘
                                                   │ MQTT gateway/{id}/data
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  LỚP HẠ TẦNG (Docker Compose — 6 services)                                      │
│                                                                                 │
│  [Mosquitto Broker 1 :1883]  ◄──── Sensor publish local/sensors/+/data ──────   │
│         │ subscribe wildcard                                                    │
│         │ → Gateway Node nhận                                                   │
│                                                                                 │
│  [Mosquitto Broker 2 :1884]  ◄──── Gateway publish gateway/+/data ───────────   │
│         │ subscribe gateway/+/data                                              │
│         ▼                                                                       │
│  [Nginx :80]  ──/api/*──►  [Backend Express :5000]  ──►  [MySQL :3306]         │
│               ──/*──────►  [Next.js Frontend :3000]                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LỚP GIAO DIỆN (Next.js Dashboard)                                           │
│                                                                              │
│  [Trang Login] → [Dashboard] → [Devices] → [DeviceDetail] → [Audit] → [Users]│
│                  SWR polling 10s, JWT HttpOnly cookie                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hạ tầng Docker Compose (`docker-compose.yml`)

| Container | Image | Port | Vai trò |
|-----------|-------|------|---------|
| `iot-mysql` | mysql:8.0 | 3308:3306 | Cơ sở dữ liệu |
| `iot-mqtt-broker-1` | eclipse-mosquitto:2 | 1883:1883 | MQTT Broker 1 — Sensor ↔ Gateway |
| `iot-mqtt-broker-2` | eclipse-mosquitto:2 | 1884:1883 | MQTT Broker 2 — Gateway → Backend |
| `iot-nginx` | nginx:alpine | 80:80 | Reverse proxy — single entry point |
| `iot-backend` | build `backend/Dockerfile.dev` | 5000:5000 | API server Node.js |
| `iot-frontend` | build `frontend/Dockerfile.dev` | 3000:3000 | Dashboard Next.js 16 |

---

## 2. Quản lý danh tính thiết bị

### 2.1. Định danh duy nhất bằng `device_id`

Mỗi thiết bị được cấp một `device_id` có cấu trúc nhất quán theo loại, sinh tự động bằng `crypto.randomBytes` khi đăng ký qua dashboard (`backend/src/routes/devices.ts`):

```
ESP32-SN-XXXXXXXX  →  Sensor Node   (VD: ESP32-SN-CBF05770)
ESP32-GW-XXXXXXXX  →  Gateway Node  (VD: ESP32-GW-78867B14)
```

`device_id` được lưu với ràng buộc `UNIQUE KEY` trong database — đảm bảo không thể có hai thiết bị cùng ID.

`device_id` được nạp cố định vào firmware dưới dạng `#define` sau khi đăng ký:
- Sensor: `firmware/sensor-node/include/config.h` → `#define DEVICE_ID "ESP32-SN-CBF05770"`
- Gateway: `firmware/gateway-node/include/config_gw.h` → `#define GW_DEVICE_ID "ESP32-GW-78867B14"`

### 2.2. Khóa bí mật `secret_key`

Mỗi thiết bị có một `secret_key` riêng biệt, 32 bytes ngẫu nhiên (64 ký tự hex):

```typescript
// backend/src/routes/devices.ts
const secret_key = crypto.randomBytes(32).toString("hex");
```

`secret_key` được **trả về đúng một lần** khi đăng ký và không có endpoint nào cho phép truy xuất lại. Thiết bị dùng `secret_key` để tính HMAC chứ không gửi `secret_key` trực tiếp qua mạng tại bất kỳ thời điểm nào sau đó.

### 2.3. Phân loại thiết bị bằng `device_type`

```sql
-- database/migrations/001_schema.sql
device_type ENUM('sensor','gateway') NOT NULL
```

Hệ thống phân biệt rõ ràng hai loại:
- **`sensor`**: Thu thập và gửi dữ liệu cảm biến
- **`gateway`**: Xác thực sensor, ký lại và chuyển tiếp lên backend

`device_type` được kiểm tra ở cả Gateway firmware (sensor whitelist) lẫn backend (RBAC thiết bị) — ngăn chặn thiết bị đóng giả sai vai trò.

### 2.4. Vòng đời trạng thái thiết bị

```
inactive  ──[admin/operator kích hoạt]──►  active  ──[5 lần xác thực sai]──►  blocked
   │                                          │                                     │
   │  Mặc định khi đăng ký                   │  Được phép gửi dữ liệu             │
   │  Không được phép gửi dữ liệu            │  last_seen được cập nhật            │
   │                                          │  fail_count = 0 khi thành công      │
   └──────────────────────────────────────────┘                                     │
         [admin/operator mở khóa + reset fail_count]  ◄──────────────────────────┘
```

Chuyển trạng thái được ghi nhận vào `audit_log` với event `DEVICE_STATUS_CHANGE`, bao gồm tên người thực hiện và timestamp.

### 2.5. Cơ sở dữ liệu định danh thiết bị

Bảng `devices` trong `database/migrations/001_schema.sql`:

| Trường | Kiểu | Ý nghĩa bảo mật |
|--------|------|-----------------|
| `device_id` | VARCHAR(64) UNIQUE | Định danh không trùng lặp |
| `device_type` | ENUM | Phân loại vai trò thiết bị |
| `secret_key` | VARCHAR(64) | Khóa HMAC — lưu plain text (cần thiết cho HMAC) |
| `status` | ENUM | Kiểm soát quyền gửi dữ liệu |
| `fail_count` | TINYINT | Theo dõi thử xác thực thất bại |
| `last_seen` | DATETIME | Tính trạng thái online/offline (< 60s) |
| `last_ip` | VARCHAR(45) | IP gần nhất của thiết bị |
| `created_by` | INT FK | Ai đã đăng ký thiết bị |

---

## 3. Xác thực thiết bị khi kết nối và gửi dữ liệu

Hệ thống triển khai xác thực **HMAC-SHA256 hai lớp độc lập** xuyên suốt từ firmware đến backend. Thiết bị không bao giờ gửi `secret_key` — chỉ gửi chữ ký HMAC của nó.

### 3.1. Công thức HMAC (đồng nhất toàn hệ thống)

```
HMAC-SHA256(secret_key,  "device_id:unix_timestamp_giây")
```

Cùng một công thức được triển khai độc lập ở:
- Firmware (C++/mbedTLS): `firmware/sensor-node/lib/hmac_util/hmac_util.cpp`, `firmware/gateway-node/lib/hmac_util/hmac_util.cpp`
- Backend (Node.js/crypto): `backend/src/services/hmacService.ts`

### 3.2. Lớp xác thực 1 — Sensor Node ký dữ liệu (Firmware)

Trước mỗi lần gửi dữ liệu, Sensor Node tính HMAC và nhúng vào payload MQTT (`firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp`):

```cpp
unsigned long timestamp = getCurrentTimestamp();  // NTP timestamp
String message = String(DEVICE_ID) + ":" + String(timestamp);
String hmac    = computeHMAC(String(SECRET_KEY), message);  // mbedTLS SHA256

// Payload MQTT lên topic "local/sensors/{DEVICE_ID}/data":
{
  "sensor_id":    "ESP32-SN-CBF05770",
  "sn_timestamp": 1748000000,
  "sn_hmac":      "a3f9c2...",     ← chữ ký HMAC
  "sensor_ip":    "192.168.x.x",
  "data": { "temperature": 28.5, "humidity": 65.2 }
}
```

**Điều kiện bắt buộc trước khi gửi** (kiểm tra tại `firmware/sensor-node/src/main.cpp`):
- WiFi đã kết nối
- NTP đã đồng bộ — nếu chưa, bỏ qua (timestamp sai sẽ tạo HMAC không hợp lệ)
- MQTT đã kết nối broker
- DHT22 đọc dữ liệu hợp lệ (không NaN)

### 3.3. Lớp xác thực 2 — Gateway xác thực Sensor (Firmware)

Gateway Node nhận MQTT từ Sensor, xác thực trước khi forward (`firmware/gateway-node/lib/forwarder/forwarder.cpp`):

```
Bước 1: Tra sensor_id trong sensor registry
        → Registry động (fetch từ /api/device/sensors, TTL 5 phút)
        → Fallback KNOWN_SENSORS[] trong config_gw.h
        → Nếu không tìm thấy: REJECT, không forward

Bước 2: Kiểm tra |sn_timestamp - now| <= 300s
        → Vượt cửa sổ: REJECT (chống replay attack)

Bước 3: Tính lại sn_hmac từ secret của sensor
        Đối chiếu bằng safeEq64() — constant-time comparison
        → HMAC sai: REJECT

Bước 4: Ký gateway HMAC
        gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "GW_ID:gw_timestamp")

Bước 5: Build payload lồng ghép và publish:
        topic: gateway/ESP32-GW-78867B14/data
        {
          "gateway_id": "ESP32-GW-78867B14",
          "gw_timestamp": ..., "gw_hmac": "...",
          "sensor_payload": {  ← sensor data được bảo toàn nguyên vẹn
            "sensor_id": "ESP32-SN-CBF05770",
            "sn_timestamp": ..., "sn_hmac": "...",
            "data": { "temperature": 28.5, "humidity": 65.2 }
          }
        }
```

**Constant-time comparison** (`safeEq64` trong `forwarder.cpp`):
```cpp
static bool safeEq64(const char* a, const char* b) {
    uint8_t diff = 0;
    for (int i = 0; i < 64; i++) diff |= (uint8_t)(a[i] ^ b[i]);
    return diff == 0;  // luôn 64 vòng, bất kể kết quả
}
```

### 3.4. Lớp xác thực 3 — Backend xác thực cả hai (Server)

Backend subscribe MQTT topic `gateway/+/data`, xử lý trong `backend/src/services/mqttDataService.ts`:

```
Level 1 — Xác thực Gateway:
  ① Lookup secret_key của gateway_id trong DB
  ② |gw_timestamp - now| <= 300s
  ③ Tính lại expected_hmac = HMAC(gw_secret, "gw_id:gw_timestamp")
  ④ crypto.timingSafeEqual(expected, gw_hmac)
  ✗ Fail → log GATEWAY_AUTH_FAIL, tăng fail_count, block nếu >= 5

Level 2 — Xác thực Sensor (độc lập với Level 1):
  ① Lookup secret_key của sensor_id trong DB
  ② |sn_timestamp - now| <= 300s
  ③ Tính lại expected_hmac = HMAC(sn_secret, "sn_id:sn_timestamp")
  ④ crypto.timingSafeEqual(expected, sn_hmac)
  ✗ Fail → log SENSOR_AUTH_FAIL, tăng fail_count, block nếu >= 5

Kiểm tra device_type:
  gateway.device_type phải là 'gateway' → chống thiết bị đóng giả
  sensor.device_type  phải là 'sensor'

Kiểm tra status:
  Cả hai phải là 'active' → 'inactive' và 'blocked' đều bị từ chối
```

### 3.5. Điểm kiểm tra timestamp theo chiều sâu

Cùng một cửa sổ **±300 giây** được kiểm tra tại **ba điểm độc lập**:

| Điểm | Vị trí | Timestamp kiểm tra |
|------|--------|-------------------|
| Gateway firmware | `forwarder.cpp` | `sn_timestamp` của Sensor |
| Backend Level 1 | `hmacService.ts` | `gw_timestamp` của Gateway |
| Backend Level 2 | `hmacService.ts` | `sn_timestamp` của Sensor (lần 2) |

Kẻ tấn công bắt được MQTT message hợp lệ phải phát lại trong vòng 300 giây — sau đó bị từ chối ở cả ba điểm.

---

## 4. Kiểm soát quyền truy cập thiết bị

### 4.1. Chỉ thiết bị được đăng ký và kích hoạt mới được phép gửi dữ liệu

```
Thiết bị chưa đăng ký    → DB lookup NOT_FOUND   → 401 GATEWAY_AUTH_FAIL
Thiết bị mới đăng ký     → status = 'inactive'   → 403 DEVICE_NOT_ACTIVE
Thiết bị sai HMAC        → HMAC_MISMATCH         → 401 (+ fail_count++)
Thiết bị bị khóa         → status = 'blocked'    → 403 DEVICE_BLOCKED
Thiết bị hợp lệ và active → Dữ liệu được lưu    → INSERT sensor_data
```

### 4.2. Tự động khóa sau 5 lần xác thực sai (Auto-block)

Áp dụng đồng thời ở cả luồng MQTT (`mqttDataService.ts`) và HTTP fallback (`validateDevice.ts`):

```typescript
const BLOCK_THRESHOLD = 5;

// Sau mỗi lần HMAC sai hoặc timestamp hết hạn:
UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?

// Nếu fail_count >= 5:
UPDATE devices SET status = 'blocked' WHERE id = ?
// → Ghi DEVICE_BLOCKED vào audit_log
// → Thiết bị bị từ chối hoàn toàn cho đến khi admin/operator mở khóa
```

Mở khóa: `PATCH /api/devices/:id/status` → `{ status: "active" }` — đồng thời reset `fail_count = 0`.

### 4.3. Sensor whitelist tại Gateway firmware

Gateway chỉ forward từ sensor được đăng ký trong hệ thống. Hai tầng tra cứu (`firmware/gateway-node/lib/sensor_registry/sensor_registry.cpp`):

**Tầng 1 — Dynamic registry (ưu tiên):**
- Gateway gọi `GET /api/device/sensors` mỗi 5 phút với HMAC xác thực
- Backend kiểm tra Gateway HMAC trước khi trả danh sách sensor active
- Lưu tối đa 16 sensor trong RAM (`SENSOR_REGISTRY_MAX = 16`)

**Tầng 2 — Static fallback:**
- `KNOWN_SENSORS[]` hardcode trong `firmware/gateway-node/include/config_gw.h`
- Dùng khi dynamic registry chưa sẵn sàng

**Lazy refresh:** Khi gặp sensor chưa có trong registry, Gateway ngay lập tức gọi lại API để cập nhật trước khi quyết định từ chối.

### 4.4. Kiểm tra `device_type` — chống đóng giả vai trò

Backend kiểm tra `device_type` trong DB sau khi HMAC pass thành công (`data.routes.ts`, `mqttDataService.ts`):

```typescript
if (!gwRow || gwRow.device_type !== "gateway") {
  return res.status(403).json({ error: "INVALID_DEVICE_TYPE" });
}
if (!snRow || snRow.device_type !== "sensor") {
  return res.status(403).json({ error: "INVALID_DEVICE_TYPE" });
}
```

Một Sensor Node dù có HMAC hợp lệ cũng không thể gửi dữ liệu với tư cách Gateway.

### 4.5. Giới hạn lưu trữ dữ liệu

Tự động giữ tối đa **150 bản ghi** mới nhất cho mỗi sensor (`mqttDataService.ts`, `data.routes.ts`):

```sql
DELETE FROM sensor_data WHERE device_id = ? AND id NOT IN (
  SELECT id FROM (
    SELECT id FROM sensor_data WHERE device_id = ? ORDER BY id DESC LIMIT 150
  ) t
)
```

---

## 5. Kiểm soát quyền truy cập API (RBAC người dùng)

### 5.1. Phân vai trò người dùng

Ba vai trò được định nghĩa trong schema (`database/migrations/001_schema.sql`):

```sql
role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'viewer'
```

| Vai trò | Quyền chính |
|---------|------------|
| `admin` | Toàn quyền: quản lý thiết bị, người dùng, audit log, xóa dữ liệu |
| `operator` | Đăng ký thiết bị, kích hoạt/khóa, xem dữ liệu, xóa DATA_RECV log |
| `viewer` | Chỉ xem: thiết bị, dữ liệu cảm biến, audit log |

Tài khoản mặc định: `admin` / `admin123` (bcrypt hash trong seed data).

### 5.2. Middleware xác thực và phân quyền

**Xác thực người dùng** — `backend/src/middleware/verifyJWT.ts`:
- Đọc JWT từ HttpOnly cookie `token`
- Xác thực chữ ký bằng `jwt.verify(token, JWT_SECRET)`
- Gắn `{ id, username, role }` vào `req.user`
- Lỗi `401 NO_TOKEN` hoặc `401 INVALID_TOKEN`

**Phân quyền theo vai trò** — `backend/src/middleware/rbac.ts`:
- `requireRole("admin", "operator")` — chặn `viewer`
- `requireRole("admin")` — chặn `operator` và `viewer`
- Lỗi `403 FORBIDDEN`

Cách dùng nhất quán trên mọi route cần bảo vệ:
```typescript
router.post("/register", verifyJWT, requireRole("admin", "operator"), handler);
router.delete("/:id",    verifyJWT, requireRole("admin"),             handler);
```

### 5.3. Phân quyền chi tiết theo từng endpoint

| Endpoint | Method | viewer | operator | admin |
|----------|--------|--------|----------|-------|
| `GET /api/devices` | Xem thiết bị | ✓ | ✓ | ✓ |
| `GET /api/devices/:id/data` | Xem dữ liệu cảm biến | ✓ | ✓ | ✓ |
| `GET /api/dashboard/stats` | Thống kê hệ thống | ✓ | ✓ | ✓ |
| `GET /api/audit-log` | Xem nhật ký | ✓ | ✓ | ✓ |
| `POST /api/devices/register` | Đăng ký thiết bị | ✗ | ✓ | ✓ |
| `PATCH /api/devices/:id/status` | Kích hoạt / khóa | ✗ | ✓ | ✓ |
| `DELETE /api/audit-log/data-recv` | Xóa log DATA_RECV | ✗ | ✓ | ✓ |
| `DELETE /api/devices/:id` | Xóa thiết bị | ✗ | ✗ | ✓ |
| `GET/POST/PATCH/DELETE /api/users` | Quản lý người dùng | ✗ | ✗ | ✓ |

### 5.4. Bảo vệ phiên đăng nhập

- **JWT**: ký với `JWT_SECRET`, thời hạn 8 giờ
- **HttpOnly cookie**: JavaScript phía client không đọc được (chống XSS)
- **SameSite=Strict**: Cookie không gửi qua cross-site request (chống CSRF)
- **Mật khẩu**: hash bằng bcrypt với `saltRounds = 12` — không lưu plain text

### 5.5. Bảo vệ bổ sung ứng dụng web

```typescript
// backend/src/app.ts

app.use(helmet())                  // HTTP security headers
app.use(cors({ origin: FRONTEND_URL, credentials: true }))  // chỉ cho phép frontend origin
app.use(express.json({ limit: "10kb" }))                    // giới hạn body size

// Rate limiting:
authLimiter:       10 req / 15 phút / IP   → POST /api/auth/login
deviceDataLimiter: 60 req / phút / IP      → POST /api/device/data
apiLimiter:        100 req / 15 phút / IP  → /api/* còn lại
```

---

## 6. Luồng dữ liệu đầy đủ — từ thiết bị đến dashboard

### 6.1. Luồng đăng ký thiết bị

```
Admin/Operator mở Dashboard
    │  Nhấn "Đăng ký thiết bị mới"
    │  Nhập: device_name, device_type, location
    ▼
POST /api/devices/register   [verifyJWT + requireRole(admin, operator)]
    │  Hệ thống sinh: device_id = "ESP32-SN-XXXXXXXX"
    │                 secret_key = crypto.randomBytes(32).hex()
    │  INSERT vào DB: status = 'inactive', fail_count = 0
    │  Ghi audit_log: DEVICE_REGISTER
    ▼
Response: { device_id, secret_key }   ← secret_key CHỈ hiện 1 lần
    │
    ▼
Người dùng copy device_id + secret_key vào firmware:
    firmware/sensor-node/include/config.h      (nếu là sensor)
    firmware/gateway-node/include/config_gw.h  (nếu là gateway)
    │
    ▼
Flash firmware → thiết bị kết nối → test → kích hoạt:
    PATCH /api/devices/:id/status → { status: "active" }
```

### 6.2. Luồng gửi dữ liệu cảm biến (mỗi 5 giây)

```
[Sensor Node]
    Kiểm tra: WiFi ✓, NTP ✓, MQTT ✓, DHT22 valid ✓
    timestamp = getNTPTimestamp()
    sn_hmac   = HMAC-SHA256(SECRET_KEY, "ESP32-SN-CBF05770:timestamp")
    MQTT publish "local/sensors/ESP32-SN-CBF05770/data"
        ↓
[Mosquitto :1883]
        ↓ wildcard subscribe
[Gateway Node]
    NTP guard: ntpIsSynced() ✓
    Tra registry: ESP32-SN-CBF05770 có trong whitelist ✓
    Kiểm tra |sn_timestamp - now| <= 300s ✓
    safeEq64(expected_hmac, sn_hmac) ✓
    Ký: gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "ESP32-GW-78867B14:gw_ts")
    MQTT publish "gateway/ESP32-GW-78867B14/data"  ← payload lồng ghép
        ↓
[Mosquitto :1883]
        ↓ subscribe gateway/+/data
[Backend mqttDataService.ts]
    Level 1: verify gw_hmac     → timingSafeEqual ✓
    Level 2: verify sn_hmac     → timingSafeEqual ✓
    device_type check: gateway ✓, sensor ✓
    status check: cả hai 'active' ✓
    INSERT sensor_data (device_id, gateway_id, payload, received_at)
    Cleanup nếu count > 150
    UPDATE devices SET last_seen=NOW(), fail_count=0, last_ip=...
    INSERT audit_log: DATA_RECV
        ↓
[MySQL iot_managerDeviceIoT]
        ↓ SWR polling 10s
[Next.js Dashboard]
    GET /api/devices/:id/data → hiển thị biểu đồ và bảng dữ liệu
```

### 6.3. Luồng xác định trạng thái online/offline

Không có heartbeat riêng. Trạng thái tính toán runtime mỗi khi frontend poll:

```sql
-- backend/src/routes/devices.ts
SELECT *, 
  CASE WHEN last_seen IS NOT NULL 
       AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60
  THEN TRUE ELSE FALSE END AS is_online
FROM devices
```

Ngưỡng 60 giây: sensor gửi mỗi 5 giây → luôn online khi hoạt động, offline sau 60s mất kết nối.

---

## 7. Nhật ký kiểm toán (Audit Log)

Hệ thống ghi nhận tự động tất cả sự kiện bảo mật quan trọng (`backend/src/services/auditLogger.ts`):

```typescript
await log(event_type, device_id, ip_address, user_agent, details);
// Không bao giờ crash luồng chính — lỗi audit log bị bỏ qua
```

| Event type | Khi nào ghi | Thông tin kèm |
|-----------|-------------|--------------|
| `DEVICE_REGISTER` | Thiết bị được đăng ký | device_id, device_type, registered_by |
| `DEVICE_STATUS_CHANGE` | Trạng thái thiết bị thay đổi | new_status, changed_by |
| `DEVICE_DELETE` | Thiết bị bị xóa | deleted_device_id, deleted_by |
| `DATA_RECV` | Nhận dữ liệu thành công | gateway_id, sensor_id, data_id |
| `GATEWAY_AUTH_FAIL` | Gateway HMAC sai / timeout / không tìm thấy | reason, gateway_id |
| `SENSOR_AUTH_FAIL` | Sensor HMAC sai / timeout / không tìm thấy | reason, sensor_id |
| `DEVICE_BLOCKED` | fail_count >= 5 | device_id, fail_count, source |

Tra cứu audit log qua dashboard: `GET /api/audit-log` với filter theo event_type, device_id, from, to (tối đa 500 bản ghi).

---

## 8. Giao diện quản lý (Dashboard)

Dashboard Next.js 16 được xây dựng với kiến trúc App Router, bảo vệ toàn bộ route bằng JWT cookie.

### 8.1. Cơ chế bảo vệ route frontend

Next.js proxy mọi API call qua `frontend/src/app/api/[...path]/route.ts` — không expose backend URL cho client:

```typescript
// frontend gọi /api/devices → Next.js proxy → http://backend:5000/api/devices
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:5000";
```

`AuthContext` (`frontend/src/providers/AuthContext.tsx`) gọi `GET /api/auth/me` khi load — nếu JWT không hợp lệ, redirect về `/login`. Toàn bộ trang private nằm trong route group `(private)` yêu cầu đăng nhập.

API client tự động redirect về `/login` khi nhận `401`:
```typescript
// frontend/src/package/services/api.ts
if (res.status === 401 && !url.includes("/api/auth/login")) {
  window.location.href = "/login";
}
```

### 8.2. Các trang đã triển khai

| Trang | Route | Chức năng chính |
|-------|-------|----------------|
| **Dashboard** | `/dashboard` | Thống kê: tổng gateway, sensor, gateway online, sensor online, total data points |
| **Devices** | `/devices` | Tab gateway/sensor, bảng với trạng thái online/offline, kích hoạt/khóa/xóa |
| **Device Detail** | `/devices/[id]` | Info cards (status, fail_count, last_seen), biểu đồ cảm biến (Recharts), bảng dữ liệu gần nhất |
| **Audit Log** | `/audit` | Bảng audit log, filter theo event_type/device_id/thời gian, xóa DATA_RECV |
| **Users** | `/users` | Tạo user (operator/viewer), đổi mật khẩu, xóa user |
| **Login** | `/login` | Form đăng nhập, hiển thị lỗi 401/429 |

### 8.3. Realtime qua SWR polling

```typescript
// frontend/src/package/features/useDeviceList.ts
useSWR("/api/devices", fetcher, { refreshInterval: 10000 })

// frontend/src/package/features/useDeviceDetail.ts  
useSWR(`/api/devices/${id}`, fetcher, { refreshInterval: 10000 })
```

Mọi trang dữ liệu tự động refresh mỗi **10 giây**. Không dùng WebSocket.

### 8.4. Biểu đồ dữ liệu cảm biến

`frontend/src/components/compound/device/SensorChart.tsx` dùng Recharts:
- LineChart với hai trục Y độc lập: nhiệt độ (màu cam) và độ ẩm (màu xanh)
- Filter thời gian: 1h / 6h / 24h
- Lấy tối đa 200 bản ghi gần nhất qua `GET /api/devices/:id/data?limit=200`

---

## 9. Tổng kết kết quả theo mục tiêu

### 9.1. Bảng đối chiếu mục tiêu

| Mục tiêu | Kết quả | Chi tiết triển khai |
|----------|---------|---------------------|
| **Quản lý danh tính thiết bị** | Hoàn thành, vượt yêu cầu | `device_id` UNIQUE tự sinh, `secret_key` 32 bytes random, `device_type` ENUM, trạng thái 3 mức, audit trail đầy đủ |
| **Xác thực thiết bị khi kết nối** | Hoàn thành, vượt yêu cầu | HMAC-SHA256 hai lớp độc lập; xác thực ở 3 điểm: Gateway firmware, Backend Level 1, Backend Level 2 |
| **Chỉ thiết bị hợp lệ mới gửi dữ liệu** | Hoàn thành | `status=active` bắt buộc; HMAC pass; device_type đúng; whitelist tại Gateway |
| **Kiểm soát quyền truy cập cơ bản** | Hoàn thành | RBAC 3 role (admin/operator/viewer); JWT HttpOnly; middleware `verifyJWT` + `requireRole` trên từng endpoint |
| **Truy cập tài nguyên hệ thống** | Hoàn thành | Mọi API cần đăng nhập; quyền chi tiết theo role; Nginx single entry point |

### 9.2. Tính năng bổ sung ngoài yêu cầu ban đầu

| Tính năng | Mức độ |
|-----------|--------|
| Chống replay attack (timestamp ±300s) | Hoàn thành — triển khai ở 3 điểm độc lập |
| Chống timing attack (`safeEq64`, `timingSafeEqual`) | Hoàn thành — cả firmware lẫn backend |
| Chống brute force (auto-block fail_count >= 5) | Hoàn thành |
| Chống user enumeration login (dummy bcrypt hash) | Hoàn thành |
| Audit log đầy đủ 7 event types | Hoàn thành |
| Rate limiting 3 mức | Hoàn thành |
| Sensor whitelist + lazy refresh tại Gateway firmware | Hoàn thành |
| NTP guard (không gửi nếu clock không đồng bộ) | Hoàn thành |
| Buffer overflow protection firmware | Hoàn thành |
| HTTP security headers (Helmet) | Hoàn thành |
| Dashboard realtime SWR polling | Hoàn thành |

### 9.3. Phần chưa hoàn thiện

| Phần | Trạng thái | Ghi chú |
|------|-----------|---------|
| `device_tokens` table | Schema có, route chưa có | Chuẩn bị cho long-lived token thiết bị |
| MQTT TLS/SSL | Chưa triển khai | Mosquitto plain TCP 1883 |
| HTTPS | Chưa triển khai | Nginx HTTP port 80 |
| JWT refresh token | Chưa triển khai | Hết hạn 8h, phải đăng nhập lại |
| Rotate `secret_key` | Chưa triển khai | Phải đăng ký lại thiết bị nếu key lộ |
| Config firmware trong Git | Cần gitignore | `config.h`, `config_gw.h` chứa credentials thực |

---

## 10. Kết luận

Hệ thống đã triển khai đầy đủ mục tiêu đề ra — xây dựng một nền tảng IoT với:

- **Quản lý danh tính thiết bị** rõ ràng: `device_id` duy nhất, `secret_key` riêng biệt mỗi thiết bị, phân loại `device_type`, vòng đời trạng thái `inactive → active → blocked`
- **Xác thực thiết bị** đa lớp: HMAC-SHA256 được triển khai từ firmware C++ (mbedTLS) đến backend Node.js (crypto), với constant-time comparison chống timing attack ở cả hai phía
- **Kiểm soát quyền truy cập** theo hai chiều: thiết bị IoT qua HMAC + whitelist + status check; người dùng web qua RBAC 3 vai trò + JWT HttpOnly
- **Đảm bảo dữ liệu hợp lệ**: Chỉ thiết bị đã đăng ký, được kích hoạt, có HMAC đúng, trong cửa sổ timestamp hợp lệ, và đúng vai trò mới được INSERT vào database

Hệ thống sử dụng phần cứng thực (ESP32 DOIT DevKit V1, cảm biến DHT22), giao thức MQTT hai tầng (sensor→gateway→backend), và được đóng gói hoàn chỉnh bằng Docker Compose — sẵn sàng chạy trong môi trường LAN nội bộ.
