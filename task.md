
## Tên đề tài: Hệ thống quản lý thiết bị IoT và phân quyền truy cập
### Mục tiêu: 
Xây dựng hệ thống IoT có chức năng quản lý danh tính thiết bị, xác thực thiết bị khi kết nối và kiểm soát quyền truy cập cơ bản, đảm bảo chỉ các thiết bị hợp lệ mới được phép gửi dữ liệu và truy cập tài nguyên của hệthống.
### Yêu cầu hệ thống
Xây dựng hệ thống gồm: IoT Device – Server – Database– Dashboard
Thiết bị IoT có Device ID duy nhất
Server hỗ trợ:
- Đăng ký thiết bị
- Xác thực thiết bị khi gửi dữ liệu
- Kiểm soát thiết bị được phép truy cập
Dashboard hiển thị: danh sách thiết bị + trạng thái thiết bị (online/offline)
- Có thể triển khai
### Yêu cầu bảo mật
Mỗi thiết bị có Device ID + token/secret key
Tùy chọn: Có thể triển khai Hệ thống theo cơ chế điều
khiển truy nhập dựa trên RBAC (Role-Based Access
Control) hoặc ABAC (Attribute-Based Access Control).
Khi gửi dữ liệu phải kèm: device_id + token + data
Server phải: kiểm tra thiết bị hợp lệ trước khi xử lý và từ
chối thiết bị không đăng ký hoặc sai token
Chống các hành vi: giả mạo thiết bị + truy cập trái phép API
### Threat Model & Security
Sinh viên bắt buộc xác định các tấn công có thể thực hiện
Phân tích: cơ chế xác thực device_id + token hoạt động
thế nào, điểm yếu nếu token bị lộ.

---

## Danh sách 15 Task theo thứ tự tiến độ

---

### Task 1 – Thiết lập môi trường & cấu trúc dự án

**Branch:** `setup/project-environment`

**Mô tả:**
Khởi tạo toàn bộ nền tảng kỹ thuật cho dự án trước khi viết bất kỳ code nghiệp vụ nào.

