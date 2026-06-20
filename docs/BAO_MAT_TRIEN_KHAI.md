# Bảo mật đã triển khai trong hệ thống

**Dự án:** Hệ thống quản lý thiết bị IoT và phân quyền truy cập  
**Ngày cập nhật:** 2026-06-17  

---

## 1. Tổng quan yêu cầu bảo mật

Hệ thống được thiết kế với mục tiêu bảo mật trên nhiều lớp — từ firmware nhúng trên vi điều khiển đến backend server và dashboard web:

| Mục tiêu | Lớp triển khai |
|----------|---------------|
| **Định danh thiết bị IoT** | Database (UNIQUE constraint) + Firmware (device_id cố định trong flash) |
| **Xác thực thiết bị trước khi gửi dữ liệu** | Firmware (HMAC tính trước khi publish) + Backend (HMAC verify 2 lớp) |
| **Chống replay attack** | Firmware (NTP timestamp) + Backend (cửa sổ ±300s) + Gateway (cửa sổ ±300s) |
| **Chống timing attack** | Firmware (`safeEq64()`) + Backend (`crypto.timingSafeEqual()`) |
| **Chống giả mạo thiết bị** | HMAC 2 lớp + sensor whitelist + device_type check + auto-block |
| **Phân quyền người dùng/API bằng RBAC** | Backend (3 role, middleware `verifyJWT` + `requireRole`) |
| **Chống truy cập trái phép API** | JWT HttpOnly cookie + RBAC + Helmet + CORS + rate limiting |
| **Chống brute force** | Auto-block sau 5 lần xác thực thất bại |
| **Giám sát và truy vết** | Audit log 9 event types trong database |

> **Ghi chú về mức độ triển khai:** Hệ thống đã triển khai vượt yêu cầu ban đầu. Thay vì đơn giản kiểm tra `device_id + token`, cơ chế thực tế dùng **HMAC-SHA256 hai lớp với timestamp chống replay attack và constant-time comparison chống timing attack — được triển khai trên cả firmware lẫn backend.**

---

## 2. Cơ chế định danh thiết bị

### 2.1. Định danh bằng `device_id`

Mỗi thiết bị được cấp một `device_id` duy nhất với format cố định theo loại:

```
Sensor Node:  ESP32-SN-XXXXXXXX   (VD: ESP32-SN-CBF05770)
Gateway Node: ESP32-GW-XXXXXXXX   (VD: ESP32-GW-78867B14)
```

`device_id` được sinh tự động khi đăng ký thiết bị tại `backend/src/routes/devices.ts` (dòng 36–38):

```typescript
const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();  // 8 ký tự hex
const typeTag = device_type === "sensor" ? "SN" : "GW";
const device_id = `ESP32-${typeTag}-${suffix}`;
```

`device_id` được nạp vào firmware như hằng số sau khi đăng ký:

```cpp
// firmware/sensor-node/include/config.h
#define DEVICE_ID   "ESP32-SN-CBF05770"

// firmware/gateway-node/include/config_gw.h
#define GW_DEVICE_ID   "ESP32-GW-78867B14"
```

### 2.2. Lưu trữ trong database

Bảng `devices` trong `database/migrations/001_schema.sql`:

| Cột | Kiểu | Ràng buộc | Mô tả |
|-----|------|-----------|-------|
| `device_id` | VARCHAR(64) | UNIQUE, NOT NULL | Định danh thiết bị, không trùng lặp |
| `secret_key` | VARCHAR(128) | NOT NULL | Khóa bí mật dùng cho HMAC |
| `device_type` | ENUM('sensor','gateway') | NOT NULL | Loại thiết bị |
| `status` | ENUM('inactive','active','blocked') | NOT NULL | Trạng thái |
| `fail_count` | INT | DEFAULT 0 | Đếm số lần xác thực thất bại |
| `last_seen` | DATETIME | NULL | Thời điểm nhận dữ liệu hợp lệ gần nhất |
| `last_ip` | VARCHAR(64) | NULL | IP gần nhất của thiết bị |
| `created_by` | INT FK | NULL | User đã đăng ký thiết bị |

`device_id` có ràng buộc `UNIQUE` ở cấp database, đảm bảo không thể tồn tại hai thiết bị trùng ID.

### 2.3. API đăng ký thiết bị

`POST /api/devices/register` — Yêu cầu `verifyJWT` + `requireRole("admin", "operator")`:

- Người dùng cung cấp: `device_name`, `device_type`, `location`
- Hệ thống tự sinh: `device_id`, `secret_key`
- `status` khởi tạo là `inactive` — thiết bị **chưa được phép** gửi dữ liệu ngay
- Ghi `audit_log` event `DEVICE_REGISTER` với thông tin người đăng ký
- `secret_key` **chỉ được trả về một lần duy nhất** trong response, không lưu lại ở bất kỳ đâu khác

---

## 3. Cơ chế token/secret key cho thiết bị

### 3.1. Đặc điểm `secret_key`

| Thuộc tính | Giá trị |
|-----------|---------|
| Độ dài | 32 bytes ngẫu nhiên → 64 ký tự hex |
| Sinh bằng | `crypto.randomBytes(32).toString("hex")` (`backend/src/routes/devices.ts`) |
| Lưu trong DB | Plain text (VARCHAR 128) |
| Được hash không | **Không hash** — vì dùng cho HMAC cần key gốc |
| Lưu trong firmware | `#define SECRET_KEY "..."` trong flash (`firmware/*/include/config*.h`) |
| Trả về client | Chỉ 1 lần khi đăng ký, không có endpoint lấy lại |
| Truyền qua mạng | **Không bao giờ** — chỉ HMAC của nó mới được truyền |

**Lý do không hash `secret_key`:** Cơ chế HMAC-SHA256 yêu cầu backend tính lại `HMAC(secret_key, message)` để đối chiếu với giá trị thiết bị gửi lên. Nếu hash `secret_key` trước khi lưu, backend không thể tính lại HMAC — cơ chế xác thực sẽ không hoạt động. Đây là trade-off có chủ ý của thiết kế HMAC.

### 3.2. Cách thiết bị sử dụng `secret_key`

Thiết bị sử dụng `secret_key` để tính HMAC trước mỗi lần gửi dữ liệu (không truyền `secret_key` trực tiếp qua mạng):

