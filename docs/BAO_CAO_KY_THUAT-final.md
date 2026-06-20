# Báo Cáo Kỹ Thuật: Hệ Thống IoT Quản Lý Danh Tính Thiết Bị, Xác Thực và Kiểm Soát Quyền Truy Cập

> **Mục tiêu hệ thống:** Xây dựng hệ thống IoT có chức năng quản lý danh tính thiết bị, xác thực thiết bị khi kết nối và kiểm soát quyền truy cập cơ bản, đảm bảo chỉ các thiết bị hợp lệ mới được phép gửi dữ liệu và truy cập tài nguyên của hệ thống.

---

## 1. Tổng Quan Hệ Thống

### 1.1 Kiến Trúc Tổng Thể

Hệ thống gồm 8 thành phần chính, được triển khai qua Docker Compose (`docker-compose.yml`):

```
[Sensor Node ESP32]
        │ MQTT publish (local/sensors/<id>/data)
        ▼
[MQTT Broker 1 – port 1883]   ← Broker tầng cục bộ (SN → GW)
        │ MQTT subscribe
        ▼
[Gateway Node ESP32]
        │ MQTT publish (gateway/<id>/data)
        ▼
[MQTT Broker 2 – port 1884]   ← Broker tầng backend (GW → Server)
        │ MQTT subscribe
        ▼
[Backend Server – Node.js/Express – port 5000]
        │ SQL queries
        ▼
[MySQL 8.0 – port 3308]
        ▲
[Nginx – port 80]  ← Reverse proxy: /api → backend, / → frontend
        ▲
[Frontend – Next.js – port 3000]
```

### 1.2 Vai Trò Từng Thành Phần

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| **Sensor Node** | ESP32 + PlatformIO (C++) | Đọc cảm biến DHT22, ký HMAC-SHA256, publish MQTT lên Broker 1 |
| **Gateway Node** | ESP32 + PlatformIO (C++) | Subscribe Broker 1, xác thực HMAC sensor, ký lại HMAC gateway, forward lên Broker 2 |
| **MQTT Broker 1** | Eclipse Mosquitto 2 (port 1883) | Tầng trung gian nội bộ: nhận dữ liệu từ sensor, chuyển đến gateway |
| **MQTT Broker 2** | Eclipse Mosquitto 2 (port 1884) | Tầng backend: nhận dữ liệu từ gateway, Backend subscribe để xử lý |
| **Backend Server** | Node.js + Express + TypeScript | Xác thực HMAC thiết bị, kiểm tra RBAC, lưu dữ liệu, ghi audit log |
| **MySQL 8.0** | MySQL 8.0 | Lưu thông tin thiết bị, dữ liệu cảm biến, người dùng, audit log |
| **Frontend** | Next.js 16 + React + TailwindCSS | Dashboard quản lý, hiển thị trạng thái, phân quyền theo role |
| **Nginx** | Nginx Alpine | Reverse proxy: định tuyến `/api/*` → Backend, `/` → Frontend |

### 1.3 Công Nghệ Sử Dụng

**Backend:** Node.js, Express, TypeScript, mysql2, jsonwebtoken, bcrypt, express-rate-limit, helmet, morgan, mqtt (npm)

**Frontend:** Next.js 16, React, TailwindCSS, lucide-react

**Firmware:** PlatformIO (C++/Arduino), mbedTLS (HMAC-SHA256), PubSubClient, ArduinoJson, DHT sensor library

**Hạ tầng:** Docker, Docker Compose, Eclipse Mosquitto, Nginx, MySQL 8.0

---

## 2. Quản Lý Danh Tính Thiết Bị

### 2.1 Sinh Device ID và Secret Key