**Nội dung cần làm:**
- Tạo cấu trúc thư mục monorepo: `backend/`, `frontend/`, `firmware/`, `docs/`
- Khởi tạo `backend/` với `npm init`, cài toàn bộ dependencies: `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `mqtt`, `helmet`, `express-rate-limit`, `ws`, `dotenv`, `uuid`, `cors`
- Tạo file `.env.example` với các biến: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `MQTT_HOST`, `PORT`
- Tạo `.gitignore` (loại trừ `.env`, `node_modules`, `config.h`)
- Cấu hình `docker-compose.yml` với 3 service: `mysql:8.0`, `mosquitto:2`, `backend`
- Cấu hình Mosquitto (`mosquitto.conf`): listener 1883, allow_anonymous true (local dev)
- Kiểm tra: `docker-compose up` → MySQL và Mosquitto khởi động thành công

---

### Task 2 – Thiết kế & khởi tạo Database Schema

**Branch:** `db/schema-migration`

**Mô tả:**
Tạo toàn bộ schema MySQL với 5 bảng, quan hệ, index và dữ liệu seed admin ban đầu.

**Nội dung cần làm:**
- Viết file `backend/src/config/db.js` – connection pool dùng `mysql2/promise`
- Viết file migration SQL tạo 5 bảng:
  - `users` (id, username, password_hash, role ENUM('admin','operator','viewer'), created_at, last_login)
  - `devices` (id, device_id UQ, device_name, device_type ENUM('sensor','gateway'), secret_key, status ENUM('inactive','active','blocked'), location, fail_count, last_seen, created_by FK→users.id)
  - `sensor_data` (id BIGINT AI, device_id FK, gateway_id FK, payload JSON, received_at)
  - `device_tokens` (id BIGINT AI, device_id FK, token_hash, expires_at, revoked BOOL)
  - `audit_log` (id BIGINT AI, event_type, device_id FK nullable, ip_address, user_agent, details JSON, created_at)
- Tạo đúng INDEX theo tài liệu: `devices(device_id)`, `devices(status)`, `sensor_data(device_id, received_at DESC)`, `audit_log(event_type, created_at DESC)`
- Seed 1 user admin: `bcrypt.hash('admin123', 12)` → INSERT vào bảng users
- Kiểm tra: `SHOW TABLES` → 5 bảng, `SELECT * FROM users` → thấy admin

---

### Task 3 – Backend: HMAC Service & Middleware xác thực thiết bị

**Branch:** `be/hmac-auth-service`

**Mô tả:**
Xây dựng lõi bảo mật của hệ thống – service xác thực HMAC-SHA256 hai cấp (Gateway + Sensor) và middleware tích hợp vào Express.

**Nội dung cần làm:**
- Viết `src/services/hmacService.js`:
  - `verifyGatewayHMAC(gateway_id, gw_timestamp, gw_hmac)` – tra DB, tính `HMAC-SHA256(secret, gw_id:gw_timestamp)`, so sánh `crypto.timingSafeEqual()`
  - `verifyDeviceHMAC(sensor_id, sn_timestamp, sn_hmac)` – tương tự cho sensor
  - Kiểm tra timestamp window: `Math.abs(Date.now()/1000 - timestamp) > 300` → reject
- Viết `src/middleware/validateDevice.js`:
  - Xác thực Gateway HMAC (cấp 1) → fail → 401 `GATEWAY_AUTH_FAIL` + ghi audit_log + tăng GW fail_count
  - Xác thực Sensor HMAC (cấp 2) → fail → 401 `SENSOR_AUTH_FAIL` + ghi audit_log + tăng SN fail_count
  - Auto-block: nếu `fail_count >= 5` → `UPDATE devices SET status='blocked'` + ghi `DEVICE_BLOCKED`
- Viết `src/services/auditLogger.js` – hàm `log(event_type, device_id, ip, details)`
- Unit test bằng Postman: gửi HMAC đúng → 200, HMAC sai → 401, timestamp cũ → 401

---

### Task 4 – Backend: Admin Authentication (Login & JWT)

**Branch:** `be/admin-authentication`

**Mô tả:**
Xây dựng hệ thống xác thực admin dashboard với JWT, bcrypt và middleware bảo vệ route.

**Nội dung cần làm:**
- Viết `src/routes/auth.js`:
  - `POST /api/auth/login`: nhận `{username, password}` → `bcrypt.compare()` → ký JWT (expires 8h) → set `httpOnly` cookie `token`
  - `POST /api/auth/logout`: clear cookie
  - `GET /api/auth/me`: trả thông tin user từ JWT
- Viết `src/middleware/verifyJWT.js`: đọc cookie `token` → `jwt.verify()` → gắn `req.user`
- Viết `src/middleware/rbac.js`: `requireRole(...roles)` → kiểm tra `req.user.role`
- Bảo vệ toàn bộ admin route bằng `verifyJWT` middleware
- Kiểm tra: login đúng → nhận cookie JWT, login sai → 401, gọi protected route không có token → 401

---

### Task 5 – Backend: Device Management API (CRUD Thiết Bị)

**Branch:** `be/device-management`

**Mô tả:**
Xây dựng đầy đủ API quản lý thiết bị cho admin: đăng ký mới, xem danh sách, khoá/mở khoá, xoá.

**Nội dung cần làm:**
- Viết `src/routes/devices.js`:
  - `POST /api/devices/register` (admin/operator): sinh `device_id = ESP32-{SN|GW}-{8 hex ngẫu nhiên}`, `secret_key = crypto.randomBytes(32).toString('hex')`, INSERT DB, ghi `DEVICE_REGISTER` vào audit_log, **trả credentials 1 lần duy nhất**
  - `GET /api/devices` (JWT): lấy danh sách + tính online/offline từ `last_seen < 60s`
  - `GET /api/devices/:id` (JWT): chi tiết thiết bị + 10 bản ghi sensor_data gần nhất
  - `PATCH /api/devices/:id/status` (admin/operator): đổi `status` (active/blocked)
  - `DELETE /api/devices/:id` (admin): xoá cascade thiết bị + sensor_data + device_tokens
- Tất cả queries dùng parameterized statements (`db.execute(sql, [params])`)
- Kiểm tra: đăng ký → thấy credentials, khoá → status=blocked, xoá → không còn trong DB

---

### Task 6 – Backend: Data Ingestion API (Nhận dữ liệu từ Gateway)

**Branch:** `be/data-ingestion`

**Mô tả:**
Xây dựng endpoint trung tâm nhận dữ liệu từ Gateway ESP32, xác thực 2 cấp HMAC và lưu vào DB.

**Nội dung cần làm:**
- Viết `src/routes/data.js`:
  - `POST /api/device/data`: sử dụng middleware `validateDevice` (xác thực GW + SN HMAC)
  - Kiểm tra RBAC: `gateway_id` phải có `device_type='gateway'`, `sensor_id` phải có `device_type='sensor'`
  - Kiểm tra cả hai thiết bị có `status='active'`
  - `INSERT sensor_data` với `{sensor_id, gateway_id, payload JSON, received_at}`
  - `UPDATE devices SET last_seen=NOW(), fail_count=0` cho cả Gateway lẫn Sensor
  - `INSERT audit_log` với `event_type='DATA_RECV'`
  - Trả `200 {success: true, sensor_id, gateway_id, received_at}`
- Xử lý đầy đủ các trường hợp lỗi: thiếu field → 400, HMAC sai → 401, không tìm thấy thiết bị → 403, thiết bị bị khoá → 403
- Kiểm tra end-to-end bằng Postman với payload đúng format tài liệu mục 5.2

---

### Task 7 – Backend: Dashboard Stats & Audit Log API

**Branch:** `be/dashboard-audit-api`

**Mô tả:**
Xây dựng các API phục vụ Dashboard: thống kê tổng quan, lịch sử dữ liệu cảm biến và nhật ký bảo mật.

**Nội dung cần làm:**
- Viết `src/routes/dashboard.js`:
  - `GET /api/dashboard/stats`: tổng Gateway, tổng Sensor, số đang online (riêng GW & SN), tổng data points
  - `GET /api/devices/:id/data`: lịch sử sensor_data, có phân trang (`?page=1&limit=50`), kèm `gateway_id` mỗi record
- Viết `src/routes/audit.js`:
  - `GET /api/audit-log`: danh sách sự kiện, filter theo `event_type`, `device_id`, `from`, `to`, sắp xếp DESC
- Viết `src/services/deviceStatus.js`:
  - `isOnline(last_seen)`: trả `true` nếu `last_seen < 60s`
  - Heartbeat monitor: cron mỗi 30s kiểm tra thiết bị quá 60s chưa ping → cập nhật status display (không đổi DB, chỉ dùng trong API response)
- Kiểm tra: gọi `/stats` → số đúng, gọi `/audit-log` → thấy các event type

---

### Task 8 – Backend: Security Hardening

**Branch:** `be/security-hardening`

**Mô tả:**
Tăng cường bảo mật toàn bộ backend: HTTP security headers, rate limiting, input validation và CORS.

**Nội dung cần làm:**
- Cấu hình `helmet()` trong `app.js`: bảo vệ XSS, clickjacking, MIME sniffing
- Cấu hình `express-rate-limit`:
  - Auth endpoint `/api/auth/login`: max 10 req/15 phút/IP
  - Device data endpoint `/api/device/data`: max 60 req/phút/IP
  - Admin API: max 100 req/15 phút/IP
- Cấu hình CORS: chỉ cho phép origin của Next.js frontend (`http://localhost:3000`)
- Input validation: kiểm tra đủ fields bắt buộc trong mọi route, sanitize strings, kiểm tra độ dài
- Đảm bảo không bao giờ log `secret_key` hoặc credentials ra console/file
- Cấu hình `src/config/env.js`: validate tất cả biến môi trường khi khởi động, crash nếu thiếu
- Kiểm tra: brute force login 11 lần → bị rate limit 429, gửi request thiếu field → 400

