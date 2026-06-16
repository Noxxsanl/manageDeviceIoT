# Các thành phần trong hệ thống "bắt tay" với nhau như thế nào

> Mô tả chi tiết toàn bộ đường đi của dữ liệu và các "cuộc bắt tay" (handshake) giữa từng cặp thành phần, đối chiếu trực tiếp với code trong repo.

## 0. Bản đồ thành phần

```
┌────────────┐  MQTT (1883, plaintext)   ┌──────────────┐  HTTP POST    ┌─────────────┐
│ Sensor Node│ ───────────────────────▶ │ Gateway Node  │ ────────────▶ │   Backend    │
│ (ESP32)    │  publish + HMAC#1         │ (ESP32-S3)    │  + HMAC#2     │ (Express.js) │
└────────────┘                           └──────────────┘               └──────┬───────┘
       ▲                                        ▲                              │
       │ WiFi + NTP                             │ WiFi + NTP                   │ mysql2 (prepared
       ▼                                        ▼                              ▼  statements)
   Router/AP                              Mosquitto Broker                 ┌─────────┐
                                          (container "mosquitto")          │  MySQL  │
                                                                            └────┬────┘
                                                                                 │
        Browser ──▶ Nginx :80 ──▶ /api/* ──▶ Backend :5000 ◀────── REST (SWR, 10s) ┘
           │                  └──▶ /*    ──▶ Frontend (Next.js) :3000 ──▶ route.ts proxy ──▶ Backend
           ▼
       Dashboard (React) hiển thị devices, sensor_data, audit_log
```

5 thành phần chạy độc lập, được Docker Compose kết nối qua network `iot-network` ([docker-compose.yml](../docker-compose.yml)): `mysql`, `mosquitto`, `backend`, `frontend`, `nginx`. Hai firmware (`sensor-node`, `gateway-node`) chạy ngoài Docker, trên ESP32 thật, kết nối vào `mosquitto`/`backend` qua WiFi LAN.

---

## 1. Giai đoạn Provisioning — "Bắt tay lần đầu" giữa Admin và Thiết bị

Trước khi một thiết bị vật lý có thể nói chuyện với hệ thống, nó phải được **con người đăng ký trước** (zero-trust: thiết bị lạ không tự ý tham gia mạng).