Khi đăng ký thiết bị qua `POST /api/devices/register` ([backend/src/routes/devices.ts](../backend/src/routes/devices.ts#L37-L41)):

```typescript
// Tạo device_id có định dạng ESP32-SN-XXXXXXXX hoặc ESP32-GW-XXXXXXXX
const suffix   = crypto.randomBytes(4).toString("hex").toUpperCase();
const typeTag  = device_type === "sensor" ? "SN" : "GW";
const device_id = `ESP32-${typeTag}-${suffix}`;

// Tạo secret_key 32 bytes random (64 ký tự hex)
const secret_key = crypto.randomBytes(32).toString("hex");
```

Secret key **chỉ được trả về một lần duy nhất** trong response đăng ký, không bao giờ được query lại từ API sau đó. Sau khi lấy được, developer/operator cần copy vào firmware thủ công (file `config_1.h` hoặc `config_gw.h`).

### 2.2 Bảng Lưu Trữ Trong Database

File: [database/migrations/001_schema.sql](../database/migrations/001_schema.sql)

**Bảng `devices`** (bảng trung tâm quản lý danh tính thiết bị):

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT | Khóa nội bộ |
| `device_id` | VARCHAR(64) UNIQUE | Định danh công khai (ESP32-SN-XXXXXXXX) |
| `device_name` | VARCHAR(128) | Tên hiển thị |
| `device_type` | ENUM('sensor','gateway') | Phân loại thiết bị |
| `secret_key` | VARCHAR(64) | Khóa bí mật dùng xác thực HMAC |
| `status` | ENUM('inactive','active','blocked') | Trạng thái hiện tại |
| `location` | VARCHAR(255) | Vị trí vật lý |
| `fail_count` | TINYINT UNSIGNED | Số lần xác thực thất bại liên tiếp |
| `last_seen` | DATETIME | Thời điểm nhận dữ liệu gần nhất |
| `last_ip` | VARCHAR(45) | IP gần nhất của thiết bị |
| `created_at` | DATETIME | Thời điểm tạo |
| `created_by` | INT UNSIGNED (FK → users) | User đã đăng ký thiết bị |

### 2.3 Các Trạng Thái Thiết Bị

| Trạng thái | Ý nghĩa | Ai có thể chuyển |
|---|---|---|
| `inactive` | Vừa đăng ký, chưa được phép hoạt động | Mặc định khi tạo |
| `active` | Được phép gửi dữ liệu | Admin, Operator (PATCH /api/devices/:id/status) |
| `blocked` | Bị cấm, không nhận dữ liệu | Admin, Operator hoặc hệ thống tự động sau 5 lần fail |

Khi chuyển sang `active`, `fail_count` được reset về 0 ([devices.ts:219-223](../backend/src/routes/devices.ts#L219-L223)):

```typescript
if (status === "active") {
  await pool.execute(
    "UPDATE devices SET status = ?, fail_count = 0 WHERE id = ?", [status, id]
  );
}
```

### 2.4 Đăng Ký Thiết Bị Qua Dashboard

- **API:** `POST /api/devices/register` — yêu cầu JWT hợp lệ và role `admin` hoặc `operator`
- **Frontend:** Component `AddDeviceModal` ([frontend/src/features/devices/components/AddDeviceModal.tsx](../frontend/src/features/devices/components/AddDeviceModal.tsx)) — chỉ hiển thị nút "Thêm thiết bị" khi `canCreateDevice === true`
- **Quyền kiểm tra:** `usePermissions()` hook ([frontend/src/features/auth/hooks/usePermissions.ts](../frontend/src/features/auth/hooks/usePermissions.ts))

### 2.5 Hiển Thị Trạng Thái Trên Dashboard

- **GET /api/devices** — trả về tất cả thiết bị kèm trường `is_online` (tính theo `TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`)
- Component `DeviceStatusBadge` hiển thị badge trạng thái (inactive / active / blocked)
- Component `OnlineIndicator` hiển thị indicator xanh/đỏ theo `last_seen`

---

## 3. Xác Thực Thiết Bị Khi Kết Nối / Gửi Dữ Liệu

### 3.1 Cơ Chế Xác Thực: HMAC-SHA256 + Timestamp Window

Hệ thống dùng **HMAC-SHA256 có kèm timestamp** để xác thực thiết bị, áp dụng ở hai tầng:

- **Tầng 1 – Gateway HMAC:** Gateway ký message `gateway_id:gw_timestamp` bằng `GW_SECRET_KEY`
- **Tầng 2 – Sensor HMAC:** Sensor ký message `sensor_id:sn_timestamp` bằng `SECRET_KEY`

Cả hai timestamp phải nằm trong cửa sổ **±300 giây** so với thời gian server, chống replay attack.

### 3.2 Phía Firmware – Sensor Node

File: [firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp](../firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp)

```cpp
// Sensor ký HMAC mỗi lần publish
unsigned long timestamp = getCurrentTimestamp();  // NTP-synced
String message = String(DEVICE_ID) + ":" + String(timestamp);
String hmac    = computeHMAC(String(SECRET_KEY), message);

// Gửi JSON lên Broker 1: local/sensors/<DEVICE_ID>/data
doc["sensor_id"]    = DEVICE_ID;
doc["sn_timestamp"] = timestamp;
doc["sn_hmac"]      = hmac;
doc["sensor_ip"]    = WiFi.localIP().toString();
doc["data"]["temperature"] = ...;
doc["data"]["humidity"]    = ...;
```

Thuật toán HMAC được implement bằng `mbedTLS` ([firmware/sensor-node/lib/hmac_util/hmac_util.cpp](../firmware/sensor-node/lib/hmac_util/hmac_util.cpp)):

```cpp
mbedtls_md_hmac_starts(&ctx, (const uint8_t*)key.c_str(), key.length());
mbedtls_md_hmac_update(&ctx, (const uint8_t*)message.c_str(), message.length());
mbedtls_md_hmac_finish(&ctx, hmacResult);
```

### 3.3 Phía Firmware – Gateway Node

File: [firmware/gateway-node/lib/forwarder/forwarder.cpp](../firmware/gateway-node/lib/forwarder/forwarder.cpp)

Gateway thực hiện **xác thực lớp đầu tiên trước khi forward**:

1. Parse JSON từ Broker 1
2. Tra cứu `secret_key` của sensor trong registry (dynamic từ backend + static hardcode)
3. Kiểm tra timestamp `sn_timestamp` trong cửa sổ `±TIMESTAMP_WINDOW_SEC` (300s)
4. Verify HMAC sensor bằng `verifySensorHMAC()` dùng `safeEq64()` (constant-time compare)
5. Nếu OK → ký HMAC gateway: `HMAC-SHA256(GW_SECRET_KEY, "gw_id:gw_timestamp")`
6. Build JSON mới gồm cả `gateway_id/gw_hmac` bao ngoài `sensor_payload`
7. Publish lên Broker 2: `gateway/<GW_DEVICE_ID>/data`

### 3.4 Phía Backend – Xác Thực HMAC

**HTTP path:** Middleware `validateDevice` ([backend/src/middleware/validateDevice.ts](../backend/src/middleware/validateDevice.ts))

**MQTT path:** Service `mqttDataService` ([backend/src/services/mqttDataService.ts](../backend/src/services/mqttDataService.ts))

Hàm xác thực cốt lõi nằm ở [backend/src/services/hmacService.ts](../backend/src/services/hmacService.ts):

```typescript
// Cửa sổ timestamp: ±300 giây
const TIMESTAMP_WINDOW_SECONDS = 300;

// Tính HMAC-SHA256
function computeHMAC(secret: string, message: string): Buffer {
  return crypto.createHmac("sha256", secret).update(message).digest();
}

// So sánh constant-time, chống timing attack
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);  // Node.js crypto
}

// Xác thực Gateway
export async function verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac) {
  const device = await fetchDevice(gateway_id);   // query DB theo device_id
  if (!device)            return { ok: false, error: "NOT_FOUND" };
  if (!isTimestampValid(gw_timestamp)) return { ok: false, error: "TIMESTAMP_EXPIRED" };
  const expected = computeHMAC(device.secret_key, `${gateway_id}:${gw_timestamp}`).toString("hex");
  if (!safeCompare(expected, gw_hmac)) return { ok: false, error: "HMAC_MISMATCH" };
  return { ok: true, device };
}
```

**Luồng xử lý trong `validateDevice` middleware:**

```
Nhận request POST /api/device/data
  │
  ├─ Thiếu gateway_id / gw_timestamp / gw_hmac? → 400 MISSING_GATEWAY_FIELDS
  │
  ├─ verifyGatewayHMAC()
  │   ├─ Gateway không tìm thấy?           → 401 + log GATEWAY_AUTH_FAIL
  │   ├─ Timestamp hết hạn (> 300s)?       → 401 + log REPLAY_ATTACK
  │   ├─ HMAC sai?                         → 401 + log GATEWAY_AUTH_FAIL
  │   │       └─ incrementFailCount() → nếu >= 5: blockDevice() + log DEVICE_BLOCKED
  │   └─ OK → tiếp tục
  │
  ├─ verifyDeviceHMAC() (cho sensor)
  │   ├─ Sensor không tìm thấy?            → 401 + log SENSOR_AUTH_FAIL
  │   ├─ Timestamp hết hạn?                → 401 + log REPLAY_ATTACK
  │   ├─ HMAC sai?                         → 401 + log SENSOR_AUTH_FAIL
  │   │       └─ incrementFailCount() → nếu >= 5: blockDevice()
  │   └─ OK → attach req.gateway, req.sensor
  │
  └─ next() → data.routes.ts handler
```

### 3.5 Kiểm Tra Trạng Thái Sau Xác Thực HMAC

Sau khi HMAC thành công, `data.routes.ts` ([backend/src/routes/data.routes.ts](../backend/src/routes/data.routes.ts)) kiểm tra thêm:

```typescript
// Kiểm tra device_type đúng loại (chống privilege escalation)
if (!gwRow || gwRow.device_type !== "gateway") {
  await log("PRIVILEGE_ESCALATION", ...);
  res.status(403).json({ error: "INVALID_DEVICE_TYPE" });
}

// Kiểm tra status
if (gwRow.status === "blocked") → 403 DEVICE_BLOCKED
if (gwRow.status !== "active")  → 403 DEVICE_NOT_ACTIVE
if (snRow.status === "blocked") → 403 DEVICE_BLOCKED
if (snRow.status !== "active")  → 403 DEVICE_NOT_ACTIVE
```

Cùng logic này được áp dụng trong `mqttDataService.ts` khi Backend nhận qua MQTT.

### 3.6 Tóm Tắt Xử Lý Các Trường Hợp Lỗi

| Trường hợp | Xử lý |
|---|---|
| Thiếu trường bắt buộc | 400 MISSING_GATEWAY_FIELDS / MISSING_SENSOR_FIELDS |
| Device ID không tồn tại trong DB | 401, log `GATEWAY_AUTH_FAIL` hoặc `SENSOR_AUTH_FAIL`, error=NOT_FOUND |
| Timestamp lệch > 300 giây | 401, log `REPLAY_ATTACK`, error=TIMESTAMP_EXPIRED |
| HMAC không khớp | 401, log `GATEWAY_AUTH_FAIL`/`SENSOR_AUTH_FAIL`, tăng `fail_count` |
| `fail_count` đạt 5 lần | Tự động set `status='blocked'`, log `DEVICE_BLOCKED` |
| Thiết bị bị blocked | 403 DEVICE_BLOCKED |
| Thiết bị inactive (chưa active) | 403 DEVICE_NOT_ACTIVE |
| Sensor tự nhận là gateway (type mismatch) | 403 INVALID_DEVICE_TYPE + log `PRIVILEGE_ESCALATION` |

---

## 4. Kiểm Soát Quyền Truy Cập (RBAC)

### 4.1 Hệ Thống Phân Quyền

Hệ thống sử dụng **RBAC (Role-Based Access Control)** với 3 vai trò định nghĩa trong schema `ENUM('admin','operator','viewer')`.

**Hai middleware chịu trách nhiệm kiểm soát quyền:**

- [backend/src/middleware/verifyJWT.ts](../backend/src/middleware/verifyJWT.ts): Kiểm tra JWT từ HttpOnly cookie, attach `req.user = { id, username, role }`
- [backend/src/middleware/rbac.ts](../backend/src/middleware/rbac.ts): `requireRole(...roles)` so sánh `req.user.role` với danh sách roles được phép

```typescript
// Cách dùng trên từng route
router.post("/register",   verifyJWT, requireRole("admin", "operator"), handler);
router.patch("/:id/status", verifyJWT, requireRole("admin", "operator"), handler);
router.delete("/:id",       verifyJWT, requireRole("admin"),             handler);
router.get("/",             verifyJWT, /* tất cả roles */                 handler);
```

### 4.2 Bảng Phân Quyền Chi Tiết

| Chức năng | API | Admin | Operator | Viewer |
|---|---|---|---|---|
| Đăng nhập | POST /api/auth/login | ✅ | ✅ | ✅ |
| Xem danh sách thiết bị | GET /api/devices | ✅ | ✅ | ✅ |
| Xem chi tiết thiết bị | GET /api/devices/:id | ✅ | ✅ | ✅ |
| Xem dữ liệu cảm biến | GET /api/devices/:id/data | ✅ | ✅ | ✅ |
| Xem dashboard stats | GET /api/dashboard/stats | ✅ | ✅ | ✅ |
| **Đăng ký thiết bị mới** | POST /api/devices/register | ✅ | ✅ | ❌ |
| **Thay đổi trạng thái thiết bị** | PATCH /api/devices/:id/status | ✅ | ✅ | ❌ |
| **Xóa thiết bị** | DELETE /api/devices/:id | ✅ | ❌ | ❌ |
| Xem audit log | GET /api/audit-log | ✅ (all) | ✅ (giới hạn type) | ✅ (giới hạn type) |
| **Xóa audit log** | DELETE /api/audit-log/* | ✅ | ❌ | ❌ |
| **Xem danh sách users** | GET /api/users | ✅ | ❌ | ❌ |
| **Tạo user mới** | POST /api/users | ✅ | ❌ | ❌ |
| **Đổi mật khẩu user** | PATCH /api/users/:id/password | ✅ | ❌ | ❌ |
| **Xóa user** | DELETE /api/users/:id | ✅ | ❌ | ❌ |

**Phân quyền xem Audit Log theo role** ([backend/src/routes/audit.ts](../backend/src/routes/audit.ts#L20-L24)):

| Role | Event Types được xem |
|---|---|
| admin | Tất cả 9 loại event |
| operator | 8 loại (trừ DEVICE_DELETE) |
| viewer | DATA_RECV, DEVICE_REGISTER, DEVICE_BLOCKED, DEVICE_STATUS_CHANGE |

### 4.3 Kiểm Soát Phân Quyền Phía Frontend

Hook `usePermissions()` ([frontend/src/features/auth/hooks/usePermissions.ts](../frontend/src/features/auth/hooks/usePermissions.ts)) cung cấp các flag theo role:

```typescript
return {
  isAdmin:              role === "admin",
  canCreateDevice:      hasRole(role, "admin", "operator"),
  canUpdateDeviceStatus: hasRole(role, "admin", "operator"),
  canDeleteDevice:       hasRole(role, "admin"),
  canDeleteAuditLog:     hasRole(role, "admin"),
};
```

**Ẩn/hiện UI theo quyền:**

- Nút "Thêm thiết bị": chỉ render khi `canCreateDevice === true` ([DevicesPage.tsx:109](../frontend/src/features/devices/pages/DevicesPage.tsx#L109))
- Nút "Khóa/Mở khóa": chỉ render khi `canUpdateDeviceStatus === true` ([DevicesPage.tsx:299](../frontend/src/features/devices/pages/DevicesPage.tsx#L299))
- Nút "Xóa thiết bị": chỉ render khi `canDeleteDevice === true` ([DevicesPage.tsx:318](../frontend/src/features/devices/pages/DevicesPage.tsx#L318))
- Trang `/users`: render thông báo "Không có quyền" nếu `role !== "admin"` ([UsersPage.tsx:267-277](../frontend/src/features/users/pages/UsersPage.tsx#L267-L277))
- Trang Users không có nút "Tạo admin" — form chỉ cho phép tạo `operator` hoặc `viewer`

---

## 5. Flow Hoạt Động Chính

### Flow 1: Đăng Nhập Dashboard và Phân Quyền Người Dùng

```
1. User truy cập URL → Next.js route / → redirect /login
2. User nhập username/password → Frontend gọi POST /api/auth/login (qua Nginx → Backend)
3. Backend:
   a. Query DB: SELECT id, username, password_hash, role FROM users WHERE username = ?
   b. bcrypt.compare(password, password_hash) với bcrypt cost=12
   c. Nếu user không tồn tại: vẫn chạy bcrypt.compare(dummy) để chống timing attack
   d. Nếu đúng: tạo JWT { id, username, role } ký bằng JWT_SECRET, expiresIn: "8h"
   e. Set cookie httpOnly: true, sameSite: "strict", maxAge: 8h
   f. Nếu role là operator/viewer: tạo notification "đã đăng nhập" cho admin
4. Frontend nhận response → AuthProvider.setUser(user) → router.replace("/dashboard")
5. Layout private ([frontend/src/app/(private)/layout.tsx]) kiểm tra cookie tồn tại
6. Sidebar hiển thị username + role label (Quản trị viên / Vận hành / Xem)
7. usePermissions() tính toán flags theo role → ẩn/hiện các action buttons
```

**Files liên quan:** [backend/src/routes/auth.ts](../backend/src/routes/auth.ts), [frontend/src/features/auth/providers/AuthProvider.tsx](../frontend/src/features/auth/providers/AuthProvider.tsx), [frontend/src/widgets/app-shell/Sidebar.tsx](../frontend/src/widgets/app-shell/Sidebar.tsx)

---

### Flow 2: Đăng Ký Thiết Bị IoT

```
1. Admin/Operator click "Thêm thiết bị" trên trang /devices
2. AddDeviceModal mở, nhập: device_name, device_type (sensor/gateway), location
3. Frontend POST /api/devices/register với JWT cookie
4. Backend middleware chain: verifyJWT → requireRole("admin", "operator")
5. Backend sinh:
   - device_id = "ESP32-SN-" + randomBytes(4).hex.toUpperCase()  [ví dụ: ESP32-SN-CBF05770]
   - secret_key = randomBytes(32).hex  [64 ký tự hex]
6. INSERT INTO devices (..., status='inactive', fail_count=0, created_by=user.id)
7. log("DEVICE_REGISTER", insertedId, ip, userAgent, { device_id, registered_by })
8. Nếu role=operator: tạo notification gửi admin ("Operator X đã đăng ký thiết bị Y")
9. Response trả về: { device_id, secret_key, status: "inactive" }  ← SECRET_KEY CHỈ TRẢ VỀ LẦN NÀY
10. Frontend hiển thị modal kết quả chứa device_id + secret_key
11. Operator copy device_id + secret_key vào firmware (config_1.h hoặc config_gw.h)
12. Flash firmware lên ESP32, thiết bị kết nối và gửi dữ liệu
13. Admin/Operator PATCH /api/devices/:id/status body: { status: "active" } để kích hoạt
```

**Files liên quan:** [backend/src/routes/devices.ts](../backend/src/routes/devices.ts#L17-L87), [frontend/src/features/devices/components/AddDeviceModal.tsx](../frontend/src/features/devices/components/AddDeviceModal.tsx)

---

### Flow 3: Thiết Bị Gửi Dữ Liệu Cảm Biến

```
[SENSOR NODE]
1. Mỗi 5 giây (SEND_INTERVAL=5000ms): đọc nhiệt độ/độ ẩm từ DHT22
2. Lấy timestamp từ NTP server (đồng bộ Unix time)
3. Tính HMAC: message = "ESP32-SN-CBF05770:1718876543"
              sn_hmac = HMAC-SHA256(SECRET_KEY, message) → hex string 64 ký tự
4. Publish JSON lên Broker 1 (port 1883), topic: local/sensors/ESP32-SN-CBF05770/data
   {sensor_id, sn_timestamp, sn_hmac, sensor_ip, data: {temperature, humidity}}

[GATEWAY NODE]
5. Subscribe "local/sensors/+/data" từ Broker 1
6. Parse JSON, kiểm tra các trường bắt buộc
7. Tra cứu secret của sensor_id trong registry:
   - Ưu tiên: dynamic list từ backend (refreshed mỗi 5 phút qua GET /api/device/sensors)
   - Fallback: KNOWN_SENSORS hardcode trong config_gw.h
8. Verify timestamp sn_timestamp trong ±300s
9. Verify sn_hmac bằng verifySensorHMAC() với constant-time compare (safeEq64)
10. Nếu FAIL → log Serial "[FWD] REJECT" và drop packet
11. Nếu OK → ký HMAC gateway:
    gw_message = "ESP32-GW-78867B14:1718876543"
    gw_hmac = HMAC-SHA256(GW_SECRET_KEY, gw_message) → hex 64 ký tự
12. Build JSON wrapper và publish lên Broker 2 (port 1884), topic: gateway/ESP32-GW-78867B14/data
    {gateway_id, gateway_ip, gw_timestamp, gw_hmac, sensor_payload: {sensor_id, sn_timestamp, sn_hmac, data}}

[BACKEND]
13. mqttDataService subscribe "gateway/+/data" từ Broker 2
14. verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac):
    - Query DB lấy secret_key của gateway
    - Kiểm tra timestamp ±300s
    - Tính HMAC và timingSafeEqual
15. verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac): tương tự
16. Kiểm tra device_type: gateway phải là "gateway", sensor phải là "sensor"
17. Kiểm tra status: cả hai phải là "active"
18. INSERT INTO sensor_data (device_id=sensor.id, gateway_id=gateway.id, payload=JSON.stringify(data))
19. Giữ tối đa 150 bản ghi mới nhất cho mỗi sensor (xóa các bản ghi cũ)
20. UPDATE devices SET last_seen=NOW(), fail_count=0, last_ip=? cho cả gateway và sensor
21. logDataRecvWithPrune(sensor.id, ...) → INSERT audit_log event_type='DATA_RECV'

[FRONTEND]
22. GET /api/devices (polling) → nhận danh sách với is_online, last_seen
23. Dashboard hiển thị trạng thái online, nhiệt độ/độ ẩm mới nhất
```

**Files liên quan:** [firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp](../firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp), [firmware/gateway-node/lib/forwarder/forwarder.cpp](../firmware/gateway-node/lib/forwarder/forwarder.cpp), [backend/src/services/mqttDataService.ts](../backend/src/services/mqttDataService.ts), [backend/src/routes/data.routes.ts](../backend/src/routes/data.routes.ts)

---

### Flow 4: Kiểm Soát Thiết Bị Hợp Lệ / Không Hợp Lệ

**Thiết bị hợp lệ (gateway active + sensor active, HMAC đúng, timestamp trong cửa sổ):**
```
→ Dữ liệu được lưu vào sensor_data
→ last_seen, fail_count reset về 0
→ Audit log: DATA_RECV
→ Dashboard hiển thị trạng thái online
```

**Thiết bị sai HMAC (secret key sai):**
```
→ 401 GATEWAY_AUTH_FAIL / SENSOR_AUTH_FAIL
→ fail_count += 1
→ Audit log: GATEWAY_AUTH_FAIL / SENSOR_AUTH_FAIL với reason=HMAC_MISMATCH
→ Nếu fail_count >= 5: status='blocked', audit log: DEVICE_BLOCKED
```

**Thiết bị gửi lại packet cũ (timestamp quá hạn > 300s):**
```
→ 401
→ Audit log: REPLAY_ATTACK với reason=TIMESTAMP_EXPIRED
→ fail_count += 1 → có thể dẫn đến block
```

**Thiết bị bị blocked:**
```
→ HMAC vẫn có thể đúng, nhưng sau khi check status:
→ 403 DEVICE_BLOCKED (HTTP) hoặc drop packet (MQTT)
→ Không có fail_count tăng thêm ở bước này
```

**Thiết bị inactive (chưa được active):**
```
→ HMAC đúng, nhưng status='inactive'
→ 403 DEVICE_NOT_ACTIVE
→ Dữ liệu không được lưu
```

**Sensor giả mạo là gateway (type mismatch):**
```
→ HMAC đúng, nhưng device_type != "gateway"
→ 403 INVALID_DEVICE_TYPE
→ Audit log: PRIVILEGE_ESCALATION
```

**Files liên quan:** [backend/src/middleware/validateDevice.ts](../backend/src/middleware/validateDevice.ts), [backend/src/routes/data.routes.ts](../backend/src/routes/data.routes.ts), [backend/src/services/auditLogger.ts](../backend/src/services/auditLogger.ts)

---

### Flow 5: Dashboard Hiển Thị Trạng Thái Thiết Bị

```
1. startHeartbeatMonitor() (server.ts) khởi động khi backend start
2. Cứ mỗi 30 giây, deviceStatus.ts chạy tick():
   SELECT id FROM devices WHERE TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60
   → Update in-memory Set<number> onlineDeviceIds
3. Frontend gọi GET /api/devices (polling)
4. Backend SQL trả về is_online = (TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60)
5. Frontend:
   - OnlineIndicator component hiển thị chấm xanh nếu last_seen < 60s
   - Cột "Hoạt động": hiển thị "30s ago", "5m ago", "2h ago", hoặc "Chưa kết nối"
6. GET /api/dashboard/stats trả về:
   { total_gateway, total_sensor, gateway_online, sensor_online, total_data_points }
7. Nếu thiết bị không gửi dữ liệu trong 60 giây:
   - last_seen không được update
   - is_online = FALSE
   - Dashboard chuyển sang trạng thái offline (chấm đỏ)
```

**Files liên quan:** [backend/src/services/deviceStatus.ts](../backend/src/services/deviceStatus.ts), [backend/src/routes/devices.ts](../backend/src/routes/devices.ts#L90-L110), [frontend/src/features/devices/components/OnlineIndicator.tsx](../frontend/src/features/devices/components/OnlineIndicator.tsx)

---

## 6. Luồng Dữ Liệu Tổng Thể — Hai Tầng MQTT

### 6.1 Lý Do Tách Hai Broker

| | Broker 1 | Broker 2 |
|---|---|---|
| **Cổng** | 1883 | 1884 |
| **Container** | iot-mosquitto-1 | iot-mosquitto-2 |
| **Tầng** | Sensor Node → Gateway | Gateway → Backend Server |
| **Topic** | `local/sensors/<id>/data` | `gateway/<id>/data` |
| **Authen** | Anonymous (allow_anonymous true) | Anonymous |
| **Mục đích** | Giao tiếp trong mạng LAN nội bộ giữa các thiết bị nhỏ | Giao tiếp bảo mật hơn, Backend chỉ nghe ở đây |

Việc tách 2 broker đảm bảo:
- **Phân tách trách nhiệm:** Sensor Node không cần kết nối trực tiếp đến broker backend. Chỉ Gateway mới được biết địa chỉ Broker 2.
- **Lớp xác thực bổ sung ở Gateway:** Gateway xác thực HMAC sensor trước khi forward, không cho phép dữ liệu sensor chưa xác thực đến backend.
- **Giảm tải Broker 2:** Chỉ các gateway (số lượng ít) kết nối Broker 2, không phải toàn bộ sensor nodes.

### 6.2 Dữ Liệu Đi Qua Từng Broker

**Broker 1 – Gói tin Sensor → Gateway:**
```json
{
  "sensor_id": "ESP32-SN-CBF05770",
  "sn_timestamp": 1718876543,
  "sn_hmac": "a3f8c2d1...(64 hex chars)",
  "sensor_ip": "192.168.1.25",
  "data": {
    "temperature": 28.5,
    "humidity": 72.3
  }
}
```
Topic: `local/sensors/ESP32-SN-CBF05770/data`

**Broker 2 – Gói tin Gateway → Backend (sau khi Gateway wrap thêm thông tin):**
```json
{
  "gateway_id": "ESP32-GW-78867B14",
  "gateway_ip": "192.168.1.10",
  "gw_timestamp": 1718876544,
  "gw_hmac": "d7e9a1b2...(64 hex chars)",
  "sensor_payload": {
    "sensor_id": "ESP32-SN-CBF05770",
    "sn_timestamp": 1718876543,
    "sn_hmac": "a3f8c2d1...(64 hex chars)",
    "sensor_ip": "192.168.1.25",
    "data": {
      "temperature": 28.5,
      "humidity": 72.3
    }
  }
}
```
Topic: `gateway/ESP32-GW-78867B14/data`

### 6.3 Cơ Chế Lấy Danh Sách Sensor Tại Gateway

Gateway không hardcode cứng toàn bộ sensor — nó có cơ chế lấy danh sách động từ backend:

File: [firmware/gateway-node/lib/sensor_registry/sensor_registry.cpp](../firmware/gateway-node/lib/sensor_registry/sensor_registry.cpp)

```
Mỗi 5 phút hoặc khi gặp sensor không biết:
  Gateway gửi GET /api/device/sensors?gateway_id=X&gw_timestamp=Y&gw_hmac=Z
  Backend xác thực HMAC gateway rồi trả về:
  { sensors: [ {device_id, secret_key}, ... ] }  ← chỉ trả sensor có status='active'
  Gateway lưu vào RAM (tối đa 16 entries)
  
Ưu tiên tìm trong dynamic list → fallback sang KNOWN_SENSORS trong config_gw.h
```

API: [backend/src/routes/sensors.routes.ts](../backend/src/routes/sensors.routes.ts)

---

## 7. Bảng Đối Chiếu Mục Tiêu và Phần Đã Triển Khai

| Mục tiêu | Cách hệ thống triển khai | File/API/Module liên quan | Kết quả đạt được | Ghi chú / Hạn chế |
|---|---|---|---|---|
| **Quản lý danh tính thiết bị** | device_id dạng ESP32-SN/GW-XXXXXXXX, secret_key 32 bytes random; lưu trong bảng `devices`; phân loại theo `device_type` | `devices.ts` (POST /register), DB schema | Hoàn thành tốt | Secret key chỉ trả về 1 lần, không thể query lại |
| **Đăng ký thiết bị** | POST /api/devices/register yêu cầu JWT + role admin/operator; sinh ID và secret tự động | `devices.ts`, `AddDeviceModal.tsx` | Hoàn thành tốt | Chưa có rotate secret key |
| **Xác thực thiết bị** | HMAC-SHA256 + timestamp window ±300s; xác thực 2 lớp (gateway + sensor); timingSafeEqual chống timing attack | `hmacService.ts`, `validateDevice.ts`, `mqttDataService.ts` | Hoàn thành tốt | Broker 1 vẫn anonymous (không xác thực MQTT level) |
| **Kiểm soát quyền truy cập thiết bị** | Kiểm tra status (active/blocked/inactive), device_type, auto-block sau 5 lần fail | `data.routes.ts`, `validateDevice.ts`, `mqttDataService.ts` | Hoàn thành tốt | Chưa có rate limit per device ID |
| **Phân quyền người dùng Dashboard** | RBAC 3 roles (admin/operator/viewer); `verifyJWT` + `requireRole` middleware; `usePermissions` hook ở frontend | `rbac.ts`, `verifyJWT.ts`, `usePermissions.ts` | Hoàn thành tốt | Không có refresh token (JWT 8h, hết hạn phải đăng nhập lại) |
| **Hiển thị trạng thái online/offline** | `last_seen` < 60 giây = online; heartbeat monitor 30s cập nhật cache; Frontend polling GET /api/devices | `deviceStatus.ts`, `devices.ts` (SQL is_online), `OnlineIndicator.tsx` | Hoàn thành tốt | Chưa dùng WebSocket/SSE, cần polling |
| **Ghi log/audit log** | Bảng `audit_log` 9 loại event; ghi cả HMAC fail, replay attack, privilege escalation, CRUD thiết bị/người dùng | `auditLogger.ts`, `audit.ts` | Hoàn thành khá đầy đủ | DATA_RECV giữ 150 bản/device để tránh bloat; không log đầy đủ thao tác người dùng (login được log qua notification, không phải audit) |
| **Lưu dữ liệu cảm biến** | Bảng `sensor_data` (device_id, gateway_id, payload JSON, received_at); giữ 150 bản gần nhất | `data.routes.ts`, `mqttDataService.ts`, DB schema | Hoàn thành tốt | Giới hạn 150 bản/sensor → dữ liệu lịch sử dài hạn không được lưu |
| **Từ chối thiết bị không hợp lệ** | HMAC fail → 401; timestamp expired → 401 REPLAY_ATTACK; blocked → 403; inactive → 403; type mismatch → 403 PRIVILEGE_ESCALATION | `validateDevice.ts`, `data.routes.ts`, `mqttDataService.ts` | Hoàn thành tốt | Cả HTTP và MQTT path đều được xử lý |

---

## 8. Đánh Giá Mức Độ Hoàn Thành

### 8.1 Những Phần Đã Hoàn Thành Tốt

1. **Xác thực HMAC-SHA256 hai lớp:** Cả ở Gateway (firmware) và Backend đều xác thực HMAC. Dữ liệu không qua được gateway nếu sensor không hợp lệ; không qua được backend nếu gateway không hợp lệ. Đây là điểm mạnh cốt lõi của hệ thống.

2. **Chống replay attack:** Cửa sổ timestamp ±300 giây được kiểm tra ở cả firmware gateway và backend server. Packet cũ bị từ chối và ghi log `REPLAY_ATTACK`.

3. **Auto-block thiết bị:** Sau 5 lần xác thực thất bại liên tiếp, hệ thống tự động block thiết bị, ghi log `DEVICE_BLOCKED`, và từ chối mọi request tiếp theo.

4. **RBAC rõ ràng, nhất quán giữa frontend và backend:** Quyền được định nghĩa ở một nơi (middleware backend) và được map sang UI (usePermissions hook). Người dùng không thấy UI khi không có quyền, và nếu bypass UI thì backend vẫn từ chối.

5. **Audit log chi tiết:** Ghi lại các sự kiện bảo mật quan trọng (HMAC fail, replay attack, privilege escalation, block/unblock, đăng ký/xóa thiết bị) kèm IP, user agent, timestamp.

6. **Bảo mật HTTP cơ bản:** JWT trong HttpOnly cookie (chống XSS), SameSite strict (chống CSRF), Helmet.js headers, CORS giới hạn origin, rate limiting ba tầng, body size limit 10kb.

7. **Timing-safe comparison:** Cả backend (Node.js `crypto.timingSafeEqual`) và firmware (hàm `safeEq64` constant-time) đều dùng so sánh constant-time để chống timing attack khi verify HMAC.

8. **Dynamic sensor registry ở Gateway:** Gateway tự động lấy danh sách sensor từ backend mỗi 5 phút — không cần reflash firmware mỗi khi thêm sensor mới (chỉ cần kích hoạt trên dashboard).

### 8.2 Những Phần Còn Ở Mức Cơ Bản

1. **Broker 1 và Broker 2 đều anonymous:** File `mosquitto.conf` của cả 2 broker đều có `allow_anonymous true`. Bất kỳ thiết bị nào trong mạng đều có thể kết nối và publish lên broker mà không bị từ chối ở tầng MQTT. Xác thực chỉ xảy ra ở tầng ứng dụng (HMAC trong payload).

2. **Không có refresh token:** JWT 8 giờ và không có cơ chế refresh. Người dùng phải đăng nhập lại sau 8 giờ; không có khả năng thu hồi token trước hạn nếu bị lộ.

3. **Secret key cố định:** Một khi đã flash vào firmware, secret key không thể rotate mà không cần reflash. Không có API rotate/regenerate secret key.

4. **Dữ liệu lịch sử bị giới hạn:** Mỗi sensor chỉ giữ 150 bản ghi gần nhất. Đây là quyết định thiết kế có chủ đích nhưng hạn chế phân tích dài hạn.

5. **Không có TLS cho MQTT:** Kết nối MQTT giữa Sensor → Broker 1, Gateway → Broker 2 là plaintext. Dữ liệu và HMAC có thể bị nghe lén trong mạng.

6. **Frontend polling thay vì real-time:** Dashboard cần reload hoặc polling để cập nhật trạng thái thiết bị, không có WebSocket hay Server-Sent Events cho real-time.

### 8.3 Điểm Có Thể Cải Tiến Nếu Phát Triển Tiếp

| Cải tiến | Mô tả |
|---|---|
| **TLS cho MQTT** | Cấu hình mosquitto với `cafile`, `certfile`, `keyfile` — mã hóa traffic giữa thiết bị và broker |
| **MQTT authentication** | Thêm `password_file` trong mosquitto.conf, firmware dùng username/password khi connect |
| **Refresh token** | Thêm bảng `refresh_tokens`, phát kèm access token 15 phút + refresh token 7 ngày |
| **Rotate secret key** | API `POST /api/devices/:id/rotate-key` sinh secret mới, cập nhật DB, firmware poll khi nhận lỗi HMAC_MISMATCH |
| **Rate limit per device** | Giới hạn số request theo `device_id` thay vì chỉ theo IP (tránh trường hợp nhiều thiết bị cùng IP) |
| **Chống replay nâng cao** | Lưu nonce/timestamp đã dùng trong Redis ngắn hạn thay vì chỉ kiểm tra cửa sổ 300s |
| **Mã hóa payload** | AES-GCM mã hóa trường `data` trước khi gửi, backend giải mã |
| **Audit log đăng nhập** | Ghi audit log cho LOGIN/LOGOUT thay vì chỉ notification |
| **WebSocket cho dashboard** | Real-time update trạng thái thiết bị thay vì polling |
| **Phân quyền chi tiết hơn** | Operator chỉ quản lý thiết bị do mình tạo (created_by = user.id); phân nhóm thiết bị theo location |
| **Alerting** | Gửi email/webhook khi thiết bị offline quá 5 phút hoặc bị auto-block |

---

*Báo cáo được tổng hợp từ phân tích trực tiếp source code tại workspace `e:/WorkSpace/managerDeviceIoT-RBAC`. Ngày tạo: 2026-06-20.*