**Sensor Node** (`firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp`):
```cpp
unsigned long timestamp = getCurrentTimestamp();         // NTP timestamp
String message = String(DEVICE_ID) + ":" + String(timestamp);
String hmac    = computeHMAC(String(SECRET_KEY), message);
// → chỉ hmac được gửi, SECRET_KEY ở lại trong firmware flash
```

**Gateway Node** (`firmware/gateway-node/lib/forwarder/forwarder.cpp`):
```cpp
unsigned long gw_timestamp = getCurrentTimestamp();
char gwMsg[96];
snprintf(gwMsg, sizeof(gwMsg), "%s:%lu", GW_DEVICE_ID, gw_timestamp);
char gw_hmac[65];
computeHMAC(GW_SECRET_KEY, gwMsg, gw_hmac);
// → chỉ gw_hmac được gửi trong payload
```

### 3.3. Hạn chế hiện tại

- Chưa có cơ chế rotate `secret_key` sau khi bị lộ
- Chưa có endpoint để cấp lại `secret_key` mới cho thiết bị đang hoạt động
- `config.h` và `config_gw.h` chứa credentials thực tế và hiện đang được commit vào Git — cần gitignore hoặc dùng file `.env` tương đương cho firmware
- `device_tokens` table tồn tại trong schema nhưng chưa có route nào sử dụng (xem mục 12)

---

## 4. Bảo mật lớp Firmware (Embedded Security)

Phần này trình bày chi tiết các cơ chế bảo mật được triển khai trực tiếp trong firmware C++ của hai board ESP32.

### 4.1. Thư viện mã hóa: mbedTLS (built-in ESP32)

Cả Sensor Node và Gateway Node đều sử dụng **mbedTLS** — thư viện mã hóa được tích hợp sẵn trong ESP32 Arduino SDK — để tính HMAC-SHA256. Không cần thư viện bên ngoài.

**Sensor Node** (`firmware/sensor-node/lib/hmac_util/hmac_util.cpp`):
```cpp
#include "mbedtls/md.h"

String computeHMAC(const String& key, const String& message) {
    uint8_t hmacResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_setup(&ctx, mdInfo, 1 /* hmac=1 */);
    mbedtls_md_hmac_starts(&ctx, (const uint8_t*)key.c_str(), key.length());
    mbedtls_md_hmac_update(&ctx, (const uint8_t*)message.c_str(), message.length());
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    mbedtls_md_free(&ctx);
    // → encode hex 64 ký tự
}
```

**Gateway Node** (`firmware/gateway-node/lib/hmac_util/hmac_util.cpp`):
```cpp
bool computeHMAC(const char* key, const char* msg, char out[65]) {
    uint8_t raw[32];
    mbedtls_md_context_t ctx;
    // Kiểm tra return code ở mọi bước:
    bool ok = (mbedtls_md_setup(&ctx, info, 1) == 0) &&
              (mbedtls_md_hmac_starts(&ctx, ...) == 0) &&
              (mbedtls_md_hmac_update(&ctx, ...) == 0) &&
              (mbedtls_md_hmac_finish(&ctx, raw) == 0);
    if (!ok) return false;
    // → snprintf hex vào out[65]
}
```

mbedTLS là thư viện mã hóa được kiểm toán bảo mật, sử dụng rộng rãi trong các thiết bị nhúng và IoT.

### 4.2. Đồng bộ thời gian NTP — điều kiện bắt buộc trước khi gửi

Cả hai firmware đều **từ chối gửi/forward dữ liệu nếu NTP chưa đồng bộ**. Đây là biện pháp quan trọng: timestamp=0 hoặc timestamp sai sẽ tạo ra HMAC có thể bị khai thác.

**Sensor Node** (`firmware/sensor-node/src/main.cpp`):
```cpp
if (!ntpIsSynced()) {
    Serial.println("[MAIN] Bỏ qua – NTP chưa đồng bộ (HMAC sẽ sai)");
    return;  // không publish
}
```

**Gateway Node** (`firmware/gateway-node/src/main.cpp`):
```cpp
static void onSensorMessage(...) {
    if (!ntpIsSynced()) {
        Serial.println("[MAIN] Drop – NTP not synced, cannot validate timestamp");
        return;  // không forward
    }
    forwardSensorData(topic, payload, length);
}
```

NTP được sync với `pool.ntp.org` và `time.nist.gov` tại startup (`firmware/sensor-node/lib/ntp_sync/ntp_sync.cpp`, `firmware/gateway-node/lib/ntp_sync/ntp_sync.cpp`):
```cpp
configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");  // UTC+7
```

### 4.3. Constant-time comparison: `safeEq64()` (Gateway Node)

Gateway Node triển khai hàm so sánh constant-time để tránh **timing attack** khi xác minh HMAC của Sensor (`firmware/gateway-node/lib/forwarder/forwarder.cpp`):

```cpp
// Constant-time compare – prevents timing attacks on HMAC verification
static bool safeEq64(const char* a, const char* b) {
    uint8_t diff = 0;
    for (int i = 0; i < 64; i++) diff |= (uint8_t)(a[i] ^ b[i]);
    return diff == 0;
}
```

**Nguyên lý:** XOR từng byte, luôn chạy đúng 64 vòng lặp bất kể kết quả. Thời gian thực thi không phụ thuộc vào vị trí byte đầu tiên bị sai — kẻ tấn công không thể đo thời gian phản hồi để đoán từng byte của HMAC.

So sánh thường dùng `strcmp()` sẽ trả về ngay khi gặp byte đầu tiên khác nhau — tạo ra side-channel timing leak.

### 4.4. Kiểm tra timestamp window tại Gateway firmware

Trước khi verify HMAC của Sensor, Gateway kiểm tra cửa sổ thời gian (`firmware/gateway-node/lib/forwarder/forwarder.cpp`):

```cpp
unsigned long now = getCurrentTimestamp();
long timeDiff = (long)now - (long)sn_timestamp;
if (timeDiff < -TIMESTAMP_WINDOW_SEC || timeDiff > TIMESTAMP_WINDOW_SEC) {
    Serial.printf("[FWD] REJECT – timestamp out of window (diff=%lds)\n", timeDiff);
    return false;  // dropped, không forward
}
// TIMESTAMP_WINDOW_SEC = 300  (firmware/gateway-node/include/config_gw.h)
```

Điều này có nghĩa là kiểm tra replay attack xảy ra ở **cả 3 điểm**:
1. Gateway firmware (trước khi verify HMAC sensor)
2. Backend cho Gateway HMAC (`hmacService.ts: isTimestampValid()`)
3. Backend cho Sensor HMAC (lần thứ hai trong `hmacService.ts`)