---

### Task 9 – Frontend: Setup Next.js & Trang Login

**Branch:** `fe/setup-login`

**Mô tả:**
Khởi tạo project Next.js 14 App Router, cài dependencies, cấu hình Tailwind CSS và xây dựng trang đăng nhập admin.

**Nội dung cần làm:**
- Khởi tạo Next.js 14 với App Router: `npx create-next-app@14 frontend --typescript --tailwind --app`
- Cài dependencies: `swr`, `axios`, `recharts`, `lucide-react`, `socket.io-client`
- Cấu hình `axios` instance với baseURL và interceptor tự thêm JWT cookie
- Tạo `middleware.ts` Next.js: redirect về `/login` nếu không có JWT cookie
- Xây dựng trang `/login`:
  - Form username + password với validation
  - Gọi `POST /api/auth/login` → lưu cookie → redirect về `/`
  - Hiển thị lỗi "Sai tên đăng nhập hoặc mật khẩu" khi 401
- Xây dựng `Sidebar.tsx`: navigation (Dashboard / Devices / Audit / Users), hiển thị username + role, nút logout
- Xây dựng layout chung `app/(dashboard)/layout.tsx` bao gồm Sidebar
- Kiểm tra: login đúng → vào được dashboard, login sai → hiện lỗi, truy cập `/` khi chưa login → redirect `/login`