1. Admin/operator đăng nhập Dashboard → mở modal "Add Device" → frontend gọi `POST /api/devices/register` (yêu cầu JWT hợp lệ + role `admin`/`operator`, xem [RBAC_CHI_TIET.md](RBAC_CHI_TIET.md)).
2. Backend ([devices.ts:36-49](../backend/src/routes/devices.ts#L36-L49)) tự sinh:
   - `device_id` = `ESP32-SN-XXXXXXXX` (sensor) hoặc `ESP32-GW-XXXXXXXX` (gateway), `XXXXXXXX` là 4 byte random hex viết hoa.
   - `secret_key` = 32 byte random → 64 ký tự hex (`crypto.randomBytes(32).toString("hex")`).
   - Ghi vào bảng `devices` với `status = 'inactive'` — **chưa có quyền gửi dữ liệu**.
3. Backend trả `secret_key` **đúng một lần duy nhất** trong response JSON ([devices.ts:60-72](../backend/src/routes/devices.ts#L60-L72)) — API không có endpoint nào đọc lại secret_key sau đó. Admin phải copy ngay lúc này.
4. Admin nạp `device_id` + `secret_key` vào firmware:
   - Sensor: hằng số `DEVICE_ID`, `SECRET_KEY` trong [firmware/sensor-node/include/config.h](../firmware/sensor-node/include/config.h).
   - Gateway: `GW_DEVICE_ID`, `GW_SECRET_KEY` trong [firmware/gateway-node/include/config_gw.h](../firmware/gateway-node/include/config_gw.h), **và** thêm một dòng vào bảng tĩnh `KNOWN_SENSORS[]` (cùng file, dòng 48-56) chứa `device_id` + `secret_key` của **từng sensor** mà gateway này được phép nhận dữ liệu — đây là "whitelist nội bộ" của gateway, hoàn toàn tách biệt với DB của backend.
5. Admin/operator gọi `PATCH /api/devices/:id/status {status:"active"}` để **kích hoạt** thiết bị — đây là bước "cấp quyền" tách rời khỏi bước "đăng ký", cho phép admin kiểm tra/cấu hình thiết bị xong rồi mới mở van cho nó gửi dữ liệu thật.

→ Provisioning là **thủ công, ngoài băng (out-of-band)**: secret_key được chuyển từ Backend → Admin → Firmware qua con người (copy/paste, build lại firmware), không có cơ chế cấp phát tự động/OTA an toàn. Đây là điểm hợp lý để đưa vào threat model (nếu secret_key bị lộ trong lúc copy/paste hoặc trong source code firmware build ra binary, attacker có thể giả mạo thiết bị — xem thêm phần 6).

---

## 2. Sensor Node ⇄ WiFi ⇄ NTP — chuẩn bị trước khi nói chuyện với ai cả

[firmware/sensor-node/src/main.cpp:29-39](../firmware/sensor-node/src/main.cpp#L29-L39), thứ tự bắt buộc trong `setup()`:

1. `wifiSetup()` — kết nối WiFi (SSID/PASS trong `config.h`).
2. `ntpSetup()` — đồng bộ giờ thực qua NTP. **Bắt buộc phải có trước khi gửi dữ liệu**, vì HMAC phụ thuộc vào timestamp UNIX hiện tại; lệch giờ → HMAC tính ra khác với server → bị từ chối. Trong `loop()` ([main.cpp:62-65](../firmware/sensor-node/src/main.cpp#L62-L65)), nếu NTP chưa sync thì sensor **chủ động không gửi** thay vì gửi một gói chắc chắn sai.
3. `sensorSetup()` — khởi tạo cảm biến DHT22.
4. `mqttSetup()` — cấu hình `PubSubClient` trỏ tới `MQTT_HOST:MQTT_PORT`.

Vòng lặp chính cứ mỗi `SEND_INTERVAL` (mặc định 5000ms) kiểm tra đủ 3 điều kiện (WiFi connected, NTP synced, MQTT connected) rồi mới đọc cảm biến và publish.

---

## 3. Sensor Node ⇄ Gateway Node — bắt tay qua MQTT (HMAC #1)

### 3.1. Sensor publish

[firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp](../firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp):

- Sensor kết nối broker với `clientId = "sn-" + DEVICE_ID`, **không có username/password MQTT** (broker cấu hình `allow_anonymous true` trong [mosquitto/mosquitto.conf:3](../mosquitto/mosquitto.conf#L3) — broker chỉ làm nhiệm vụ truyền tin, **không xác thực thiết bị**; toàn bộ việc xác thực dồn vào tầng ứng dụng bằng HMAC).
- Tạo message ký: `"<DEVICE_ID>:<timestamp>"`, tính `sn_hmac = HMAC-SHA256(SECRET_KEY, message)` bằng `mbedtls` ngay trên ESP32 ([hmac_util.cpp](../firmware/sensor-node/lib/hmac_util/hmac_util.cpp)).
- Đóng gói JSON và publish lên topic `local/sensors/<DEVICE_ID>/data`:

```json
{ "sensor_id": "ESP32-SN-AB12CD34", "sn_timestamp": 1750000000,
  "sn_hmac": "9f3a...64-hex-chars", "data": { "temperature": 27.5, "humidity": 61.2 } }
```

→ **Secret_key không bao giờ rời khỏi sensor** — chỉ giá trị băm `sn_hmac` được gửi đi, đúng nguyên lý "chứng minh biết secret mà không lộ secret" (giống ý tưởng HMAC trong OAuth/AWS SigV4).

### 3.2. Gateway nhận & xác thực cục bộ — `forwardSensorData()`

[firmware/gateway-node/lib/forwarder/forwarder.cpp](../firmware/gateway-node/lib/forwarder/forwarder.cpp), được gọi từ callback MQTT `onSensorMessage` trong [main.cpp:10-20](../firmware/gateway-node/src/main.cpp#L10-L20) khi gateway đã subscribe topic wildcard `local/sensors/+/data` ([mqtt_client.cpp:35-40](../firmware/gateway-node/lib/mqtt_client/mqtt_client.cpp#L35-L40)):

1. **Parse JSON**, lỗi → drop.
2. **Whitelist check** — `findSensorSecret(sensor_id)` tra trong `KNOWN_SENSORS[]` tĩnh đã nạp lúc build firmware. Sensor lạ (không có trong whitelist) → **bị huỷ ngay tại gateway**, không hề chạm tới backend → giảm tải và giảm bề mặt tấn công cho backend.
3. **Kiểm tra cửa sổ thời gian** ±`TIMESTAMP_WINDOW_SEC` (300s, [config_gw.h:40](../firmware/gateway-node/include/config_gw.h#L40)) — chống replay (gửi lại gói cũ đã bắt được).
4. **Verify HMAC của sensor**: gateway tự tính lại `HMAC-SHA256(secret_của_sensor_trong_whitelist, "sensor_id:timestamp")` và so sánh **constant-time** (`safeEq64`, [forwarder.cpp:18-23](../firmware/gateway-node/lib/forwarder/forwarder.cpp#L18-L23)) để tránh timing attack ngay ở firmware.
5. Nếu hợp lệ → gateway **tự ký thêm chữ ký của chính mình**: `gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "GW_DEVICE_ID:gw_timestamp_mới")` (timestamp này là thời điểm gateway forward, **khác** với `sn_timestamp` của sensor — hai lớp chữ ký, hai mốc thời gian độc lập).
6. Build payload tổng hợp gồm cả 2 cặp `(id, timestamp, hmac)` + `data` gốc, rồi `HTTPClient` POST tới `BACKEND_URL` ([config_gw.h:23](../firmware/gateway-node/include/config_gw.h#L23)).

→ Gateway đóng vai trò **"bộ lọc biên" (edge filter)**: chặn sớm sensor giả mạo/không quen biết ngay tại lớp mạng cục bộ, trước khi gói tin đi ra Internet/WAN tới backend.

---

## 4. Gateway Node ⇄ Backend — bắt tay HTTP với double-HMAC (HMAC #2)

### 4.1. Request gửi lên

```json
{
  "gateway_id": "ESP32-GW-11AA22BB", "gw_timestamp": 1750000005, "gw_hmac": "...",
  "sensor_id": "ESP32-SN-AB12CD34", "sn_timestamp": 1750000000, "sn_hmac": "...",
  "data": { "temperature": 27.5, "humidity": 61.2 }
}
```

`POST /api/device/data` **không cần cookie/JWT** — đây là kênh machine-to-machine riêng, tách hẳn khỏi kênh người dùng Dashboard. Trước khi vào middleware xác thực, request đã đi qua:

- `helmet()` (security headers), `express.json({limit:"10kb"})` (chặn payload khổng lồ), và **rate limiter riêng cho route này**: `deviceDataLimiter` = 60 req/phút/IP ([app.ts:37-44](../backend/src/app.ts#L37-L44)) — khác với `apiLimiter` (100 req/15 phút) áp cho các route quản trị khác, vì thiết bị IoT gửi dữ liệu đều đặn cần ngân sách request cao hơn.

### 4.2. `validateDevice` — backend **không tin gateway**, tự verify lại từ đầu

[backend/src/middleware/validateDevice.ts](../backend/src/middleware/validateDevice.ts) — đây là trái tim của cơ chế chống giả mạo, gồm **2 vòng kiểm tra độc lập, tuần tự**:

**Vòng 1 — Gateway HMAC** (`verifyGatewayHMAC`, [hmacService.ts:46-60](../backend/src/services/hmacService.ts#L46-L60)):
1. Truy vấn MySQL lấy `secret_key`, `status`, `fail_count` của `gateway_id` (`SELECT ... WHERE device_id = ?` — prepared statement, chống SQL injection).
2. Không tồn tại → `NOT_FOUND`.
3. `|now - gw_timestamp| > 300s` → `TIMESTAMP_EXPIRED` (chống replay **độc lập** với kiểm tra timestamp đã làm ở gateway — backend không tin gateway đã kiểm tra đúng).
4. Tính lại `HMAC-SHA256(secret_key_trong_DB, "gateway_id:gw_timestamp")`, so sánh bằng `crypto.timingSafeEqual` trên buffer đã decode hex ([hmacService.ts:29-38](../backend/src/services/hmacService.ts#L29-L38)) — constant-time, chống timing attack ở phía server.
5. Sai bất kỳ bước nào → ghi `audit_log` (`GATEWAY_AUTH_FAIL`), tăng `fail_count`, nếu `fail_count >= 5` → tự động set `status = 'blocked'` + log `DEVICE_BLOCKED`, trả `401`.

**Vòng 2 — Sensor HMAC** (`verifyDeviceHMAC`): **lặp lại chính xác quy trình trên** nhưng cho `sensor_id/sn_timestamp/sn_hmac`. Đây là điểm thiết kế quan trọng nhất cần nhấn mạnh: **backend xác minh lại HMAC gốc do sensor ký**, không chỉ tin vào việc "gateway đã nói sensor này hợp lệ". Nếu gateway bị compromise và cố forward dữ liệu giả với `sensor_id` thật nhưng không có `sn_hmac` đúng (vì không biết secret_key của sensor), backend vẫn từ chối ở vòng 2.

Cả 2 vòng pass → `req.gateway`, `req.sensor` được gắn (kèm `id`, `device_id`, `status` lấy từ DB) → `next()` sang route handler.

### 4.3. Route handler `data.routes.ts` — kiểm tra thuộc tính trước khi ghi DB

[backend/src/routes/data.routes.ts:26-61](../backend/src/routes/data.routes.ts#L26-L61):

1. Validate `data` phải là object (không phải mảng/null) — chặn payload sai hình dạng.
2. Một query `SELECT id, device_type, status FROM devices WHERE id IN (?, ?)` lấy cả 2 thiết bị **trong một round-trip DB**.
3. **Kiểm tra `device_type`**: id đóng vai gateway phải có `device_type='gateway'` trong DB, id đóng vai sensor phải có `device_type='sensor'` — chặn kiểu tấn công "hoán đổi vai" (ví dụ dùng secret của một sensor thật nhưng nhồi vào trường `gateway_id`).
4. **Kiểm tra `status`**: cả hai phải `active`; `blocked` hoặc `inactive` đều bị từ chối với mã lỗi riêng (`DEVICE_BLOCKED` / `DEVICE_NOT_ACTIVE`) — đây là chỗ "quyền do admin cấp ở mục 1" được thực thi thật.
5. Mọi điều kiện qua → `INSERT INTO sensor_data (device_id, gateway_id, payload)`, sau đó **reset `fail_count = 0` và cập nhật `last_seen = NOW()` cho cả gateway và sensor** ([data.routes.ts:77-80](../backend/src/routes/data.routes.ts#L77-L80)) — đây chính là cơ chế "heartbeat": **mỗi lần gửi dữ liệu hợp lệ = một lần báo "tôi vẫn online"**, không có gói heartbeat riêng.
6. Ghi `audit_log` (`DATA_RECV`) và trả `200`.

→ Tổng cộng có **2 chữ ký HMAC độc lập + 2 cửa sổ thời gian độc lập + 2 lượt truy vấn trạng thái DB** chỉ để chấp nhận một bản ghi dữ liệu cảm biến — đây là điểm các bạn nên nhấn mạnh khi thầy/cô hỏi "vì sao backend vẫn kiểm tra lại nếu gateway đã kiểm tra rồi" (xem [docs/CAU_HOI_PHAN_BIEN.md, Câu 4](CAU_HOI_PHAN_BIEN.md)).

---

## 5. Backend ⇄ MySQL

- Kết nối qua pool `mysql2/promise` ([config/db.ts](../backend/src/config/db.ts)), `connectionLimit: 10`, `timezone: "+00:00"` (chuẩn hoá giờ UTC để so sánh timestamp HMAC chính xác bất kể server đặt ở đâu).
- **100% câu lệnh dùng `pool.execute(sql, params)`** (prepared statement) — không có nơi nào nối chuỗi SQL trực tiếp từ input người dùng → loại trừ SQL injection cổ điển (ngoại trừ `audit.ts` dùng `pool.query` thay vì `execute` cho câu lệnh động ghép `WHERE`, nhưng params vẫn truyền tách biệt, không nối chuỗi).
- Ràng buộc khoá ngoại tạo "hiệu ứng dây chuyền" có chủ đích:
  - `sensor_data.device_id/gateway_id → devices.id ON DELETE CASCADE`: xoá thiết bị thì xoá luôn lịch sử dữ liệu của nó.
  - `audit_log.device_id → devices.id ON DELETE SET NULL`: xoá thiết bị **không** xoá audit log liên quan — log vẫn còn để truy vết, chỉ mất liên kết `device_id` ([001_schema.sql:88](../database/migrations/001_schema.sql#L88)).
- **Heartbeat monitor nền** ([deviceStatus.ts](../backend/src/services/deviceStatus.ts)): mỗi 30s quét `devices` có `last_seen` trong vòng 60s gần nhất, nạp vào một `Set` trong RAM (`onlineDeviceIds`). Lưu ý: route `GET /api/devices` hiện **không dùng cache này**, mà tự tính `is_online` trực tiếp bằng `TIMESTAMPDIFF` ngay trong câu SQL ([devices.ts:89-92](../backend/src/routes/devices.ts#L89-L92)) — cache trong `deviceStatus.ts` tồn tại như một service phụ trợ (`isOnlineFromCache`) nhưng chưa được route nào gọi tới trong code hiện tại.

---

## 6. Browser ⇄ Frontend (Next.js) ⇄ Backend — hai đường mạng có thể xảy ra

Có **hai con đường vật lý khác nhau** để request từ trình duyệt tới được backend, tuỳ cách chạy:

**(a) Qua Nginx (đúng cấu hình docker-compose production-like):**
[nginx/nginx.conf](../nginx/nginx.conf) định nghĩa 2 location: `/api/` → proxy thẳng tới `backend:5000`, mọi path còn lại → `frontend:3000`. Khi chạy `docker compose up`, **Nginx là cửa ngõ duy nhất (port 80)** — request `/api/*` từ browser được Nginx forward trực tiếp tới Backend, **Next.js hoàn toàn không tham gia vào request API**.

**(b) Qua route proxy nội bộ của Next.js (khi chạy frontend độc lập, không qua Nginx):**
[frontend/src/app/api/[...path]/route.ts](../frontend/src/app/api/%5B...path%5D/route.ts) là một **catch-all route** bắt mọi path `/api/*` ngay trong Next.js, tự fetch sang `BACKEND_URL` (env, mặc định `http://localhost:5000`, hoặc `http://backend:5000` trong Docker), forward gần như nguyên vẹn headers + cookie + body, và set lại header `x-forwarded-for` cho đúng IP client gốc ([route.ts:18-22](../frontend/src/app/api/%5B...path%5D/route.ts#L18-L22)).

→ Lý do tồn tại cả hai: route (b) cho phép code frontend **luôn gọi same-origin `/api/...`** (không bao giờ cần CORS, cookie luôn được trình duyệt gửi vì cùng origin) dù chạy `next dev` đơn độc không có Nginx; route (a) là kiến trúc triển khai thật khi đủ stack Docker. *(File [frontend/proxy.ts](../frontend/proxy.ts) ở gốc dự án là bản nháp cũ, import `@/lib/auth` không còn tồn tại — đã được thay thế bởi `frontend/middleware.ts` + `src/package/services/auth.ts`, có thể coi là tàn dư cần dọn.)*

### 6.1. Bắt tay đăng nhập (login handshake)

1. Form Login → `useAuth().login()` → `POST /api/auth/login {username, password}` ([frontend/src/package/services/auth.ts:9-15](../frontend/src/package/services/auth.ts#L9-L15)).
2. Backend bcrypt-compare, set cookie `token` (HttpOnly, SameSite=Strict, 8h) như mô tả ở [RBAC_CHI_TIET.md §3.1](RBAC_CHI_TIET.md#31-phát-hành-thẻ-vai-trò-lúc-đăng-nhập).
3. `AuthProvider` ([frontend/src/providers/AuthContext.tsx](../frontend/src/providers/AuthContext.tsx)) nhận `user` trả về, lưu vào React Context, `router.replace("/dashboard")`.
4. Mỗi lần app khởi động lại (refresh trang), `AuthProvider` gọi `GET /api/auth/me` để **hỏi lại backend** "JWT trong cookie của tôi còn hợp lệ không, tôi là ai" — không tự giải mã JWT ở client, luôn để backend là nguồn sự thật.
5. `frontend/middleware.ts` chạy ở Edge **trước khi** trang được render: chỉ cần thấy cookie `token` tồn tại (không verify chữ ký) là cho qua trang protected, ngược lại redirect `/login`. Bảo vệ thật vẫn ở bước 4 + ở từng API call.

### 6.2. Vòng đời một request gọi API thông thường (ví dụ đổi trạng thái thiết bị)

`api.patch("/api/devices/5/status", {status:"active"})` ([frontend/src/package/services/api.ts](../frontend/src/package/services/api.ts)) → `fetch(url, {credentials:"include", ...})` → cookie tự động kèm theo (vì same-origin với (a)/(b) ở trên) → tới `verifyJWT` → `requireRole("admin","operator")` → handler → DB update → response → nếu response là `401` thì `api.ts` **tự động redirect `/login`** cho mọi lời gọi (trừ chính `/api/auth/login` và `/api/auth/me` để tránh vòng lặp redirect).

### 6.3. Dashboard "sống" — polling, không WebSocket

Toàn bộ màn hình realtime dùng **SWR với `refreshInterval: 10000`** (10 giây/lần), không có WebSocket/SSE:

- `useDeviceList` → `GET /api/devices` mỗi 10s ([useDeviceList.ts:8-12](../frontend/src/package/features/useDeviceList.ts#L8-L12)).
- `useSensorData` → `GET /api/devices/:id/data?limit=200` mỗi 10s.
- `useDashboardStats` → `GET /api/dashboard/stats` mỗi 10s.

Vì trạng thái online/offline tính bằng `last_seen` (cập nhật mỗi khi có `DATA_RECV` thật) và sensor gửi dữ liệu mỗi 5s, một thiết bị mất kết nối sẽ được Dashboard "phát hiện offline" trong vòng tối đa khoảng `60s` (ngưỡng coi là online) + `10s` (chu kỳ polling UI) ≈ **dưới 70 giây** kể từ lúc mất kết nối thật.

---

## 7. Toàn trình — một bản ghi dữ liệu đi từ cảm biến tới màn hình mất bao nhiêu "cuộc bắt tay"

```
DHT22 đọc nhiệt độ/độ ẩm
   └─▶ Sensor: ký HMAC#1 (secret sensor) ──▶ MQTT publish (Mosquitto, anonymous)
          └─▶ Gateway: nhận, lọc whitelist nội bộ, verify HMAC#1, ký thêm HMAC#2 (secret gateway)
                 └─▶ HTTP POST /api/device/data
                        └─▶ Backend: verify HMAC#2 (DB) → verify HMAC#1 lại (DB, độc lập)
                               → check device_type khớp vai trò → check status='active'
                                  └─▶ INSERT sensor_data + UPDATE last_seen/fail_count
                                         └─▶ MySQL (audit_log ghi song song)
                                                └─▶ Dashboard SWR poll 10s
                                                       └─▶ Admin/Operator/Viewer thấy số liệu mới
```

7 "trạm kiểm soát" độc lập trên cùng một bản ghi dữ liệu: **whitelist gateway → timestamp sensor (gateway) → HMAC sensor (gateway) → HMAC gateway (backend) → HMAC sensor (backend) → device_type → status** — trước khi một con số nhiệt độ/độ ẩm được phép chạm vào bảng `sensor_data`.