### 4.5. Whitelist sensor — Sensor Registry

Gateway chỉ forward dữ liệu từ những sensor được đăng ký. Cơ chế hai tầng (`firmware/gateway-node/lib/sensor_registry/`):

**Tầng 1 — Dynamic Registry (ưu tiên):**
- `fetchSensorList()` gọi `GET /api/device/sensors` với Gateway HMAC mỗi 5 phút
- Backend xác thực Gateway HMAC trước khi trả về danh sách (xem mục 7, bảng API)
- Lưu tối đa `SENSOR_REGISTRY_MAX = 16` sensor trong RAM
- Thời gian sống: `SENSOR_REGISTRY_TTL_MS = 300000ms` (5 phút)

**Tầng 2 — Static Fallback (`KNOWN_SENSORS[]`):**
- Danh sách cứng trong `firmware/gateway-node/include/config_gw.h`
- Dùng khi dynamic registry chưa fetch được hoặc backend không phản hồi

**Lazy refresh khi gặp sensor lạ:**
```cpp
// firmware/gateway-node/lib/forwarder/forwarder.cpp
const char* sensorSecret = registryFindSecret(sensor_id);
if (!sensorSecret && registryNeedsRefresh()) {
    Serial.printf("[FWD] Unknown sensor '%s', refreshing registry...\n", sensor_id);
    fetchSensorList();             // fetch ngay, không đợi TTL
    sensorSecret = registryFindSecret(sensor_id);
}
if (!sensorSecret) {
    Serial.printf("[FWD] REJECT – unknown sensor '%s'\n", sensor_id);
    return false;  // sensor chưa đăng ký → từ chối
}
```

Nếu sau khi refresh vẫn không tìm thấy sensor_id → **từ chối hoàn toàn**, không forward.

### 4.6. Xác thực HMAC Sensor tại Gateway firmware

Hàm `verifySensorHMAC()` trong `firmware/gateway-node/lib/forwarder/forwarder.cpp`:

```cpp
static bool verifySensorHMAC(const char* sensor_id, unsigned long sn_timestamp,
                              const char* sn_hmac, const char* secret) {
    if (strlen(sn_hmac) != 64) return false;       // độ dài HMAC phải đúng 64 ký tự hex
    char msg[96];
    snprintf(msg, sizeof(msg), "%s:%lu", sensor_id, sn_timestamp);
    char expected[65];
    if (!computeHMAC(secret, msg, expected)) return false;
    return safeEq64(expected, sn_hmac);             // constant-time compare
}
```

Kiểm tra `strlen(sn_hmac) != 64` trước tiên — từ chối ngay nếu HMAC không đúng độ dài (phòng trường hợp payload bị truncate hoặc tấn công length extension).

### 4.7. Buffer overflow protection (Gateway MQTT Client)

`firmware/gateway-node/lib/mqtt_client/mqtt_client.cpp` giới hạn độ dài payload trước khi xử lý:

```cpp
static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    char buf[MQTT_BUFFER_SIZE];
    unsigned int copyLen = (length < sizeof(buf) - 1) ? length : sizeof(buf) - 1;
    memcpy(buf, payload, copyLen);
    buf[copyLen] = '\0';  // null-terminate đảm bảo
    _userCallback(topic, buf, copyLen);
}
// MQTT_BUFFER_SIZE = 1024 (firmware/gateway-node/include/config_gw.h)
```

Payload vượt quá `MQTT_BUFFER_SIZE - 1 = 1023 bytes` sẽ bị truncate, không gây stack overflow.

### 4.8. WiFi Station Mode — không mở AP

Cả hai firmware cấu hình WiFi ở chế độ Station (`WIFI_STA`) — **không mở Access Point** (`firmware/sensor-node/lib/wifi_manager/wifi_manager.cpp`):

```cpp
WiFi.mode(WIFI_STA);  // chỉ kết nối vào mạng, không phát sóng WiFi
WiFi.begin(WIFI_SSID, WIFI_PASS);
```

Thiết bị không tạo mạng WiFi mới, không có cổng cấu hình web mặc định — giảm bề mặt tấn công từ vô tuyến.

### 4.9. Hạn chế bảo mật firmware hiện tại

| Hạn chế | Chi tiết | File liên quan |
|---------|---------|---------------|
| **MQTT plain TCP** | Dùng `WiFiClient` (không phải `WiFiClientSecure`) — không có TLS/SSL | `mqtt_sender.cpp`, `mqtt_client.cpp` |
| **Credentials trong `#define`** | `SECRET_KEY`, `GW_SECRET_KEY`, `WIFI_PASS` lưu dạng plain text trong flash | `config.h`, `config_gw.h` |
| **Config files commit lên Git** | `config.h` và `config_gw.h` chứa credentials thực tế đang được track bởi Git — rủi ro nếu repo không private | `firmware/*/include/config*.h` |
| **KNOWN_SENSORS[] hardcode** | Thêm/xóa sensor cần sửa code và re-flash gateway (giảm thiểu bởi dynamic registry) | `config_gw.h` |
| **Không có certificate pinning** | Do không có TLS, không thể pin server certificate | — |
| **Không có secure boot** | ESP32 DOIT DevKit V1 không được cấu hình secure boot — ai có thiết bị có thể download firmware | Hardware |

---

## 5. Luồng xác thực thiết bị khi gửi dữ liệu

Hệ thống triển khai xác thực **hai lớp HMAC độc lập** — vượt xa yêu cầu `device_id + token + data` ban đầu.

### 5.1. Luồng tổng quát end-to-end