---

### Task 10 – Frontend: Dashboard & Danh Sách Thiết Bị

**Branch:** `fe/dashboard-device-list`

**Mô tả:**
Xây dựng trang Dashboard tổng quan với stats cards và trang `/devices` hiển thị danh sách đầy đủ thiết bị với trạng thái real-time.

**Nội dung cần làm:**
- Xây dựng component `StatsCard.tsx`: card thống kê với icon (lucide-react) và số
- Xây dựng trang `/` (Dashboard):
  - 4 cards: Tổng Gateway, Tổng Sensor, Gateway Online, Sensor Online
  - Dùng SWR polling mỗi 10s từ `GET /api/dashboard/stats`
- Xây dựng component `DeviceStatusBadge.tsx`: badge active=xanh / inactive=xám / blocked=đỏ
- Xây dựng component `OnlineIndicator.tsx`: tính online từ `last_seen`, xanh chớp nếu < 60s
- Xây dựng trang `/devices`:
  - Bảng hiển thị: Device ID, Tên, Loại (gateway/sensor), Vị trí, Status badge, Online indicator, Lần cuối kết nối
  - Tách Gateway và Sensor thành 2 tab hoặc 2 section riêng
  - Nút Lock/Unlock gọi `PATCH /api/devices/:id/status` → cập nhật UI ngay
  - Nút Delete với xác nhận → gọi `DELETE /api/devices/:id`
  - SWR polling mỗi 10s
- Xây dựng `ConfirmDialog.tsx`: modal xác nhận trước khi xoá/khoá
- Kiểm tra: danh sách hiển thị đúng, Lock → badge đổi đỏ, Unlock → đổi xanh

---

### Task 11 – Frontend: Đăng Ký Thiết Bị Mới

**Branch:** `fe/device-registration`

**Mô tả:**
Xây dựng form đăng ký thiết bị mới và modal hiển thị credentials một lần duy nhất sau khi tạo thành công.