```
[Sensor Node — firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp]
    │  Điều kiện: WiFi ✓, NTP synced ✓, MQTT connected ✓, DHT22 valid ✓
    │  1. timestamp = getCurrentTimestamp()   // từ NTP
    │  2. message   = "ESP32-SN-XXXX:" + timestamp
    │  3. sn_hmac   = HMAC-SHA256(SECRET_KEY, message)   // mbedTLS
    │  4. Publish topic "local/sensors/{DEVICE_ID}/data":
    │     { sensor_id, sn_timestamp, sn_hmac, sensor_ip, data:{temperature,humidity} }
    ▼
[MQTT Broker 1 — Mosquitto :1883] ── wildcard subscribe: local/sensors/+/data
    ▼
[Gateway Node — firmware/gateway-node/lib/forwarder/forwarder.cpp]
    │  Điều kiện: NTP synced ✓ (kiểm tra trước khi callback)
    │  5. Parse JSON từ Sensor
    │  6. Tra sensor_id trong registry (dynamic → KNOWN_SENSORS[])
    │     Nếu không thấy → lazy refresh → nếu vẫn không thấy → REJECT
    │  7. Kiểm tra |sn_timestamp - now| <= 300s       // chống replay
    │  8. Tính lại sn_hmac_expected = HMAC-SHA256(sensorSecret, sensor_id:sn_timestamp)
    │  9. safeEq64(sn_hmac_expected, sn_hmac)         // constant-time compare
    │     Fail → drop, không forward
    │  10. gw_timestamp = getCurrentTimestamp()
    │  11. gw_hmac = HMAC-SHA256(GW_SECRET_KEY, "GW_ID:gw_timestamp")
    │  12. Build payload lồng ghép: { gateway_id, gw_timestamp, gw_hmac, sensor_payload:{...} }
    │  13. Publish topic "gateway/{GW_DEVICE_ID}/data" → Broker 2 :1884
    ▼
[MQTT Broker 2 — Mosquitto :1884] ── subscribe: gateway/+/data
    ▼
[Backend — backend/src/services/mqttDataService.ts]
    │  LEVEL 1 — Xác thực Gateway:
    │  14. Lookup secret_key của gateway theo gateway_id trong DB
    │  15. Kiểm tra |gw_timestamp - now| <= 300s
    │  16. expected = HMAC-SHA256(gw_secret, "gateway_id:gw_timestamp")
    │  17. timingSafeEqual(expected, gw_hmac)
    │      Fail → log GATEWAY_AUTH_FAIL, tăng fail_count, block nếu >= 5
    │
    │  LEVEL 2 — Xác thực Sensor:
    │  18. Lookup secret_key của sensor theo sensor_id trong DB
    │  19. Kiểm tra |sn_timestamp - now| <= 300s
    │  20. expected = HMAC-SHA256(sn_secret, "sensor_id:sn_timestamp")
    │  21. timingSafeEqual(expected, sn_hmac)
    │      Fail → log SENSOR_AUTH_FAIL, tăng fail_count, block nếu >= 5
    │
    │  KIỂM TRA device_type và status:
    │  22. gateway.device_type phải là 'gateway'
    │  23. sensor.device_type phải là 'sensor'
    │  24. Cả hai status phải là 'active'
    │
    │  LƯU DỮ LIỆU:
    │  25. INSERT INTO sensor_data (device_id, gateway_id, payload)
    │  26. Cleanup nếu count > 150 bản ghi cho sensor đó
    │  27. UPDATE last_seen, fail_count=0, last_ip
    │  28. log DATA_RECV vào audit_log
    ▼
[MySQL — bảng sensor_data, devices, audit_log]
```

### 5.2. HMAC công thức (đồng nhất giữa firmware và backend)

```
HMAC-SHA256(secret_key, "device_id:unix_timestamp_giây")
```

| Thành phần | Firmware | Backend |
|-----------|---------|---------|
| Thư viện | mbedTLS (`MBEDTLS_MD_SHA256`) | Node.js `crypto.createHmac("sha256", ...)` |
| So sánh kết quả | `safeEq64()` (XOR loop, 64 iter) | `crypto.timingSafeEqual()` |
| Kiểm tra timestamp | `|now - ts| <= TIMESTAMP_WINDOW_SEC` | `Math.abs(Date.now()/1000 - ts) <= 300` |

### 5.3. Endpoint và protocol

| Luồng | Protocol | Endpoint/Topic | File xử lý |
|-------|----------|----------------|-----------|
| Luồng chính (Sensor→Gateway) | MQTT | `local/sensors/{sensor_id}/data` | `mqtt_sender.cpp`, `mqtt_client.cpp` |
| Luồng chính (Gateway→Backend) | MQTT | `gateway/{gw_id}/data` | `forwarder.cpp`, `mqttDataService.ts` |
| HTTP fallback | HTTP POST | `POST /api/device/data` | `validateDevice.ts`, `data.routes.ts` |
| Lấy danh sách sensor | HTTP GET | `GET /api/device/sensors` | `sensor_registry.cpp`, `sensors.routes.ts` |

### 5.4. Response xác thực (HTTP fallback)

| Tình huống | HTTP Code | Error code |
|-----------|-----------|------------|
| Thiết bị hợp lệ | 200 OK | `{ success: true, sensor_id, gateway_id, received_at }` |
| Thiếu field gateway | 400 | `MISSING_GATEWAY_FIELDS` |
| Thiếu field sensor | 400 | `MISSING_SENSOR_FIELDS` |
| Gateway không tìm thấy | 401 | `GATEWAY_AUTH_FAIL` + reason: `NOT_FOUND` |
| Timestamp hết hạn | 401 | `GATEWAY_AUTH_FAIL` + reason: `TIMESTAMP_EXPIRED` |
| HMAC sai (gateway) | 401 | `GATEWAY_AUTH_FAIL` + reason: `HMAC_MISMATCH` |
| Sensor HMAC sai | 401 | `SENSOR_AUTH_FAIL` + reason: `HMAC_MISMATCH` |
| Thiết bị bị khóa | 403 | `DEVICE_BLOCKED` |
| Thiết bị chưa active | 403 | `DEVICE_NOT_ACTIVE` |
| Sai device_type | 403 | `INVALID_DEVICE_TYPE` |

---

## 6. Xử lý thiết bị không đăng ký hoặc sai token

### 6.1. Bảng xử lý các trường hợp lỗi

| Trường hợp | Xử lý tại Gateway firmware | Xử lý tại Backend | Dữ liệu lưu DB | Ghi audit_log |
|-----------|--------------------------|-------------------|---------------|---------------|
| Thiếu `gateway_id`/`gw_hmac` | — (không phải MQTT sensor) | HTTP 400 `MISSING_GATEWAY_FIELDS`; MQTT: drop | Không | Không |
| `sensor_id` không trong registry | REJECT, không forward | — | Không | Không |
| Timestamp ngoài ±300s (tại GW) | REJECT, không forward | — | Không | Không |
| HMAC sai tại Gateway firmware | REJECT, không forward | — | Không | Không |
| `device_id` không tồn tại trong DB | — | 401 `NOT_FOUND` | Không | Có — `GATEWAY_AUTH_FAIL` |
| Timestamp ngoài ±300s (tại backend) | — | 401 `TIMESTAMP_EXPIRED` | Không | Có — `GATEWAY_AUTH_FAIL` |
| HMAC sai tại backend (gateway) | — | 401 `HMAC_MISMATCH`; tăng `fail_count` | Không | Có — `GATEWAY_AUTH_FAIL` |
| HMAC sai tại backend (sensor) | — | 401 `HMAC_MISMATCH`; tăng `fail_count` | Không | Có — `SENSOR_AUTH_FAIL` |
| `fail_count >= 5` | — | `status='blocked'`; HTTP 403 | Cập nhật status | Có — `DEVICE_BLOCKED` |
| Thiết bị bị khóa | — | 403 `DEVICE_BLOCKED` | Không | Không |
| Thiết bị chưa active (`inactive`) | — | 403 `DEVICE_NOT_ACTIVE` | Không | Không |
| `device_type` sai vai trò | — | 403 `INVALID_DEVICE_TYPE` | Không | Không |
| Thiết bị hợp lệ | Forward thành công | Lưu data, reset `fail_count=0` | Có | Có — `DATA_RECV` |

### 6.2. Logic auto-block

Cả hai đường xử lý (MQTT và HTTP) đều có cùng ngưỡng block:

```typescript
const BLOCK_THRESHOLD = 5;  // backend/src/services/mqttDataService.ts
                            // backend/src/middleware/validateDevice.ts
// Sau mỗi lần fail:
UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?
// Nếu fail_count >= 5:
UPDATE devices SET status = 'blocked' WHERE id = ?
// → Thiết bị không thể gửi dữ liệu cho đến khi admin mở khóa thủ công
```

Mở khóa thiết bị: `PATCH /api/devices/:id/status` → `{ status: "active" }` (reset `fail_count = 0`).

---

## 7. Cơ chế RBAC đã triển khai

### 7.1. Vai trò người dùng

Hệ thống có 3 vai trò, định nghĩa trong `database/migrations/001_schema.sql`:

```sql
role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'viewer'
```

| Vai trò | Mô tả |
|---------|-------|
| `admin` | Toàn quyền: quản lý thiết bị, người dùng, audit log, xóa dữ liệu |
| `operator` | Đăng ký thiết bị, kích hoạt/khóa thiết bị, xem dữ liệu, xóa DATA_RECV log |
| `viewer` | Chỉ được xem: danh sách thiết bị, dữ liệu cảm biến, audit log |

Tài khoản mặc định: `admin` / `admin123` (bcrypt hash trong seed data, `database/migrations/001_schema.sql`).

### 7.2. Quyền truy cập theo route

| Route | Method | `viewer` | `operator` | `admin` |
|-------|--------|----------|-----------|---------|
| `GET /api/devices` | Xem DS thiết bị | ✓ | ✓ | ✓ |
| `GET /api/devices/:id` | Xem chi tiết thiết bị | ✓ | ✓ | ✓ |
| `GET /api/devices/:id/data` | Xem dữ liệu cảm biến | ✓ | ✓ | ✓ |
| `GET /api/dashboard/stats` | Xem tổng quan | ✓ | ✓ | ✓ |
| `GET /api/audit-log` | Xem audit log | ✓ | ✓ | ✓ |
| `POST /api/devices/register` | Đăng ký thiết bị mới | ✗ | ✓ | ✓ |
| `PATCH /api/devices/:id/status` | Kích hoạt/khóa thiết bị | ✗ | ✓ | ✓ |
| `DELETE /api/audit-log/data-recv` | Xóa DATA_RECV logs | ✗ | ✗ | ✓ |
| `DELETE /api/devices/:id` | Xóa thiết bị | ✗ | ✗ | ✓ |
| `GET /api/users` | Xem danh sách user | ✗ | ✗ | ✓ |
| `POST /api/users` | Tạo user mới | ✗ | ✗ | ✓ |
| `PATCH /api/users/:id/password` | Đổi mật khẩu user | ✗ | ✗ | ✓ |
| `DELETE /api/users/:id` | Xóa user | ✗ | ✗ | ✓ |

**Giới hạn bổ sung (hardcode trong route, `backend/src/routes/users.ts`):**
- Admin không thể xóa chính mình (`CANNOT_DELETE_SELF`)
- Admin không thể xóa tài khoản `admin` khác (`CANNOT_DELETE_ADMIN`)
- Admin không thể tạo user có role `admin` — chỉ cho phép tạo `operator` hoặc `viewer`

### 7.3. Middleware kiểm tra quyền

**`verifyJWT`** (`backend/src/middleware/verifyJWT.ts`):
```typescript
export async function verifyJWT(req, res, next): Promise<void> {
  const token = parseCookie(req.headers.cookie, "token");
  if (!token) { res.status(401).json({ error: "NO_TOKEN" }); return; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    (req as any).user = payload;  // { id, username, role }
    next();
  } catch {
    res.status(401).json({ error: "INVALID_TOKEN" });
  }
}
```

**`requireRole(...roles)`** (`backend/src/middleware/rbac.ts`):
```typescript
export function requireRole(...roles: string[]) {
  return (req, res, next): void => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  };
}
```

Cách dùng trong routes:
```typescript
router.post("/register", verifyJWT, requireRole("admin", "operator"), handler);
router.delete("/:id",    verifyJWT, requireRole("admin"),             handler);
```

### 7.4. Đánh giá mức độ hoàn thành RBAC

**Mức độ: Hoàn thành** đối với yêu cầu hiện tại.

- 3 vai trò rõ ràng, phân quyền chi tiết trên từng endpoint
- Middleware tách biệt `verifyJWT` và `requireRole` — dễ mở rộng
- Giới hạn bổ sung (không xóa admin, không tạo admin) được enforce ở code layer
- **Hạn chế:** Chưa có phân quyền theo nhóm thiết bị — tất cả user cùng role đều thấy mọi thiết bị

---

## 8. Bảo vệ API khỏi truy cập trái phép

### 8.1. Cơ chế bảo vệ từng nhóm API