**Nội dung cần làm:**
- Xây dựng trang `/devices/new`:
  - Form: Tên thiết bị, Loại (sensor/gateway), Vị trí
  - Validation: các field bắt buộc, tên không được trống
  - Submit → `POST /api/devices/register`
- Xây dựng component `RegisterModal.tsx`:
  - Hiển thị `device_id` và `secret_key` với font monospace
  - Nút **Copy** cho từng field (Clipboard API)
  - Cảnh báo đỏ: "Chỉ hiển thị 1 lần – Hãy lưu lại trước khi đóng!"
  - Nút "Tôi đã lưu – Đóng" → redirect về `/devices`
  - Không có nút X để đóng modal (buộc phải nhấn nút confirm)
- Sau khi đóng modal: thiết bị xuất hiện trong danh sách `/devices` với status `inactive`
- Kiểm tra: tạo thiết bị → modal hiện credentials, đóng modal → không còn thấy secret_key, thiết bị xuất hiện trong list

---

### Task 12 – Frontend: Chi Tiết Thiết Bị & Biểu Đồ Cảm Biến

**Branch:** `fe/device-detail-charts`

**Mô tả:**
Xây dựng trang chi tiết từng thiết bị với thông tin đầy đủ và biểu đồ nhiệt độ/độ ẩm theo thời gian thực.

**Nội dung cần làm:**
- Xây dựng trang `/devices/[id]`:
  - Phần info: Device ID, Tên, Loại, Vị trí, Status badge, Online indicator, Gateway liên kết (nếu là sensor)
  - Nút Lock/Unlock/Delete ngay trên trang chi tiết
  - Dùng `GET /api/devices/:id` + SWR polling 10s
- Xây dựng component `SensorChart.tsx` (chỉ hiển thị nếu thiết bị là sensor):
  - Recharts `LineChart` với 2 đường: nhiệt độ (°C, màu đỏ cam) và độ ẩm (%, màu xanh)
  - Trục X: thời gian (`received_at`), Trục Y: giá trị
  - Tooltip hiển thị đầy đủ cả nhiệt độ và độ ẩm khi hover
  - Có thể chọn khoảng thời gian: 1h / 6h / 24h
  - Dùng `GET /api/devices/:id/data` + SWR polling 10s
- Bảng dữ liệu gần nhất: 20 bản ghi mới nhất, kèm gateway_id, received_at
- Kiểm tra: mở trang sensor → thấy biểu đồ với 2 đường, dữ liệu tự cập nhật mỗi 10s

---

### Task 13 – Frontend: Trang Audit Log & Quản Lý Users

**Branch:** `fe/audit-log-users`

**Mô tả:**
Xây dựng trang nhật ký bảo mật với bộ lọc và màu sắc theo loại sự kiện, và trang quản lý tài khoản dashboard.

**Nội dung cần làm:**
- Xây dựng component `AuditLogTable.tsx`:
  - Màu theo event_type: AUTH_FAIL/BLOCKED = đỏ, AUTH_SUCCESS/DATA_RECV = xanh, DEVICE_REGISTER = vàng
  - Hiển thị: Thời gian, Event Type, Device ID, IP Address, Chi tiết (JSON collapsible)
- Xây dựng trang `/audit`:
  - Bảng dùng `AuditLogTable.tsx`
  - Bộ lọc: theo `event_type` (dropdown), `device_id` (input), khoảng thời gian (date picker)
  - Phân trang (10/25/50 records per page)
  - Auto-refresh mỗi 30s
  - Dùng `GET /api/audit-log` với SWR
- Xây dựng trang `/users` (admin only):
  - Danh sách tài khoản (username, role, created_at, last_login)
  - Form tạo tài khoản mới (operator/viewer)
  - Nút đổi mật khẩu / xoá tài khoản
- Kiểm tra: trang audit hiện đúng màu, filter hoạt động, `/users` chỉ admin mới vào được

---

### Task 14 – Firmware ESP32: Sensor Node

**Branch:** `hw/sensor-node-firmware`