| Nhóm API | Endpoint | Cơ chế bảo vệ | Role được phép | File |
|----------|----------|--------------|---------------|------|
| Public | `GET /api/health` | Không | Mọi người | `health.routes.ts` |
| Auth | `POST /api/auth/login` | Rate limit 10/15min | Mọi người | `auth.ts` |
| Auth | `POST /api/auth/logout` | — | Mọi người | `auth.ts` |
| Auth | `GET /api/auth/me` | `verifyJWT` | Đã đăng nhập | `auth.ts` |
| Device (đọc) | `GET /api/devices`, `/api/devices/:id` | `verifyJWT` | admin, operator, viewer | `devices.ts` |
| Device (ghi) | `POST /api/devices/register`, `PATCH /:id/status` | `verifyJWT` + `requireRole` | admin, operator | `devices.ts` |
| Device (xóa) | `DELETE /api/devices/:id` | `verifyJWT` + `requireRole("admin")` | admin | `devices.ts` |
| Sensor data | `GET /api/devices/:id/data` | `verifyJWT` | admin, operator, viewer | `devices.ts` |
| IoT data (MQTT) | topic `gateway/+/data` | HMAC 2 lớp | Thiết bị active | `mqttDataService.ts` |
| IoT data (HTTP) | `POST /api/device/data` | `validateDevice` (HMAC 2 lớp) + rate limit 60/min | Thiết bị active | `data.routes.ts` |
| Sensor list | `GET /api/device/sensors` | Gateway HMAC (query params) | Gateway active | `sensors.routes.ts` |
| Dashboard | `GET /api/dashboard/stats` | `verifyJWT` | Đã đăng nhập | `dashboard.ts` |
| Audit log | `GET /api/audit-log` | `verifyJWT` | Đã đăng nhập | `audit.ts` |
| Audit log | `DELETE /api/audit-log/data-recv` | `verifyJWT` + `requireRole("admin")` | admin | `audit.ts` |
| Audit log | `DELETE /api/audit-log/by-type` | `verifyJWT` + `requireRole("admin")` | admin | `audit.ts` |
| Audit log | `DELETE /api/audit-log/bulk` | `verifyJWT` + `requireRole("admin")` | admin | `audit.ts` |
| Users | `GET/POST/PATCH/DELETE /api/users` | `verifyJWT` + `requireRole("admin")` | admin | `users.ts` |

### 8.2. JWT HttpOnly cookie

```typescript
// backend/src/routes/auth.ts
res.cookie("token", token, {
  httpOnly: true,              // JavaScript không đọc được cookie → chống XSS
  maxAge: 8 * 60 * 60 * 1000, // 8 giờ
  sameSite: "strict",          // chỉ gửi cùng origin → chống CSRF
});
```

Frontend (Next.js) không cần xử lý token thủ công — cookie tự động gửi kèm mọi request đến backend.

### 8.3. Chống user enumeration khi login

`backend/src/routes/auth.ts` chạy `bcrypt.compare()` ngay cả khi username không tồn tại, dùng dummy hash để thời gian phản hồi tương đương:

```typescript
const dummyHash = "$2b$12$invalidhashpaddingtomatchbcryptlength000000000000000000";
const valid = user
  ? await bcrypt.compare(password, user.password_hash)
  : await bcrypt.compare(password, dummyHash).then(() => false);
// → Kẻ tấn công không phân biệt được "user không tồn tại" với "sai mật khẩu"
```

### 8.4. HTTP Security Headers (Helmet)

`backend/src/app.ts` kích hoạt `helmet()`:

| Header | Bảo vệ chống |
|--------|-------------|
| `X-Content-Type-Options: nosniff` | MIME type sniffing |
| `X-Frame-Options: DENY` | Clickjacking |
| `X-XSS-Protection: 1; mode=block` | XSS (legacy browsers) |
| `Strict-Transport-Security` | Protocol downgrade |
| `Content-Security-Policy` | Inline script injection |

### 8.5. Rate Limiting (`backend/src/app.ts`)

| Limiter | Áp dụng cho | Giới hạn | Phản hồi khi vượt |
|---------|------------|----------|------------------|
| `authLimiter` | `POST /api/auth/login` | 10 req / 15 phút / IP | `TOO_MANY_REQUESTS` |
| `deviceDataLimiter` | `POST /api/device/data` | 60 req / phút / IP | `TOO_MANY_REQUESTS` |
| `apiLimiter` | Tất cả `/api/*` còn lại | 100 req / 15 phút / IP | `TOO_MANY_REQUESTS` |

### 8.6. Input validation và giới hạn body

```typescript
app.use(express.json({ limit: "10kb" }));  // chống DoS bằng payload lớn
```

- `sanitize()` trong `backend/src/routes/devices.ts`: trim + giới hạn độ dài chuỗi
- Username: 3–32 ký tự (`backend/src/routes/users.ts`)
- Password: tối thiểu 6 ký tự
- Tất cả query dùng prepared statements (`pool.execute(sql, [params])`) — chống SQL injection

---

## 9. Chống giả mạo thiết bị

### 9.1. Các lớp bảo vệ end-to-end

```
Lớp 1 — Gateway firmware whitelist (sensor_registry)
    Sensor lạ không được forward, ngay cả khi HMAC đúng về mặt kỹ thuật
    
Lớp 2 — HMAC-SHA256 tại Gateway firmware (safeEq64)
    Kẻ tấn công biết sensor_id nhưng không có secret_key → không tính được HMAC
    
Lớp 3 — Timestamp window ±300s tại Gateway firmware
    Replay attack (bắt lại HMAC cũ) thất bại sau 5 phút
    
Lớp 4 — HMAC Gateway tại Backend (Level 1, timingSafeEqual)
    Thiết bị giả vờ là gateway phải có GW_SECRET_KEY
    
Lớp 5 — HMAC Sensor tại Backend (Level 2, timingSafeEqual)
    Backend xác thực lại sensor độc lập với Gateway
    
Lớp 6 — Timestamp window ±300s tại Backend (×2, cho cả GW và SN)
    Replay của cả message gateway-signed cũng thất bại
    
Lớp 7 — Kiểm tra device_type trong DB
    Sensor giả làm gateway bị từ chối dù HMAC đúng
    
Lớp 8 — Auto-block sau 5 lần fail
    Brute force bị chặn, phải có admin can thiệp mới mở khóa
```

### 9.2. Những gì chưa triển khai

- **TLS cho MQTT:** `WiFiClient` (không phải `WiFiClientSecure`) — dữ liệu MQTT plain text trên mạng
- **HTTPS cho HTTP endpoints:** Nginx HTTP port 80, không SSL certificate
- **Certificate pinning tại firmware:** Do không có TLS, không áp dụng được
- **Secure boot ESP32:** Không được cấu hình — ai có thiết bị có thể đọc firmware flash

---

## 10. Chống truy cập trái phép API

### 10.1. Kiểm tra quyền người dùng

Luồng xác thực người dùng:
```
POST /api/auth/login
    → bcrypt.compare(password, password_hash)   [saltRounds=12]
    → jwt.sign({id, username, role}, JWT_SECRET, {expiresIn:"8h"})
    → Set-Cookie: token=...; HttpOnly; SameSite=Strict

Mọi request sau đó:
    → Cookie tự động gửi → verifyJWT → req.user = {id, username, role}
    → requireRole(...) kiểm tra role trước khi vào handler
```

### 10.2. Mật khẩu người dùng

`backend/src/routes/users.ts`:
- Hash với `bcrypt.hash(password, 12)` — `saltRounds = 12`
- Password tối thiểu 6 ký tự (validation cả backend lẫn frontend)
- Không lưu plain text mật khẩu ở bất kỳ đâu

### 10.3. CORS và Origin protection

```typescript
// backend/src/app.ts
cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true })
```

Request từ origin khác (cross-site) bị trình duyệt từ chối ở preflight `OPTIONS`.

---

## 11. Đối chiếu yêu cầu bảo mật và kết quả đã làm

| STT | Yêu cầu bảo mật | Trạng thái | Mô tả phần đã làm |
|-----|----------------|-----------|------------------|
| 1 | Mỗi thiết bị có `device_id` duy nhất | Hoàn thành | Auto-sinh `ESP32-SN/GW-XXXXXXXX`, UNIQUE constraint DB, `#define DEVICE_ID` trong firmware |
| 2 | Mỗi thiết bị có `token`/`secret_key` | Hoàn thành | 32 bytes random → 64 hex, lưu DB và firmware flash, trả về 1 lần |
| 3 | Khi gửi dữ liệu kèm `device_id + token + data` | Hoàn thành (nâng cao) | HMAC-SHA256 thay vì token tĩnh, kèm timestamp; `secret_key` không bao giờ truyền |
| 4 | Server kiểm tra thiết bị hợp lệ | Hoàn thành | HMAC 2 lớp backend; sensor whitelist + HMAC tại gateway firmware |
| 5 | Từ chối thiết bị sai token/chưa đăng ký | Hoàn thành | 3 điểm kiểm tra: gateway firmware, backend Level 1, backend Level 2 |
| 6 | Triển khai RBAC | Hoàn thành | 3 role, `verifyJWT` + `requireRole`, phân quyền từng route |
| 7 | Chống giả mạo thiết bị | Hoàn thành (8 lớp) | HMAC 2 lớp + sensor whitelist + timestamp + constant-time + device_type + auto-block |
| 8 | Chống truy cập trái phép API | Hoàn thành | JWT HttpOnly + RBAC + Helmet + CORS + rate limiting + input validation |
| 9 | Chống replay attack | Hoàn thành (ngoài yêu cầu gốc) | Timestamp ±300s tại firmware gateway, backend Level 1, backend Level 2 |
| 10 | Chống timing attack | Hoàn thành (ngoài yêu cầu gốc) | `safeEq64()` firmware, `timingSafeEqual()` backend, dummy hash login |
| 11 | Chống brute force | Hoàn thành (ngoài yêu cầu gốc) | Auto-block `fail_count >= 5`, reset khi admin unlock |
| 12 | Chống user enumeration | Hoàn thành (ngoài yêu cầu gốc) | Dummy bcrypt hash khi username không tồn tại |
| 13 | Audit log bảo mật | Hoàn thành (ngoài yêu cầu gốc) | 9 event types: DATA_RECV, GATEWAY_AUTH_FAIL, SENSOR_AUTH_FAIL, REPLAY_ATTACK, PRIVILEGE_ESCALATION, DEVICE_BLOCKED, DEVICE_REGISTER, DEVICE_STATUS_CHANGE, DEVICE_DELETE |
| 14 | Rate limiting | Hoàn thành (ngoài yêu cầu gốc) | 3 mức giới hạn theo loại endpoint |
| 15 | Sensor whitelist tại gateway | Hoàn thành (ngoài yêu cầu gốc) | Dynamic registry (5 phút TTL) + KNOWN_SENSORS[] fallback + lazy refresh |
| 16 | NTP guard trước khi gửi/forward | Hoàn thành (ngoài yêu cầu gốc) | Cả Sensor Node và Gateway Node kiểm tra `ntpIsSynced()` trước khi gửi |
| 17 | Buffer overflow protection firmware | Hoàn thành (ngoài yêu cầu gốc) | Giới hạn `copyLen = min(length, MQTT_BUFFER_SIZE - 1)` trong mqtt_client.cpp |
| 18 | Session token dài hạn cho thiết bị | Đã triển khai một phần | Schema `device_tokens` tồn tại, chưa có route sử dụng |
| 19 | MQTT TLS/SSL | Chưa triển khai | Plain TCP `WiFiClient`, Mosquitto plain — Broker 1 :1883 và Broker 2 :1884 đều không TLS |
| 20 | HTTPS | Chưa triển khai | Nginx HTTP port 80, không SSL |

---

## 12. Hạn chế hiện tại

### 12.1. Hạn chế phía Firmware

| # | Hạn chế | Chi tiết |
|---|---------|---------|
| 1 | **MQTT plain TCP** | `WiFiClient` không phải `WiFiClientSecure` — payload MQTT không mã hóa trên đường truyền (`mqtt_sender.cpp`, `mqtt_client.cpp`) |
| 2 | **Credentials trong `#define` flash** | `SECRET_KEY`, `GW_SECRET_KEY`, `WIFI_PASS` lưu plain text trong firmware binary (`config.h`, `config_gw.h`) — ai có thiết bị và công cụ đọc flash có thể trích xuất |
| 3 | **Config files commit lên Git** | `firmware/sensor-node/include/config.h` và `firmware/gateway-node/include/config_gw.h` chứa credentials thực đang được Git track — cần thêm vào `.gitignore` |
| 4 | **KNOWN_SENSORS[] hardcode** | Thêm/xóa sensor cần sửa `config_gw.h` và re-flash gateway (giảm thiểu bởi dynamic registry nhưng fallback vẫn tồn tại) |
| 5 | **Không có secure boot** | ESP32 DOIT DevKit V1 không được cấu hình Secure Boot — firmware có thể bị thay thế bởi firmware giả |

### 12.2. Hạn chế phía Backend