**Mô tả:**
Viết toàn bộ firmware cho ESP32 Sensor Node: đọc cảm biến DHT22, tính HMAC-SHA256 và gửi dữ liệu qua MQTT lên Gateway.

**Nội dung cần làm:**
- Tạo cấu trúc thư mục `firmware/sensor_node/`
- Viết `config.h`: khai báo `DEVICE_ID`, `SECRET_KEY`, `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`, `MQTT_PORT`, `SEND_INTERVAL 5000`
- Viết `wifi_manager.ino`: kết nối WiFi, tự động reconnect khi mất kết nối, LED xanh GPIO 0
- Viết `ntp_sync.ino`: `configTime(7*3600, 0, "pool.ntp.org")`, hàm `getCurrentTimestamp()` trả Unix timestamp
- Viết `hmac.ino`: `computeHMAC(key, message)` dùng `mbedtls_md_hmac`, trả hex string 64 ký tự
- Viết `sensor_reader.ino`: khởi tạo DHT22 (GPIO 4, điện trở 10kΩ pull-up), hàm `readSensor()` trả `{temp, humidity}`
- Viết `mqtt_sender.ino`: kết nối MQTT broker, publish topic `local/sensors/[DEVICE_ID]/data` với payload `{sensor_id, sn_timestamp, sn_hmac, data:{temperature, humidity}}`
- Viết `main.ino`: setup → loop: đọc sensor → tính HMAC → publish MQTT → delay, LED đỏ GPIO 2 nháy khi gửi OK
- Kiểm tra Serial Monitor: `[WiFi] OK`, `[NTP] OK`, `[MQTT] Published: {payload}`, không có lỗi liên tục

---

### Task 15 – Firmware ESP32: Gateway Node & Integration Test

**Branch:** `hw/gateway-firmware-integration`

**Mô tả:**
Viết firmware Gateway ESP32 forward dữ liệu từ Sensor lên Backend, và thực hiện integration test toàn bộ luồng end-to-end bao gồm demo các kịch bản tấn công.

**Nội dung cần làm:**
- Tạo cấu trúc thư mục `firmware/gateway_node/`
- Viết `config_gw.h`: `GW_DEVICE_ID`, `GW_SECRET_KEY`, MQTT config, Backend URL
- Viết `mqtt_client.ino`: kết nối MQTT broker, subscribe wildcard topic `local/sensors/+/data`, LED xanh GPIO 0
- Viết `forwarder.ino`:
  - Parse JSON payload từ Sensor
  - Xác thực `sn_hmac` bằng sensor credentials đã cấu hình sẵn
  - Nếu hợp lệ: tính `gw_hmac = HMAC-SHA256(GW_SECRET, gw_id:gw_timestamp)`
  - Build payload đầy đủ: `{gateway_id, gw_timestamp, gw_hmac, sensor_payload:{...}}`
  - `HTTP POST /api/device/data` lên Backend, xử lý response
- Viết `main_gw.ino`: setup WiFi + NTP + MQTT, loop: `mqttClient.loop()` không delay
- **Integration Test toàn luồng:** Sensor → MQTT → Gateway (xác thực SN) → HTTPS → Backend (xác thực GW+SN) → MySQL → Dashboard
- **Demo attack scenarios:**
  1. Device Spoofing: `curl` với HMAC fake → kiểm tra 401 + audit_log
  2. Replay Attack: gửi lại request cũ sau 10 phút → kiểm tra 401 timestamp window
  3. Brute Force Block: script 6 request sai liên tiếp → kiểm tra lần 5+ bị 403, device bị blocked
  4. Unregistered Device: device_id không tồn tại → 403
  5. Privilege Escalation: sensor gọi gateway endpoint → 403 RBAC
- Kiểm tra cuối: hệ thống chạy liên tục ≥ 10 phút, dữ liệu vào DB đều đặn, Dashboard cập nhật real-time