| # | Hạn chế | Chi tiết |
|---|---------|---------|
| 6 | **`device_tokens` chưa dùng** | Bảng tồn tại trong schema nhưng không có route nào ghi/đọc — cơ chế session token dài hạn chưa triển khai (`database/migrations/001_schema.sql`) |
| 7 | **Không có JWT refresh token** | JWT hết hạn sau 8 giờ, người dùng phải đăng nhập lại. Không có cơ chế renew mà không cần re-authenticate |
| 8 | **`secret_key` plain text trong DB** | Cần thiết cho HMAC nhưng nếu DB bị lộ, toàn bộ credentials thiết bị bị compromise. Có thể giảm thiểu bằng DB-level encryption |
| 9 | **Không có cơ chế rotate `secret_key`** | Không có endpoint cấp `secret_key` mới — nếu key bị lộ phải xóa và đăng ký lại thiết bị |
| 10 | **Account lockout chưa có cho user** | Chỉ rate limit login (10/15min), không có fail_count cho tài khoản web. Khác với thiết bị IoT đã có fail_count + auto-block |
| 11 | **Password policy tối thiểu** | Chỉ kiểm tra độ dài >= 6 ký tự, chưa kiểm tra độ phức tạp |
| 12 | **RBAC chưa có phân quyền theo nhóm thiết bị** | Mọi user cùng role đều thấy mọi thiết bị — chưa có khái niệm device group |

### 12.3. Hạn chế cơ sở hạ tầng

| # | Hạn chế | Chi tiết |
|---|---------|---------|
| 13 | **Nginx HTTP only** | Port 80, không SSL certificate — dữ liệu HTTP (API, cookie JWT) truyền plain text |
| 14 | **Mosquitto plain TCP** | Broker 1 :1883 và Broker 2 :1884, không TLS — dữ liệu MQTT truyền plain text trong mạng LAN |

---

## 13. Hướng phát triển tiếp theo

### Ưu tiên cao (bảo mật cơ bản khi deploy thực tế)

1. **Bật HTTPS + MQTT TLS:**
   - Nginx: thêm SSL certificate, redirect HTTP→HTTPS
   - Mosquitto: cấu hình TLS port 8883 cho cả `mosquitto/broker1/mosquitto.conf` và `mosquitto/broker2/mosquitto.conf`
   - Firmware: chuyển sang `WiFiClientSecure`, set ca_cert cho server certificate

2. **Gitignore config firmware:**
   - Thêm `firmware/*/include/config*.h` vào `.gitignore`
   - Tạo `config.h.example` với placeholder values thay thế
   - Tránh leak credentials khi repo được chia sẻ

3. **Hoàn thiện `device_tokens`:**
   - `POST /api/devices/:id/token` — cấp long-lived token (JWT hoặc random bytes)
   - `DELETE /api/devices/:id/token` — revoke token
   - Có thể dùng để thay thế KNOWN_SENSORS[] hardcode trong firmware

### Ưu tiên trung bình

4. **Rotate `secret_key`:**
   - `PATCH /api/devices/:id/rotate-key` (admin only)
   - Sinh secret_key mới, trả về 1 lần, firmware cần update

5. **Account lockout cho user web:**
   - Thêm cột `login_fail_count` vào bảng `users`
   - Block tạm thời sau 10 lần sai trong 15 phút (tương tự thiết bị IoT)

6. **JWT refresh token:**
   - Cấp `refresh_token` (HttpOnly, 7 ngày) khi login
   - `POST /api/auth/refresh` để gia hạn access token 8h

7. **Password policy nâng cao:**
   - Tối thiểu 8 ký tự, ít nhất 1 chữ hoa, 1 số hoặc 1 ký tự đặc biệt

### Ưu tiên thấp (mở rộng quy mô)

8. **Phân quyền theo nhóm thiết bị:**
   - Bảng `device_groups` và `user_device_permissions`
   - Operator chỉ quản lý thiết bị được phân công

9. **ESP32 Secure Boot:**
   - Cấu hình Secure Boot v2 và Flash Encryption trong ESP32 eFuse
   - Ngăn chặn thay thế firmware và đọc flash

10. **Giám sát bảo mật realtime:**
    - Cảnh báo khi `DEVICE_BLOCKED` hoặc nhiều `GATEWAY_AUTH_FAIL` liên tiếp
    - Webhook hoặc notification service

---

## 14. Kết luận

Hệ thống đã triển khai một bộ cơ chế bảo mật đa lớp, vượt đáng kể so với yêu cầu ban đầu `device_id + token + data`. Điểm đặc biệt là bảo mật được triển khai xuyên suốt từ lớp firmware nhúng đến backend server.

**Bảo mật lớp Firmware (C++/ESP32):**
- Sensor Node ký dữ liệu bằng HMAC-SHA256 (mbedTLS) trước khi publish MQTT
- Firmware từ chối gửi nếu NTP chưa đồng bộ — đảm bảo timestamp hợp lệ cho chống replay attack
- Gateway Node xác thực từng Sensor bằng HMAC + timestamp (±300s) tại chỗ trước khi forward
- `safeEq64()` constant-time comparison tại firmware chống timing attack
- Sensor whitelist hai tầng (dynamic registry 5 phút + static KNOWN_SENSORS[]) với lazy refresh
- Buffer overflow protection trong MQTT message handler

**Bảo mật lớp Backend (Node.js/Express):**
- HMAC 2 lớp độc lập (Gateway + Sensor) với `crypto.timingSafeEqual()` chống timing attack
- Timestamp window ±300s tại backend (×2, cho cả Gateway HMAC và Sensor HMAC)
- Auto-block thiết bị sau 5 lần xác thực thất bại với audit log đầy đủ
- RBAC 3 vai trò (admin/operator/viewer) với middleware `verifyJWT` + `requireRole`
- JWT HttpOnly + SameSite=Strict chống XSS và CSRF
- Dummy bcrypt hash login chống user enumeration timing attack
- Rate limiting 3 mức, Helmet, CORS, body limit, prepared statements
- Audit log 9 event types cho truy vết bảo mật

**Điểm cần hoàn thiện khi deploy thực tế:**
- Bật TLS cho MQTT (port 8883) và HTTPS cho Nginx — đây là ưu tiên cao nhất
- Gitignore các file config firmware có chứa credentials thực
- Hoàn thiện `device_tokens` và cơ chế rotate `secret_key`

Nhìn chung, hệ thống đã đủ bảo mật cho môi trường mạng LAN nội bộ với mức bảo vệ vượt yêu cầu đồ án. Các cơ chế như two-layer HMAC, timestamp replay prevention, constant-time comparison, và auto-block là những kỹ thuật bảo mật được sử dụng trong các hệ thống IoT thực tế.
