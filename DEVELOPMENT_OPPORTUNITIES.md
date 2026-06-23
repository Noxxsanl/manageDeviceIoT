# Cơ hội phát triển — managerDeviceIoT-RBAC

> Được phân tích từ toàn bộ codebase (frontend, backend, firmware, docs, scripts).  
> Ưu tiên từ **cao** → **thấp**. Mỗi mục ghi rõ vị trí liên quan trong code.

---

## Mục lục

- [0. Hạn chế cốt lõi cần cải tiến cho môi trường thực tế](#0-hạn-chế-cốt-lõi-cần-cải-tiến-cho-môi-trường-thực-tế)
- [1. Ưu tiên cao — Bảo mật & Tính năng cốt lõi](#1-ưu-tiên-cao--bảo-mật--tính-năng-cốt-lõi)
  - [1.1 WebSocket / SSE — Trang `/logs` còn là stub](#11-websocket--sse--trang-logs-còn-là-stub)
  - [1.2 TLS cho kênh truyền MQTT — Điểm yếu (1)](#12-tls-cho-kênh-truyền-mqtt--điểm-yếu-1)
  - [1.3 Key Rotation — Luân chuyển secret key — Điểm yếu (2)](#13-key-rotation--luân-chuyển-secret-key--điểm-yếu-2)
  - [1.4 Encryption at Rest cho secret key — Điểm yếu (3)](#14-encryption-at-rest-cho-secret-key--điểm-yếu-3)
  - [1.5 Xác thực đa yếu tố (MFA) cho Admin — Điểm yếu (4)](#15-xác-thực-đa-yếu-tố-mfa-cho-admin--điểm-yếu-4)
  - [1.6 Mở rộng sang ABAC — Điểm yếu (5)](#16-mở-rộng-sang-abac--điểm-yếu-5)
  - [1.7 Tự động backup database](#17-tự-động-backup-database)
  - [1.8 Audit log TTL tự động cho tất cả event type](#18-audit-log-ttl-tự-động-cho-tất-cả-event-type)
  - [1.9 Log kết nối thiết bị (Connection Logging)](#19-log-kết-nối-thiết-bị-connection-logging)
  - [1.10 IoT Intrusion Detection System (IDS)](#110-iot-intrusion-detection-system-ids)
  - [1.11 Mã hóa payload data AES-256-GCM (sensor → backend)](#111-mã-hóa-payload-data-aes-256-gcm-sensor--backend)
- [2. Ưu tiên trung bình — Trải nghiệm người dùng & Vận hành](#2-ưu-tiên-trung-bình--trải-nghiệm-người-dùng--vận-hành)
  - [2.1 Global Toast Notification System](#21-global-toast-notification-system)
  - [2.2 Bulk Operations cho Device](#22-bulk-operations-cho-device)
  - [2.3 Export dữ liệu (CSV / JSON)](#23-export-dữ-liệu-csv--json)
  - [2.4 Hệ thống cảnh báo ngưỡng (Alert / Threshold)](#24-hệ-thống-cảnh-báo-ngưỡng-alert--threshold)
  - [2.5 OTA + Chữ ký số RSA-256 — Điểm yếu (8)](#25-ota-over-the-air-firmware-update--chữ-ký-số-rsa256)
  - [2.6 Phân trang & Filter nâng cao cho Dashboard](#26-phân-trang--filter-nâng-cao-cho-dashboard)
  - [2.7 Gửi cảnh báo qua Email / Telegram](#27-gửi-cảnh-báo-qua-email--telegram)
- [3. Ưu tiên trung bình — Firmware & Hardware](#3-ưu-tiên-trung-bình--firmware--hardware)
  - [3.1 Hỗ trợ thêm loại sensor](#31-hỗ-trợ-thêm-loại-sensor)
  - [3.2 Chế độ tiết kiệm điện (Deep Sleep)](#32-chế-độ-tiết-kiệm-điện-deep-sleep)
  - [3.3 Configurable send interval qua API](#33-configurable-send-interval-qua-api)
  - [3.4 Điều khiển thiết bị từ giao diện xuống phần cứng](#34-điều-khiển-thiết-bị-từ-giao-diện-xuống-phần-cứng)
- [4. Ưu tiên thấp — Chất lượng & Hạ tầng](#4-ưu-tiên-thấp--chất-lượng--hạ-tầng)
  - [4.1 Test coverage — Hiện tại bằng 0](#41-test-coverage--hiện-tại-bằng-0)
  - [4.2 Multi-language / i18n](#42-multi-language--i18n)
  - [4.3 API Key authentication (bổ sung cho JWT)](#43-api-key-authentication-bổ-sung-cho-jwt)
  - [4.4 Prometheus / Grafana Monitoring — Điểm yếu (7)](#44-prometheus--grafana-monitoring--điểm-yếu-7)
  - [4.5 MQTT Authentication (username/password)](#45-mqtt-authentication-usernamepassword)
  - [4.6 Device Grouping / Asset Management](#46-device-grouping--asset-management)
  - [4.7 Rate limiting cho WebSocket/SSE (khi implement)](#47-rate-limiting-cho-websocketsse-khi-implement)
  - [4.8 Khả năng mở rộng quy mô (Scalability) — Điểm yếu (6)](#48-khả-năng-mở-rộng-quy-mô-scalability--điểm-yếu-6)
- [Tóm tắt theo độ phức tạp](#tóm-tắt-theo-độ-phức-tạp)

---

## 0. Hạn chế cốt lõi cần cải tiến cho môi trường thực tế

> Hệ thống đã đáp ứng yêu cầu đề tài ở mức cơ bản nhưng còn 10 hạn chế quan trọng nếu triển khai vào môi trường production thực tế. Mỗi mục được phân tích chi tiết ở các section bên dưới.

| # | Hạn chế | Mức độ rủi ro | Chi tiết tại |
|---|---------|--------------|-------------|
| (1) | Kênh MQTT truyền plaintext — payload sensor không mã hóa nội dung | **Cao** | [1.2](#12-tls-cho-kênh-truyền-mqtt--điểm-yếu-1) |
| (2) | Không có cơ chế luân chuyển secret key (key rotation) | **Cao** | [1.3](#13-key-rotation--luân-chuyển-secret-key--điểm-yếu-2) |
| (3) | Secret key lưu plaintext trong database (no encryption at rest) | **Cao** | [1.4](#14-encryption-at-rest-cho-secret-key--điểm-yếu-3) |
| (4) | Không có xác thực đa yếu tố (MFA) cho tài khoản quản trị | **Cao** | [1.5](#15-xác-thực-đa-yếu-tố-mfa-cho-admin--điểm-yếu-4) |
| (5) | RBAC chưa đủ khi có nhiều loại thiết bị/vị trí → cần ABAC | **Trung** | [1.6](#16-mở-rộng-sang-abac--điểm-yếu-5) |
| (6) | Chưa có khả năng mở rộng quy mô (MQTT cluster, time-series DB, queue) | **Trung** | [4.8](#48-khả-năng-mở-rộng-quy-mô-scalability--điểm-yếu-6) |
| (7) | Thiếu giám sát/cảnh báo tự động để phát hiện tấn công | **Trung** | [4.4](#44-prometheus--grafana-monitoring--điểm-yếu-7) |
| (8) | OTA không có chữ ký số RSA/ECC — firmware giả có thể cài vào thiết bị | **Cao** | [2.5](#25-ota-over-the-air-firmware-update--chữ-ký-số-rsa256) |
| (9) | Không có IDS — device spoofing, data injection, flooding không bị phát hiện | **Cao** | [1.10](#110-iot-intrusion-detection-system-ids) |
| (10) | Không có log kết nối thiết bị (CONNECT / DISCONNECT events) | **Trung** | [1.9](#19-log-kết-nối-thiết-bị-connection-logging) |

---

## 1. Ưu tiên cao — Bảo mật & Tính năng cốt lõi

### 1.1 WebSocket / SSE — Trang `/logs` còn là stub
**Tại sao:** Trang `frontend/src/app/logs/page.tsx` có comment "dựng sẵn cho luồng log thời gian thực trong tương lai (WebSocket / SSE)" — đây là tính năng đã lên kế hoạch nhưng chưa làm.  
**Cần làm:**
- Backend: Thêm endpoint SSE `GET /api/logs/stream` hoặc tích hợp `socket.io`
- Frontend: Kết nối SSE/WebSocket, render audit events theo thời gian thực trên trang `/logs`
- Hiện tại: Dùng SWR polling (vài giây/lần) — không phải real-time thực sự

---

### 1.2 TLS cho kênh truyền MQTT — Điểm yếu (1)
**Tại sao:** Mosquitto đang chạy plain-text port `:1883` và `:1884`. Toàn bộ dữ liệu cảm biến, HMAC token, và cả secret được trao đổi dạng plaintext. Kẻ tấn công trong cùng mạng LAN có thể sniff và replay gói tin — vô hiệu hóa lớp bảo vệ HMAC.  
**Rủi ro cụ thể:** `secret_key` gửi từ firmware lên gateway → backend có thể bị capture bằng Wireshark trên LAN.  
**Cần làm:**
- Tạo chứng chỉ TLS (self-signed hoặc Let's Encrypt) cho Mosquitto
- Cập nhật `mosquitto/mosquitto1.conf` và `mosquitto2.conf`: `listener 8883`, `cafile`, `certfile`, `keyfile`
- Firmware: cập nhật `firmware/sensor-node/src/mqtt_client.*` và `firmware/gateway-node/src/mqtt_client.*` — dùng port 8883, load CA cert vào `WiFiClientSecure`, tắt `setInsecure()`
- `docker-compose.yml`: expose port 8883 thay vì 1883
- Backend `mqttDataService.ts`: kết nối với `protocol: 'mqtts'`

---

### 1.3 Key Rotation — Luân chuyển secret key — Điểm yếu (2)
**Tại sao:** Hiện tại secret key được cấp một lần khi đăng ký thiết bị, sau đó không bao giờ thay đổi trừ khi nạp lại firmware thủ công. Nếu key bị lộ (qua sniff, log, hay thiết bị bị lấy cắp), attacker có thể giả mạo thiết bị vô thời hạn — hệ thống không có cách phát hiện hay vô hiệu hóa key cũ.  
**Rủi ro cụ thể:** Key tồn tại trong `devices.secret_key` (DB), `config.h` (firmware flash), và có thể trong log hệ thống — nhiều điểm lộ lọt.  
**Cần làm:**
- DB: Thêm bảng `device_key_history` lưu key cũ + thời điểm thu hồi
- Backend: Endpoint `POST /api/devices/:id/rotate-key` (admin only) — sinh key mới, vô hiệu hóa key cũ sau grace period (e.g. 5 phút)
- `hmacService.ts`: Trong grace period, chấp nhận cả key cũ lẫn key mới để firmware kịp cập nhật
- Firmware: Subscribe command topic `local/sensors/{id}/cmd` để nhận key mới → lưu vào NVS (Non-Volatile Storage) của ESP32 thay vì hardcode trong `config.h`
- Frontend: Nút "Rotate Key" trong trang Device Detail, hiển thị key mới một lần

---

### 1.4 Encryption at Rest cho secret key — Điểm yếu (3)
**Tại sao:** Cột `devices.secret_key` lưu plaintext trong MySQL. Bất kỳ ai có quyền truy cập DB (backup file, DB dump, SQL injection nếu có lỗ hổng tương lai) đều lấy được toàn bộ secret key của mọi thiết bị.  
**Rủi ro cụ thể:** `SELECT secret_key FROM devices` — một câu lệnh, lấy được key của tất cả thiết bị.  
**Cần làm:**
- Backend: Dùng AES-256-GCM để mã hóa `secret_key` trước khi INSERT, giải mã khi cần dùng trong `hmacService.ts`
- Encryption key (master key) lưu trong biến môi trường `DEVICE_KEY_ENCRYPTION_KEY` — không lưu trong DB
- Migration: Script `scripts/encrypt_existing_keys.ts` để mã hóa các key đang lưu plaintext
- Hoặc dùng MySQL Column-Level Encryption (`AES_ENCRYPT` / `AES_DECRYPT`) nếu muốn đơn giản hơn

---

### 1.5 Xác thực đa yếu tố (MFA) cho Admin — Điểm yếu (4)
**Tại sao:** Tài khoản admin chỉ bảo vệ bằng username/password. Nếu password bị brute-force hoặc lộ, attacker chiếm toàn quyền hệ thống (xem key thiết bị, thêm user, xóa log).  
**Rủi ro cụ thể:** Rate limit 10 req/15min có thể bị bypass qua distributed attack từ nhiều IP.  
**Cần làm:**
- Cài `speakeasy` (TOTP) + `qrcode` cho backend
- Endpoint: `POST /api/auth/mfa/setup` — sinh secret, trả QR code (base64 PNG)
- Endpoint: `POST /api/auth/mfa/verify` — nhận TOTP code, trả JWT sau khi xác thực thành công
- DB: Thêm cột `mfa_secret` (encrypted), `mfa_enabled` vào bảng `users`
- Frontend: Flow setup MFA trong trang profile admin (hiển thị QR → nhập code xác nhận → enable)
- Áp dụng bắt buộc cho role `admin`, optional cho `operator`

---

### 1.6 Mở rộng sang ABAC — Điểm yếu (5)
**Tại sao:** RBAC (3 role cố định) đủ cho hệ thống nhỏ nhưng không linh hoạt khi mở rộng. Ví dụ: operator A chỉ được quản lý sensor ở tầng 1, operator B quản lý tầng 2 — RBAC không biểu diễn được điều này.  
**Kịch bản cụ thể cần ABAC:**
- Thiết bị có thuộc tính: `location` (tầng/phòng/tòa nhà), `device_type`, `owner_department`
- User có thuộc tính: `department`, `clearance_level`
- Policy: "Operator chỉ đọc được dữ liệu của thiết bị trong cùng department"
**Cần làm:**
- DB: Thêm bảng `device_attributes` và `user_attributes`
- Backend: Thay middleware `rbac` bằng policy engine (dùng `casbin` với adapter cho MySQL)
- Định nghĩa policy file `policy.csv` dạng: `p, role:operator, resource:device, action:read, effect:allow, cond:same_department`
- Giữ RBAC làm tầng 1 (coarse-grained), thêm ABAC làm tầng 2 (fine-grained)

---

### 1.7 Tự động backup database
**Tại sao:** Không có cơ chế backup nào. Mất container MySQL = mất toàn bộ dữ liệu lịch sử và cấu hình thiết bị.  
**Cần làm:**
- Thêm script `scripts/backup.sh` chạy `mysqldump` định kỳ
- Tích hợp vào `docker-compose.yml` như một service cron
- Mount volume backup ra ngoài container

---

### 1.8 Audit log TTL tự động cho tất cả event type
**Tại sao:** Auto-prune hiện chỉ áp dụng cho `DATA_RECV` (150 records/device). Các event như `AUTH_FAIL`, `DEVICE_BLOCKED` không bao giờ bị xóa tự động — DB sẽ phình to theo thời gian.  
**File:** `backend/src/services/auditLogger.ts`  
**Cần làm:**
- Thêm cron job (hoặc DB stored procedure) xóa log cũ hơn N ngày theo từng `event_type`
- Expose config này trong `.env` (e.g. `AUDIT_LOG_RETENTION_DAYS=90`)

---

### 1.9 Log kết nối thiết bị (Connection Logging)
**Tại sao:** Hiện tại không có log nào ghi lại sự kiện thiết bị kết nối / ngắt kết nối khỏi MQTT broker. Nếu thiết bị bị thay thế, mạng bị xâm nhập, hoặc firmware bị crash loop — không có cách nào điều tra sau sự kiện (forensics). Log kết nối cũng là dữ liệu đầu vào quan trọng cho IDS (mục 1.10).  
**Rủi ro cụ thể:** Attacker clone thiết bị (device spoofing) và kết nối vào broker — không để lại dấu vết nào trong hệ thống hiện tại.  
**Cần làm:**

*Backend — MQTT Connect/Disconnect tracking:*
- File `backend/src/services/mqttTracker.ts` hiện đã subscribe `$SYS/broker/log/N` để lấy IP. Mở rộng để parse sự kiện `CONNECT` và `DISCONNECT` từ `$SYS/broker/clients/connected` và `$SYS/broker/log/N`
- Hoặc dùng Mosquitto plugin `auth_plugin` với hook `on_connect` / `on_disconnect` gọi webhook về backend
- Thêm audit event types mới: `DEVICE_CONNECT`, `DEVICE_DISCONNECT`

*Database — schema:*
```sql
ALTER TABLE audit_log MODIFY COLUMN event_type ENUM(
  'DATA_RECV','DEVICE_REGISTER','DEVICE_STATUS_CHANGE','DEVICE_BLOCKED',
  'DEVICE_DELETE','AUTH_FAIL','GATEWAY_AUTH_FAIL','SENSOR_AUTH_FAIL',
  'DEVICE_CONNECT','DEVICE_DISCONNECT',          -- mới
  'OTA_START','OTA_SUCCESS','OTA_FAIL',           -- mới (cho mục 2.5)
  'IDS_ALERT'                                     -- mới (cho mục 1.10)
) NOT NULL;
```

*OTA Logging (đi kèm với mục 2.5):*
- Khi firmware gửi request OTA: log `OTA_START` với version cũ
- Khi OTA thành công / thất bại: log `OTA_SUCCESS` / `OTA_FAIL` với version mới và checksum
- Frontend: Hiển thị lịch sử OTA trong trang Device Detail

*Dashboard:*
- Thêm panel "Kết nối gần đây" hiển thị 10 sự kiện `DEVICE_CONNECT`/`DEVICE_DISCONNECT` mới nhất

---

### 1.10 IoT Intrusion Detection System (IDS)
**Tại sao:** Hệ thống không có khả năng phát hiện các hành vi tấn công IoT phổ biến. HMAC chỉ xác thực nguồn gốc — không phát hiện được: thiết bị gửi dữ liệu giả (data injection), tần suất gửi bất thường (flooding/DoS), hoặc thiết bị clone kết nối từ IP khác (device spoofing).  
**Phương pháp áp dụng: Rule-based IDS** (kết hợp Statistical baseline) — phù hợp nhất với kiến trúc Express + MySQL hiện tại, không cần infrastructure ML.

---

#### Các hành vi bắt buộc phát hiện

| Hành vi | Phương pháp phát hiện | Rule cụ thể |
|---------|----------------------|-------------|
| **Flooding / DoS** | Rule-based (rate limit) | > 20 message/phút từ 1 device → `suspicious`; > 60/phút → `attack` |
| **Data Injection** | Statistical (Z-score) | Giá trị vượt `mean ± 3σ` so với 50 reading gần nhất → `suspicious` |
| **Device Spoofing** | Rule-based (IP change) | IP kết nối thay đổi so với `last_ip` đã đăng ký → `suspicious` |
| **Replay Attack** | Rule-based (timestamp) | `sn_timestamp` trùng với timestamp đã xử lý trong 10 phút → `attack` |
| **Burst Auth Fail** | Rule-based (counter) | > 3 `AUTH_FAIL` trong 1 phút từ cùng IP → `attack` (bổ sung cho block threshold) |

---

#### DB Schema — trạng thái mối đe dọa thiết bị

```sql
-- Migration mới: thêm vào backend/src/config/migrate.ts
ALTER TABLE devices
  ADD COLUMN threat_status ENUM('normal','suspicious','attack') NOT NULL DEFAULT 'normal',
  ADD COLUMN threat_reason VARCHAR(255) NULL,
  ADD COLUMN threat_detected_at DATETIME NULL;

-- Bảng lưu sliding window message count cho IDS flooding detection
CREATE TABLE ids_message_counts (
  device_id     INT UNSIGNED NOT NULL,
  window_start  DATETIME NOT NULL,
  msg_count     INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, window_start),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Bảng lưu seen timestamps cho replay detection
CREATE TABLE ids_seen_timestamps (
  device_id   INT UNSIGNED NOT NULL,
  ts_value    BIGINT NOT NULL,
  seen_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id, ts_value),
  INDEX idx_seen_at (seen_at)
);
```

---

#### Backend — IDS Service (`backend/src/services/idsService.ts`)

```typescript
// Kiến trúc tổng quát
export interface IdsResult {
  threat: 'normal' | 'suspicious' | 'attack';
  reason: string | null;
}

// 3 hàm kiểm tra độc lập, gọi song song trong mqttDataService.ts
export async function checkFlooding(deviceId: number): Promise<IdsResult>
export async function checkDataInjection(deviceId: number, data: Record<string,number>): Promise<IdsResult>
export async function checkDeviceSpoofing(deviceId: number, incomingIp: string): Promise<IdsResult>
export async function checkReplayAttack(deviceId: number, timestamp: number): Promise<IdsResult>

// Tổng hợp kết quả: lấy mức cao nhất (attack > suspicious > normal)
export async function runIdsChecks(params: IdsParams): Promise<IdsResult>
```

**Tích hợp vào `mqttDataService.ts`** — sau bước verify HMAC thành công:
```typescript
// Trong handleGatewayData(), sau khi HMAC pass:
const idsResult = await runIdsChecks({
  gatewayId: gateway.id, gatewayIp: resolvedGwIp,
  sensorId:  sensor.id,  sensorIp:  resolvedSnIp,
  sensorTimestamp: Number(sn_timestamp),
  data,
});

if (idsResult.threat !== 'normal') {
  await pool.execute(
    `UPDATE devices SET threat_status=?, threat_reason=?, threat_detected_at=NOW() WHERE id=?`,
    [idsResult.threat, idsResult.reason, sensor.id]
  );
  await log('IDS_ALERT', sensor.id, null, null, {
    threat: idsResult.threat, reason: idsResult.reason,
    sensor_id: sensor.device_id, gateway_id: gateway.device_id,
  });
  // Tạo notification cho admin nếu là 'attack'
  if (idsResult.threat === 'attack') {
    await createNotification({ title: 'Cảnh báo tấn công IoT', ... });
  }
}
```

---

#### API — Endpoint IDS

```
GET  /api/devices/:id/threat     → { threat_status, threat_reason, threat_detected_at }
POST /api/devices/:id/threat/clear  → Reset về 'normal' (admin only)
GET  /api/ids/alerts             → Danh sách IDS_ALERT log, filter theo threat level
```

---

#### Frontend — Hiển thị trạng thái IDS

**Cột "Bảo mật" mới trong bảng thiết bị (`DevicesPage.tsx`):**
```tsx
// Badge trạng thái threat
const ThreatBadge = ({ status }: { status: 'normal'|'suspicious'|'attack' }) => {
  if (status === 'attack')     return <span className="bg-red-100 text-red-700 ...">Attack</span>;
  if (status === 'suspicious') return <span className="bg-amber-100 text-amber-700 ...">Suspicious</span>;
  return <span className="bg-emerald-100 text-emerald-700 ...">Normal</span>;
};
```

**Dashboard alert panel:**
- Widget "IDS Alerts" hiển thị các thiết bị đang có `threat_status ≠ normal`
- Click vào device → trang Device Detail hiển thị chi tiết threat reason + lịch sử IDS events

**Trang Device Detail:**
- Section "Bảo mật / IDS" với: trạng thái hiện tại, lý do, thời điểm phát hiện
- Nút "Clear Alert" (admin only)
- Biểu đồ message rate 1 giờ gần nhất (phát hiện flooding trực quan)

---

#### Statistical baseline — Data Injection detection

```sql
-- Query tính mean và stddev của 50 reading gần nhất cho mỗi field
SELECT
  AVG(JSON_EXTRACT(payload, '$.temperature')) AS mean_temp,
  STDDEV(JSON_EXTRACT(payload, '$.temperature')) AS std_temp,
  AVG(JSON_EXTRACT(payload, '$.humidity')) AS mean_hum,
  STDDEV(JSON_EXTRACT(payload, '$.humidity')) AS std_hum
FROM (
  SELECT payload FROM sensor_data
  WHERE device_id = ? ORDER BY id DESC LIMIT 50
) t
```

Nếu giá trị mới nằm ngoài `mean ± 3σ` → đánh dấu `suspicious`.  
Nếu nằm ngoài `mean ± 5σ` HOẶC vượt ngưỡng vật lý (temp < -40 hoặc > 125°C với DHT22) → đánh dấu `attack`.

---

**File cần tạo mới / sửa:**
| File | Hành động |
|------|-----------|
| `backend/src/services/idsService.ts` | Tạo mới |
| `backend/src/services/mqttDataService.ts` | Thêm `runIdsChecks()` call sau HMAC verify |
| `backend/src/routes/devices.ts` | Thêm 2 endpoint threat |
| `backend/src/routes/index.ts` | Mount route IDS alerts |
| `backend/src/config/migrate.ts` | Thêm 3 migration mới |
| `frontend/src/features/devices/pages/DevicesPage.tsx` | Thêm cột ThreatBadge |
| `frontend/src/features/devices/pages/DeviceDetailPage.tsx` | Thêm IDS section |
| `frontend/src/features/dashboard/pages/DashboardPage.tsx` | Thêm IDS alert widget |
| `frontend/src/shared/types/api.ts` | Thêm `threat_status` vào `ApiDevice` |

---

### 1.11 Mã hóa payload data AES-256-GCM (sensor → backend)

**Tại sao:** Hiện tại trường `data` trong payload sensor (**temperature**, **humidity**) được gửi dạng **JSON plaintext**. Bất kỳ ai sniff được MQTT traffic đều đọc được giá trị thực. TLS (mục 1.2) mã hóa kênh truyền nhưng nếu broker bị xâm nhập, dữ liệu vẫn lộ. Mã hóa payload ở lớp ứng dụng (end-to-end) đảm bảo **chỉ backend mới giải mã được** — broker, gateway, và kẻ tấn công man-in-the-middle đều không đọc được nội dung.

**Phương pháp:** AES-256-GCM — cung cấp đồng thời **mã hóa + xác thực toàn vẹn** (authenticated encryption), không cần thêm HMAC riêng cho phần data.  
**Key:** Derive từ `secret_key` hiện có qua SHA-256 với domain separator — tách biệt hoàn toàn với key dùng cho HMAC.

---

#### Payload trước và sau khi mã hóa

**Trước (plaintext — hiện tại):**
```json
{
  "sensor_id":    "ESP32-SN-XXXX",
  "sn_timestamp": 1700000000,
  "sn_hmac":      "64-char lowercase hex",
  "data": {
    "temperature": 28.5,
    "humidity":    65.2
  }
}
```

**Sau (trường `data` được thay bằng `enc`):**
```json
{
  "sensor_id":    "ESP32-SN-XXXX",
  "sn_timestamp": 1700000000,
  "sn_hmac":      "64-char lowercase hex",
  "enc":          "base64( IV[12] ‖ ciphertext[N] ‖ GCM-tag[16] )"
}
```

`sensor_id`, `sn_timestamp`, `sn_hmac` giữ nguyên plaintext vì gateway cần đọc để xác thực HMAC và routing. Chỉ phần **nội dung cảm biến** được mã hóa.

---

#### Thiết kế kỹ thuật

```
secret_key (hex, 32 bytes, lưu trong DB)
    │
    ▼ SHA-256("iot-enc-v1:" ‖ secret_bytes)
aes_key (32 bytes)  ←── tách biệt với HMAC key

Sensor:
  plaintext  = '{"temperature":28.5,"humidity":65.2}'
  aad        = "ESP32-SN-XXXX:1700000000"   ← sensor_id:sn_timestamp
  iv         = 12 random bytes (esp_fill_random)
  ciphertext, tag = AES-256-GCM.encrypt(aes_key, iv, plaintext, aad)
  enc        = base64(iv ‖ ciphertext ‖ tag)

Backend:
  buf        = base64_decode(enc)
  iv         = buf[0:12]
  tag        = buf[-16:]
  ciphertext = buf[12:-16]
  aad        = "ESP32-SN-XXXX:1700000000"
  plaintext  = AES-256-GCM.decrypt(aes_key, iv, ciphertext, aad, tag)
  data       = JSON.parse(plaintext)   → { temperature: 28.5, humidity: 65.2 }
```

AAD (Additional Authenticated Data) = `sensor_id:sn_timestamp` ràng buộc ciphertext với danh tính thiết bị — ngăn attacker lấy ciphertext của sensor A ghép vào packet của sensor B.

---

#### Firmware Sensor — C++ (mbedTLS có sẵn trong ESP32 Arduino Core)

**Thêm file `firmware/sensor-node/lib/aes_gcm/aes_gcm.h`:**
```cpp
#pragma once
#include <Arduino.h>

// Derive 32-byte AES key from hex secret key
// key = SHA-256("iot-enc-v1:" || secretBytes)
bool deriveAesKey(const char* secretHex, uint8_t outKey[32]);

// Encrypt plaintext with AES-256-GCM
// Returns base64(IV[12] + ciphertext + tag[16]), empty string on error
String aesGcmEncrypt(const char* plaintext, size_t plainLen,
                     const char* aad,       size_t aadLen,
                     const char* secretHex);
```

**`firmware/sensor-node/lib/aes_gcm/aes_gcm.cpp`:**
```cpp
#include "aes_gcm.h"
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include "esp_random.h"

// Hex string → bytes
static void hexToBytes(const char* hex, uint8_t* out, size_t len) {
    for (size_t i = 0; i < len; i++) {
        char b[3] = { hex[i*2], hex[i*2+1], '\0' };
        out[i] = (uint8_t)strtol(b, nullptr, 16);
    }
}

// Base64 encode (ESP32 Arduino Core có sẵn base64.h)
#include <base64.h>
static String b64Encode(const uint8_t* data, size_t len) {
    return base64::encode(data, len);
}

bool deriveAesKey(const char* secretHex, uint8_t outKey[32]) {
    uint8_t secretBytes[32];
    hexToBytes(secretHex, secretBytes, 32);

    mbedtls_md_context_t ctx;
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_init(&ctx);
    if (mbedtls_md_setup(&ctx, info, 0) != 0) return false;
    mbedtls_md_starts(&ctx);
    mbedtls_md_update(&ctx, (const uint8_t*)"iot-enc-v1:", 11);
    mbedtls_md_update(&ctx, secretBytes, 32);
    mbedtls_md_finish(&ctx, outKey);
    mbedtls_md_free(&ctx);
    return true;
}

String aesGcmEncrypt(const char* plaintext, size_t plainLen,
                     const char* aad,       size_t aadLen,
                     const char* secretHex) {
    uint8_t aesKey[32];
    if (!deriveAesKey(secretHex, aesKey)) return "";

    uint8_t iv[12];
    esp_fill_random(iv, 12);   // hardware True RNG của ESP32

    uint8_t* cipher = new uint8_t[plainLen];
    uint8_t  tag[16];

    mbedtls_gcm_context gcm;
    mbedtls_gcm_init(&gcm);
    int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, aesKey, 256);
    if (ret == 0) {
        ret = mbedtls_gcm_crypt_and_tag(
            &gcm, MBEDTLS_GCM_ENCRYPT,
            plainLen,
            iv, 12,
            (const uint8_t*)aad, aadLen,
            (const uint8_t*)plaintext, cipher,
            16, tag
        );
    }
    mbedtls_gcm_free(&gcm);

    if (ret != 0) { delete[] cipher; return ""; }

    // Pack: IV(12) ‖ ciphertext(N) ‖ tag(16)
    size_t   totalLen = 12 + plainLen + 16;
    uint8_t* packed   = new uint8_t[totalLen];
    memcpy(packed,              iv,     12);
    memcpy(packed + 12,         cipher, plainLen);
    memcpy(packed + 12 + plainLen, tag, 16);

    String result = b64Encode(packed, totalLen);
    delete[] cipher;
    delete[] packed;
    return result;
}
```

**Sửa `firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp`** — thay `doc["data"]` bằng `doc["enc"]`:
```cpp
#include "aes_gcm.h"

bool mqttPublishSensorData(const SensorData& data) {
    // ... setup timestamp, hmac như cũ ...

    // 1. Serialize data thành JSON string
    StaticJsonDocument<128> dataDoc;
    dataDoc["temperature"] = data.temperature;
    dataDoc["humidity"]    = data.humidity;
    char dataStr[128];
    serializeJson(dataDoc, dataStr, sizeof(dataStr));

    // 2. Mã hóa data với AAD = "sensor_id:timestamp"
    char aad[96];
    snprintf(aad, sizeof(aad), "%s:%lu", DEVICE_ID, timestamp);
    String encB64 = aesGcmEncrypt(dataStr, strlen(dataStr), aad, strlen(aad), SECRET_KEY);
    if (encB64.isEmpty()) {
        Serial.println("[MQTT] Encrypt FAILED – abort publish");
        return false;
    }

    // 3. Build payload — "data" → "enc"
    StaticJsonDocument<400> doc;
    doc["sensor_id"]    = DEVICE_ID;
    doc["sn_timestamp"] = timestamp;
    doc["sn_hmac"]      = hmac;
    doc["sensor_ip"]    = WiFi.localIP().toString();
    doc["enc"]          = encB64;   // ← encrypted, KHÔNG còn "data" plaintext

    char payload[512];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    return mqttClient.publish(topic.c_str(), payload, false);
}
```

---

#### Firmware Gateway — không cần decrypt, chỉ forward `enc` as-is

Sửa `firmware/gateway-node/lib/forwarder/forwarder.cpp` để chấp nhận cả `data` (cũ) lẫn `enc` (mới):

```cpp
// Dòng 42-46 hiện tại — cần sửa:
JsonObject  data = sensorDoc["data"];
const char* enc  = sensorDoc["enc"] | "";

// Reject nếu không có cả hai
if (!sensor_id[0] || !sn_timestamp || !sn_hmac[0] ||
    (data.isNull() && enc[0] == '\0')) {
    Serial.println("[FWD] REJECT – missing data/enc field");
    return false;
}

// ... HMAC verify, timestamp check giữ nguyên ...

// Khi build outDoc — forward enc as-is (gateway không cần đọc nội dung)
if (enc[0] != '\0') {
    sensorPayload["enc"] = enc;          // encrypted path
} else {
    JsonObject outData = sensorPayload.createNestedObject("data");
    for (JsonPair kv : data) outData[kv.key()] = kv.value();  // legacy plain
}
```

Gateway **không decrypt** — chỉ HMAC-xác-thực rồi forward blob mã hóa về backend. Điều này đảm bảo tính end-to-end: chỉ backend (có `secret_key` trong DB) mới giải mã được.

---

#### Backend — Giải mã trong `mqttDataService.ts`

**Thêm `backend/src/services/aesGcmService.ts`:**
```typescript
import { createHash, createDecipheriv } from 'crypto';

function deriveAesKey(secretKeyHex: string): Buffer {
  // key = SHA-256("iot-enc-v1:" || secretBytes)
  return createHash('sha256')
    .update('iot-enc-v1:')
    .update(Buffer.from(secretKeyHex, 'hex'))
    .digest();
}

export function decryptSensorData(
  encB64:       string,
  secretKeyHex: string,
  aad:          string    // "sensor_id:sn_timestamp"
): Record<string, number> {
  const buf        = Buffer.from(encB64, 'base64');
  if (buf.length < 12 + 16) throw new Error('enc too short');

  const iv         = buf.subarray(0, 12);
  const tag        = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(12, buf.length - 16);

  const aesKey   = deriveAesKey(secretKeyHex);
  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);

  // Nếu tag sai → decipher.final() ném lỗi → caller bắt và reject packet
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
```

**Sửa `backend/src/services/mqttDataService.ts`** — sau bước verify HMAC thành công:
```typescript
import { decryptSensorData } from './aesGcmService';

// Dòng hiện tại (78-81): kiểm tra data object
// if (!data || typeof data !== "object" || Array.isArray(data)) { ... }

// Thay bằng:
let data: Record<string, unknown>;

const encField = sensor_payload?.enc;
const rawData  = sensor_payload?.data;

if (encField && typeof encField === 'string') {
  // Encrypted path (firmware mới)
  try {
    const aad = `${sensor_id}:${sn_timestamp}`;
    data = decryptSensorData(encField, sensor.secret_key, aad);
  } catch {
    await log('SENSOR_DECRYPT_FAIL', snResult.device?.id ?? null, null, null, {
      sensor_id, reason: 'gcm_auth_failed_or_bad_key', source: 'mqtt',
    });
    console.warn(`[mqttData] decrypt fail for ${sensor_id}`);
    return;
  }
} else if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
  // Legacy plain path (firmware cũ — backward compatible trong giai đoạn chuyển đổi)
  data = rawData as Record<string, unknown>;
} else {
  console.warn('[mqttData] missing data/enc field – dropped');
  return;
}
// Từ đây data = { temperature: 28.5, humidity: 65.2 } — xử lý như cũ
```

---

#### Backward Compatibility — chiến lược chuyển đổi

```
Giai đoạn 1 (hiện tại):   firmware cũ  → gửi "data" plain
Giai đoạn 2 (triển khai): firmware mới → gửi "enc" encrypted
                           Backend chấp nhận CẢ HAI (if enc → decrypt, elif data → plain)
Giai đoạn 3 (hoàn tất):   Tắt legacy path trong backend sau khi tất cả firmware đã cập nhật
```

---

#### Tóm tắt thay đổi

| File | Thay đổi |
|------|----------|
| `firmware/sensor-node/lib/aes_gcm/aes_gcm.h/.cpp` | **Tạo mới** — AES-256-GCM encrypt |
| `firmware/sensor-node/lib/mqtt_sender/mqtt_sender.cpp` | Thay `doc["data"]` → `doc["enc"]` |
| `firmware/sensor-node-2/lib/mqtt_sender/mqtt_sender.cpp` | Áp dụng tương tự |
| `firmware/gateway-node/lib/forwarder/forwarder.cpp` | Chấp nhận `enc` field, forward as-is |
| `backend/src/services/aesGcmService.ts` | **Tạo mới** — AES-256-GCM decrypt |
| `backend/src/services/mqttDataService.ts` | Gọi `decryptSensorData()` nếu có `enc` field |

---

## 2. Ưu tiên trung bình — Trải nghiệm người dùng & Vận hành

### 2.1 Global Toast Notification System
**Tại sao:** Hiện tại feedback lỗi chỉ hiện trong modal/form, không có thông báo nổi toàn cục.  
**Cần làm:**
- Cài `react-hot-toast` hoặc dùng Radix UI Toast
- Wrap `layout.tsx` với `<Toaster />`
- Thay các `alert()` và inline error text bằng toast calls

---

### 2.2 Bulk Operations cho Device
**Tại sao:** Admin phải thao tác từng thiết bị một. Nếu có 50 sensor cần block khẩn cấp thì rất chậm.  
**Cần làm:**
- Frontend: Thêm checkbox vào `DeviceTable`, toolbar "Chọn tất cả / Block / Activate / Xóa"
- Backend: Thêm endpoint `PATCH /api/devices/bulk-status` và `DELETE /api/devices/bulk`
- Validate RBAC: chỉ admin/operator mới dùng được

---

### 2.3 Export dữ liệu (CSV / JSON)
**Tại sao:** Không có cách nào xuất audit log hoặc sensor data để phân tích ngoài hệ thống.  
**Cần làm:**
- Backend: Thêm query param `?export=csv` cho `GET /api/audit-log` và `GET /api/devices/:id/data`
- Frontend: Nút "Export" trên trang Audit và Device Detail
- Dùng `json2csv` hoặc stringify thủ công

---

### 2.4 Hệ thống cảnh báo ngưỡng (Alert / Threshold)
**Tại sao:** Không có cơ chế tự động cảnh báo khi nhiệt độ vượt ngưỡng, sensor offline quá lâu, v.v.  
**Cần làm:**
- DB: Thêm bảng `alert_rules` (device_id, metric, operator, threshold, notify_role)
- Backend `mqttDataService.ts`: Sau khi lưu data, check rules → tạo notification nếu vượt ngưỡng
- Frontend: UI tạo/sửa/xóa rules trong trang Device Detail

---

### 2.5 OTA (Over-The-Air) Firmware Update + Chữ ký số RSA-256
**Tại sao:** (1) Cập nhật firmware phải cắm cáp USB vào từng ESP32. (2) Quan trọng hơn: nếu có OTA mà không có chữ ký số, attacker có thể push firmware độc hại vào thiết bị bằng cách chặn HTTPS hoặc xâm nhập backend — thiết bị không có cơ chế phát hiện firmware giả.  
**Yêu cầu bắt buộc:** Firmware **phải được ký số** bằng RSA-2048 hoặc ECDSA-P256 trước khi phát hành. ESP32 xác minh chữ ký trước khi apply update.

---

#### Luồng OTA an toàn

```
Admin upload .bin → Backend ký bằng RSA private key → Lưu (.bin + .sig)
                                                              ↓
ESP32 gửi GET /api/firmware/latest → Nhận { version, url, signature_b64 }
                                                              ↓
ESP32 download .bin → Verify RSA signature bằng public key nhúng trong firmware
                                                              ↓
                    PASS → Apply update + reboot
                    FAIL → Abort, log OTA_FAIL, giữ firmware cũ
```

---

#### Backend — Ký số và phục vụ firmware

```typescript
// backend/src/services/otaService.ts
import crypto from 'crypto';
import fs from 'fs';

// Sinh key pair một lần: node -e "require('./otaService').generateKeyPair()"
export function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync('ota_private.pem', privateKey, { mode: 0o600 }); // KHÔNG commit file này
  fs.writeFileSync('ota_public.pem',  publicKey);
}

// Ký firmware binary
export function signFirmware(binaryPath: string): string {
  const privateKey = fs.readFileSync(process.env.OTA_PRIVATE_KEY_PATH!);
  const binary     = fs.readFileSync(binaryPath);
  const sign       = crypto.createSign('SHA256');
  sign.update(binary);
  return sign.sign(privateKey, 'base64'); // trả về base64 signature
}
```

**API Endpoints:**
```
POST /api/firmware/upload         – Admin upload .bin, backend tự ký, lưu version
GET  /api/firmware/latest         – Trả { version, download_url, signature_b64, sha256 }
GET  /api/firmware/:version/download – Phục vụ file .bin (JWT required)
GET  /api/firmware/history        – Lịch sử các version (admin)
```

**DB Schema:**
```sql
CREATE TABLE firmware_releases (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version      VARCHAR(32) NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  sha256       CHAR(64) NOT NULL,
  signature_b64 TEXT NOT NULL,
  uploaded_by  INT UNSIGNED NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
);
```

---

#### Firmware ESP32 — Xác minh chữ ký RSA trước khi apply

```cpp
// firmware/gateway-node/src/ota_updater.cpp
// Sử dụng mbedTLS (đã có sẵn trong ESP32 Arduino Core)
#include <mbedtls/pk.h>
#include <mbedtls/md.h>

// Public key nhúng cứng vào firmware (compile-time)
// Sinh từ: openssl rsa -in ota_private.pem -pubout -out ota_public.pem
static const char OTA_PUBLIC_KEY_PEM[] =
  "-----BEGIN PUBLIC KEY-----\n"
  "MIIBIjANBgkq...YOUR_PUBLIC_KEY...\n"
  "-----END PUBLIC KEY-----\n";

bool verifyFirmwareSignature(const uint8_t* firmware, size_t len,
                              const uint8_t* sig,      size_t sig_len) {
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  if (mbedtls_pk_parse_public_key(&pk,
        (const unsigned char*)OTA_PUBLIC_KEY_PEM,
        strlen(OTA_PUBLIC_KEY_PEM) + 1) != 0) return false;

  uint8_t hash[32];
  mbedtls_md(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), firmware, len, hash);

  int ret = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, 32, sig, sig_len);
  mbedtls_pk_free(&pk);
  return ret == 0;  // true = chữ ký hợp lệ → safe to apply
}

void performOTA(const String& firmwareUrl, const String& signatureB64) {
  // 1. Download firmware vào buffer
  // 2. Decode signature từ base64
  // 3. verifyFirmwareSignature() → nếu fail: abort + log OTA_FAIL
  // 4. Nếu pass: Update.begin() → Update.write() → Update.end() → restart
}
```

---

#### OTA Logging — tích hợp với mục 1.9

| Event | Khi nào | Details ghi log |
|-------|---------|-----------------|
| `OTA_START`   | Firmware bắt đầu tải | `{ version_target, current_version, device_id }` |
| `OTA_SUCCESS` | Apply + reboot thành công | `{ version_new, sha256, duration_ms }` |
| `OTA_FAIL`    | Signature fail hoặc lỗi download | `{ reason: 'sig_invalid' \| 'download_err' \| 'apply_err', version_target }` |

**Firmware báo kết quả OTA về backend:**
```
POST /api/device/ota-report   { device_id, event: 'OTA_SUCCESS'|'OTA_FAIL', version, reason? }
```
Endpoint này dùng HMAC auth (như `/api/device/data`) — không cần JWT.

---

**File cần tạo mới / sửa:**
| File | Hành động |
|------|-----------|
| `backend/src/services/otaService.ts` | Tạo mới (ký số, phục vụ firmware) |
| `backend/src/routes/firmware.routes.ts` | Tạo mới (upload, download, report) |
| `backend/src/config/migrate.ts` | Thêm migration `firmware_releases` |
| `firmware/gateway-node/src/ota_updater.cpp/.h` | Tạo mới (RSA verify + Update.h) |
| `firmware/gateway-node/platformio.ini` | Thêm lib mbedTLS nếu cần |
| `frontend/src/app/(private)/firmware/page.tsx` | Trang quản lý firmware (admin) |

---

### 2.6 Phân trang & Filter nâng cao cho Dashboard
**Tại sao:** Khi có nhiều device, dashboard chỉ hiển thị stats tổng, không lọc/phân loại được.  
**Cần làm:**
- `GET /api/dashboard/stats`: Thêm group-by `device_type`, `status`
- Frontend: Filter card trên Dashboard theo loại thiết bị, trạng thái online/offline

---

### 2.7 Gửi cảnh báo qua Email / Telegram
**Tại sao:** Hệ thống hiện chỉ có thông báo **trong app** (bảng `notifications`, chỉ admin đăng nhập mới thấy). Khi xảy ra tấn công (IDS alert), thiết bị bị block, hoặc sensor offline — admin không nhận được cảnh báo nếu không đang mở dashboard. Email và Telegram bot là kênh push notification **ngoài băng tần** (out-of-band), đảm bảo phản ứng kịp thời ngay cả khi không ngồi trước màn hình.  
**Tích hợp với:** [1.10 IDS](#110-iot-intrusion-detection-system-ids), [2.4 Alert/Threshold](#24-hệ-thống-cảnh-báo-ngưỡng-alert--threshold), [1.9 Connection Logging](#19-log-kết-nối-thiết-bị-connection-logging)

---

#### Các sự kiện kích hoạt gửi thông báo ngoài

| Sự kiện | Mức độ | Kênh mặc định |
|---------|--------|--------------|
| IDS phát hiện `attack` | Khẩn cấp | Email + Telegram |
| IDS phát hiện `suspicious` | Cảnh báo | Telegram |
| Thiết bị bị auto-block (`fail_count ≥ 5`) | Cảnh báo | Email + Telegram |
| Sensor offline > N phút | Thông tin | Telegram |
| OTA thất bại (`OTA_FAIL`) | Cảnh báo | Email |
| Sensor vượt ngưỡng nhiệt độ/độ ẩm | Thông tin | Telegram |
| Đăng nhập thất bại liên tiếp (user brute-force) | Khẩn cấp | Email |

---

#### Kênh 1 — Email (Nodemailer + SMTP)

**Cài đặt:**
```bash
npm install nodemailer @types/nodemailer   # trong backend/
```

**Service `backend/src/services/emailService.ts`:**
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,       // e.g. smtp.gmail.com
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,       // Gmail App Password (phải bật 2FA trước)
  },
});

export async function sendAlertEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<void> {
  await transporter.sendMail({
    from: `"IoT Manager Alert" <${process.env.SMTP_USER}>`,
    to:   opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
```

**Template HTML cho IDS alert:**
```html
<h2 style="color:#dc2626">⚠ Cảnh báo tấn công IoT</h2>
<table>
  <tr><td><b>Thiết bị:</b></td><td>{{device_id}}</td></tr>
  <tr><td><b>Mức độ:</b></td><td style="color:red">{{threat}}</td></tr>
  <tr><td><b>Lý do:</b></td><td>{{threat_reason}}</td></tr>
  <tr><td><b>Thời điểm:</b></td><td>{{detected_at}}</td></tr>
  <tr><td><b>IP nguồn:</b></td><td>{{source_ip}}</td></tr>
</table>
<br>
<a href="{{dashboard_url}}/devices/{{device_db_id}}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none">
  Xem chi tiết trên Dashboard →
</a>
```

**Biến `.env` cần thêm:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL_TO=admin@example.com      # nhiều địa chỉ cách nhau dấu phẩy
```

---

#### Kênh 2 — Telegram Bot

**Setup một lần:**
1. Chat với `@BotFather` → `/newbot` → lấy `BOT_TOKEN`
2. Gửi `/start` cho bot → gọi `api.telegram.org/bot<TOKEN>/getUpdates` → lấy `chat_id`

**Service `backend/src/services/telegramService.ts`:**
```typescript
export async function sendTelegramAlert(message: string): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN!;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);

  await Promise.allSettled(
    chatIds.map(chatId =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      })
    )
  );
}
```

**Template Telegram cho IDS attack:**
```typescript
const msg = `
🚨 <b>TẤN CÔNG IOT PHÁT HIỆN</b>

📡 Thiết bị: <code>${device_id}</code>
🔴 Mức độ: <b>${threat.toUpperCase()}</b>
🔍 Lý do: ${threat_reason}
🕐 Lúc: ${new Date().toLocaleString('vi-VN')}
🌐 IP: <code>${source_ip ?? 'unknown'}</code>

👉 Kiểm tra ngay tại dashboard.
`.trim();
```

**Template Telegram cho thiết bị bị block:**
```typescript
const msg = `
🔒 <b>THIẾT BỊ BỊ KHÓA TỰ ĐỘNG</b>

📡 Thiết bị: <code>${device_id}</code>
❌ Lý do: Xác thực thất bại ${fail_count} lần liên tiếp
🕐 Lúc: ${new Date().toLocaleString('vi-VN')}
`.trim();
```

**Biến `.env` cần thêm:**
```env
TELEGRAM_BOT_TOKEN=123456789:ABC-your-bot-token
TELEGRAM_CHAT_IDS=123456789,987654321   # hỗ trợ nhiều chat_id (admin, nhóm kỹ thuật)
```

---

#### Rate Limiting — chống spam thông báo

Vấn đề: IDS flooding detection có thể trigger hàng chục alert/phút từ cùng 1 thiết bị.

**`backend/src/services/alertRateLimiter.ts`:**
```typescript
// In-memory cooldown: mỗi (deviceId + eventType) chỉ gửi tối đa 1 lần / cooldownMs
const cooldownMap = new Map<string, number>();

export function shouldSendAlert(
  deviceId: number,
  eventType: string,
  cooldownMs = 600_000   // 10 phút mặc định
): boolean {
  const key  = `${deviceId}:${eventType}`;
  const last = cooldownMap.get(key) ?? 0;
  if (Date.now() - last < cooldownMs) return false;
  cooldownMap.set(key, Date.now());
  return true;
}
```

---

#### DB Schema — cấu hình kênh thông báo qua UI

```sql
-- Cho phép admin thêm/xóa kênh nhận alert qua dashboard thay vì chỉ .env
CREATE TABLE alert_channels (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel_type ENUM('email', 'telegram') NOT NULL,
  target       VARCHAR(255) NOT NULL,   -- địa chỉ email hoặc Telegram chat_id
  label        VARCHAR(128) NULL,       -- e.g. "Admin Đạt", "Nhóm DevOps"
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Quy tắc: event_type nào thì gửi tới kênh nào
CREATE TABLE alert_channel_events (
  channel_id   INT UNSIGNED NOT NULL,
  event_type   VARCHAR(64) NOT NULL,    -- 'IDS_ATTACK', 'DEVICE_BLOCKED', 'OTA_FAIL', ...
  PRIMARY KEY (channel_id, event_type),
  FOREIGN KEY (channel_id) REFERENCES alert_channels(id) ON DELETE CASCADE
);
```

---

#### Tích hợp vào luồng hiện tại

**Trong `mqttDataService.ts`** — sau khi IDS phát hiện threat:
```typescript
if (idsResult.threat !== 'normal' && shouldSendAlert(sensor.id, 'IDS_ALERT')) {
  if (idsResult.threat === 'attack') {
    await sendAlertEmail({
      to:      process.env.ALERT_EMAIL_TO!,
      subject: `🚨 IoT Attack: ${sensor.device_id}`,
      html:    buildIdsHtmlEmail(sensor.device_id, idsResult, resolvedSnIp),
    });
  }
  await sendTelegramAlert(buildIdsTelegramMsg(sensor.device_id, idsResult, resolvedSnIp));
}
```

**Trong `validateDevice.ts`** — khi thiết bị bị auto-block:
```typescript
if (count >= BLOCK_THRESHOLD && shouldSendAlert(deviceDbId, 'DEVICE_BLOCKED')) {
  await sendTelegramAlert(
    `🔒 <b>Thiết bị bị khóa:</b> <code>${deviceLabel}</code>\nFail count: ${count}`
  );
}
```

---

#### Frontend — Trang cài đặt kênh thông báo

**Trang mới `frontend/src/app/(private)/settings/notifications/page.tsx`** (admin only):
- Danh sách email / Telegram chat_id đang cấu hình
- Thêm / xóa / bật-tắt từng kênh
- Checkbox chọn event type nào gửi kênh nào
- Nút **"Gửi thử"** → `POST /api/alerts/test` — gửi message test ngay lập tức

---

**File cần tạo mới / sửa:**

| File | Hành động |
|------|-----------|
| `backend/src/services/emailService.ts` | Tạo mới — Nodemailer SMTP |
| `backend/src/services/telegramService.ts` | Tạo mới — Telegram Bot API |
| `backend/src/services/alertRateLimiter.ts` | Tạo mới — cooldown in-memory |
| `backend/src/services/mqttDataService.ts` | Gọi email/telegram sau IDS alert |
| `backend/src/middleware/validateDevice.ts` | Gọi telegram khi auto-block |
| `backend/src/routes/alerts.routes.ts` | CRUD `alert_channels` + test endpoint |
| `backend/src/config/migrate.ts` | Migration `alert_channels`, `alert_channel_events` |
| `.env.example` | Thêm `SMTP_*`, `TELEGRAM_*`, `ALERT_EMAIL_TO` |
| `frontend/src/app/(private)/settings/notifications/page.tsx` | Tạo mới — admin UI |
| `frontend/src/widgets/app-shell/Sidebar.tsx` | Thêm link "Cài đặt thông báo" |

---

## 3. Ưu tiên trung bình — Firmware & Hardware

### 3.1 Hỗ trợ thêm loại sensor
**Tại sao:** Firmware hiện chỉ đọc DHT22 (nhiệt độ + độ ẩm).  
**Cần mở rộng:**
- Soil moisture (cảm biến độ ẩm đất)
- MQ-135 (chất lượng không khí / CO2)
- BMP280 (áp suất khí quyển)
- PIR (phát hiện chuyển động)
- Cấu trúc payload JSON đã sẵn sàng — chỉ cần thêm field mới

---

### 3.2 Chế độ tiết kiệm điện (Deep Sleep)
**Tại sao:** Sensor node hiện chạy liên tục, tiêu thụ ~80mA. Dùng pin sẽ hết nhanh.  
**Cần làm:**
- Firmware `sensor-node/src/main.cpp`: Thêm `esp_deep_sleep_start()` sau khi publish
- Wakeup bằng timer (`esp_sleep_enable_timer_wakeup(INTERVAL_US)`)
- Configurable sleep interval qua `config.h`

---

### 3.3 Configurable send interval qua API
**Tại sao:** Interval hiện hardcode trong `config.h`. Không thể điều chỉnh từ xa.  
**Cần làm:**
- Backend: Thêm field `send_interval_sec` vào bảng `devices`
- Endpoint: `PATCH /api/devices/:id/config`
- Gateway: Fetch config cùng lúc với sensor registry (5 phút/lần) và forward xuống sensor qua MQTT command topic

---

### 3.4 Điều khiển thiết bị từ giao diện xuống phần cứng
**Tại sao:** Luồng dữ liệu hiện tại **hoàn toàn 1 chiều**: sensor → gateway → backend → dashboard. Không có cách nào từ giao diện web gửi lệnh xuống thiết bị vật lý. Trong môi trường thực tế, admin/operator cần điều khiển từ xa: bật/tắt relay, reset thiết bị, thay đổi cấu hình, yêu cầu đồng bộ ngay — mà không cần tiếp cận phần cứng trực tiếp.

---

#### Luồng điều khiển đầy đủ (UI → Hardware)

```
[Frontend]                [Backend]              [Broker 2]           [Broker 1]         [Phần cứng]
   │                          │                       │                    │                   │
   │─ POST /api/devices/:id/cmd ──────────────────────►                    │                   │
   │   { cmd: "set_relay",     │                       │                    │                   │
   │     params: { pin:2,      │◄─ 201 { cmd_id }      │                    │                   │
   │     state: true } }       │                       │                    │                   │
   │                           │─ publish ─────────────►                    │                   │
   │                           │  gateway/{gw}/cmd     │                    │                   │
   │                           │                       │     [Gateway ESP32]│                   │
   │                           │                       │◄─ subscribe ───────┤                   │
   │                           │                       │     forward ───────►                   │
   │                           │                       │  local/sensors/{id}/cmd               │
   │                           │                       │                    │    [Sensor ESP32] │
   │                           │                       │                    │◄─ subscribe ──────┤
   │                           │                       │                    │    execute ───────►
   │                           │                       │                    │    relay ON        │
   │                           │                       │                    │                   │
   │                           │                       │◄─ ack ─────────────┤◄─ ack ────────────┤
   │                           │◄─ subscribe ──────────┤  gateway/{gw}/ack  │                   │
   │◄── SSE/WebSocket ─────────┤  update cmd status    │                    │                   │
   │   { cmd_id, status:"ack"} │                       │                    │                   │
```

---

#### Danh sách lệnh điều khiển

| Lệnh | Mô tả | Tham số | Thiết bị |
|------|--------|---------|---------|
| `reboot` | Khởi động lại ESP32 | — | Sensor / Gateway |
| `set_interval` | Đổi tần suất gửi dữ liệu | `{ interval_sec: 10 }` | Sensor |
| `set_relay` | Bật/tắt relay output | `{ pin: 2, state: true }` | Sensor (actuator) |
| `set_led` | Điều khiển LED onboard | `{ state: "on"\|"off"\|"blink", freq_hz: 2 }` | Sensor / Gateway |
| `force_sync` | Gửi ngay 1 lần đọc sensor | — | Sensor |
| `get_status` | Yêu cầu báo cáo trạng thái | — | Sensor / Gateway |
| `set_threshold` | Đặt ngưỡng cảnh báo cục bộ | `{ metric: "temp", max: 45 }` | Sensor |
| `update_whitelist` | Làm mới danh sách sensor registry | — | Gateway |

---

#### DB Schema — bảng lệnh và trạng thái

```sql
CREATE TABLE device_commands (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id    INT UNSIGNED NOT NULL,
  issued_by    INT UNSIGNED NOT NULL,          -- user.id
  cmd          VARCHAR(64) NOT NULL,           -- 'set_relay', 'reboot', ...
  params       JSON NULL,                      -- { pin: 2, state: true }
  status       ENUM('pending','delivered','ack','timeout','error')
               NOT NULL DEFAULT 'pending',
  cmd_seq      BIGINT UNSIGNED NOT NULL,       -- Unix ms timestamp làm sequence
  result       JSON NULL,                      -- phản hồi từ firmware
  issued_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acked_at     DATETIME NULL,
  INDEX idx_device_status (device_id, status),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (issued_by) REFERENCES users(id)
);
```

---

#### Backend — API & MQTT publish

**REST Endpoint:**
```
POST /api/devices/:id/cmd          – Gửi lệnh (admin / operator)
GET  /api/devices/:id/cmd          – Lịch sử lệnh + trạng thái (có phân trang)
GET  /api/devices/:id/cmd/:cmd_id  – Chi tiết 1 lệnh
```

**`backend/src/services/commandService.ts`:**
```typescript
import mqtt from 'mqtt';
import pool from '../config/db';
import { log } from './auditLogger';

// Client publish riêng (khác với subscriber của mqttDataService)
let publishClient: mqtt.MqttClient;

export function initCommandPublisher(): void {
  const url = `mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT || 1884}`;
  publishClient = mqtt.connect(url, { clientId: 'iot-backend-cmd', clean: true });
  publishClient.on('connect', () => console.log('[cmd] publish client connected'));

  // Subscribe ack topic để cập nhật trạng thái lệnh
  publishClient.subscribe('gateway/+/ack', { qos: 1 });
  publishClient.on('message', (_topic, payload) => handleAck(payload.toString()));
}

export async function sendCommand(opts: {
  gatewayDeviceId: string;   // device_id của gateway (vd: ESP32-GW-ABCD)
  targetSensorId:  string;   // device_id của sensor đích (null nếu lệnh cho gateway)
  cmd:             string;
  params:          Record<string, unknown> | null;
  cmdDbId:         number;
  cmdSeq:          number;
}): Promise<void> {
  const topic   = `gateway/${opts.gatewayDeviceId}/cmd`;
  const payload = JSON.stringify({
    cmd_id:    opts.cmdDbId,
    cmd_seq:   opts.cmdSeq,         // anti-replay: firmware reject nếu seq đã thấy
    target:    opts.targetSensorId, // null = lệnh cho gateway, string = forward xuống sensor
    cmd:       opts.cmd,
    params:    opts.params ?? {},
  });
  publishClient.publish(topic, payload, { qos: 1 });
}

async function handleAck(raw: string): Promise<void> {
  try {
    const { cmd_id, status, result } = JSON.parse(raw);
    await pool.execute(
      `UPDATE device_commands SET status=?, result=?, acked_at=NOW() WHERE id=?`,
      [status, result ? JSON.stringify(result) : null, cmd_id]
    );
    // Thông báo real-time cho frontend qua SSE (mục 1.1)
  } catch { /* không làm crash service */ }
}
```

**Route `backend/src/routes/cmd.routes.ts`:**
```typescript
// POST /api/devices/:id/cmd
router.post('/:id/cmd', verifyJWT, requireRole('admin','operator'),
  async (req, res) => {
    const { cmd, params } = req.body;
    const ALLOWED_CMDS = ['reboot','set_interval','set_relay','set_led',
                          'force_sync','get_status','set_threshold','update_whitelist'];
    if (!ALLOWED_CMDS.includes(cmd)) { res.status(400).json({ error: 'INVALID_CMD' }); return; }

    // Tìm gateway đang quản lý sensor này
    const [rows] = await pool.execute<any[]>(
      `SELECT d.device_id AS sensor_did,
              gw.device_id AS gateway_did, gw.id AS gateway_db_id
       FROM devices d
       JOIN sensor_data sd ON sd.device_id = d.id
       JOIN devices gw     ON gw.id = sd.gateway_id
       WHERE d.id = ? AND d.status = 'active'
       ORDER BY sd.received_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) { res.status(400).json({ error: 'NO_ACTIVE_GATEWAY' }); return; }

    const cmdSeq = Date.now();
    const [ins]  = await pool.execute<any>(
      `INSERT INTO device_commands (device_id, issued_by, cmd, params, cmd_seq)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, cmd, params ? JSON.stringify(params) : null, cmdSeq]
    );
    const cmdDbId = ins.insertId;

    await sendCommand({
      gatewayDeviceId: rows[0].gateway_did,
      targetSensorId:  rows[0].sensor_did,
      cmd, params, cmdDbId, cmdSeq,
    });

    await log('DEVICE_CMD_SENT', Number(req.params.id), ..., { cmd, params, issued_by: req.user.username });

    // Timeout: nếu sau 30s chưa có ack → đánh dấu timeout
    setTimeout(async () => {
      await pool.execute(
        `UPDATE device_commands SET status='timeout' WHERE id=? AND status='pending'`,
        [cmdDbId]
      );
    }, 30_000);

    res.status(201).json({ success: true, cmd_id: cmdDbId, cmd_seq: cmdSeq });
  }
);
```

---

#### Firmware Gateway — Nhận lệnh từ Broker 2, chuyển tiếp xuống Broker 1

**`firmware/gateway-node/src/cmd_handler.cpp`:**
```cpp
// Subscribe topic: gateway/{GW_ID}/cmd  (Broker 2)
// Nếu payload.target != null → forward xuống sensor qua Broker 1
// Nếu payload.target == null → lệnh cho chính gateway

void onCmdReceived(const String& payload) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok) return;

  uint32_t cmdSeq = doc["cmd_seq"];

  // Anti-replay: bỏ qua nếu seq đã xử lý trong 10 phút gần nhất
  if (seenCmdSeqs.contains(cmdSeq)) return;
  seenCmdSeqs.add(cmdSeq);

  const char* target = doc["target"];   // device_id của sensor đích
  const char* cmd    = doc["cmd"];

  if (target == nullptr) {
    // Lệnh cho gateway
    executeGatewayCmd(doc);
  } else {
    // Forward xuống Broker 1
    String forwardTopic = String("local/sensors/") + target + "/cmd";
    mqttBroker1.publish(forwardTopic.c_str(), payload.c_str(), true);
  }

  // Gửi ACK về Broker 2
  String ackTopic = String("gateway/") + GATEWAY_ID + "/ack";
  String ackPayload = buildAck(doc["cmd_id"], "delivered");
  mqttBroker2.publish(ackTopic.c_str(), ackPayload.c_str());
}

void executeGatewayCmd(const JsonDocument& doc) {
  const char* cmd = doc["cmd"];
  if (strcmp(cmd, "reboot") == 0)           { ESP.restart(); }
  if (strcmp(cmd, "update_whitelist") == 0) { sensorRegistry.forceRefresh(); }
  if (strcmp(cmd, "set_led") == 0)          { setLed(doc["params"]["state"]); }
}
```

---

#### Firmware Sensor — Nhận lệnh từ Broker 1, thực thi

**`firmware/sensor-node/src/cmd_executor.cpp`:**
```cpp
// Subscribe topic: local/sensors/{SENSOR_ID}/cmd  (Broker 1)

void onCmdReceived(const String& payload) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok) return;

  uint32_t cmdSeq = doc["cmd_seq"];
  if (seenCmdSeqs.contains(cmdSeq)) return;  // anti-replay
  seenCmdSeqs.add(cmdSeq);

  const char* cmd = doc["cmd"];
  bool        ok  = true;

  if      (strcmp(cmd, "reboot")        == 0) { ESP.restart(); }
  else if (strcmp(cmd, "set_interval")  == 0) {
    uint32_t sec = doc["params"]["interval_sec"] | 5;
    sendIntervalMs = constrain(sec, 1, 3600) * 1000UL;
    // Lưu vào NVS để persist qua reboot
    prefs.putUInt("interval", sendIntervalMs);
  }
  else if (strcmp(cmd, "set_relay")     == 0) {
    uint8_t pin   = doc["params"]["pin"] | 2;
    bool    state = doc["params"]["state"] | false;
    pinMode(pin, OUTPUT);
    digitalWrite(pin, state ? HIGH : LOW);
  }
  else if (strcmp(cmd, "set_led")       == 0) {
    const char* state = doc["params"]["state"] | "off";
    handleLedCmd(state, doc["params"]["freq_hz"] | 1);
  }
  else if (strcmp(cmd, "force_sync")    == 0) { forceSendNow = true; }
  else if (strcmp(cmd, "get_status")    == 0) {
    publishStatusReport();   // gửi ngay 1 packet status: version FW, uptime, RSSI, heap
  }
  else if (strcmp(cmd, "set_threshold") == 0) {
    thresholdMetric = doc["params"]["metric"].as<String>();
    thresholdMax    = doc["params"]["max"] | 100.0f;
  }
  else { ok = false; }

  // Gửi ACK về gateway qua topic ack
  String ackTopic = String("local/sensors/") + SENSOR_ID + "/ack";
  StaticJsonDocument<128> ack;
  ack["cmd_id"] = doc["cmd_id"];
  ack["status"] = ok ? "ack" : "error";
  ack["ts"]     = timeClient.getEpochTime();
  String ackStr; serializeJson(ack, ackStr);
  mqttBroker1.publish(ackTopic.c_str(), ackStr.c_str());
}
```

---

#### Frontend — Giao diện điều khiển trong Device Detail

**Thêm vào `frontend/src/features/devices/pages/DeviceDetailPage.tsx`:**

```tsx
// Panel "Điều khiển thiết bị" — chỉ hiện với admin/operator
const ControlPanel = ({ device }: { device: ApiDevice }) => {
  const [cmdLog, setCmdLog] = useState<CmdEntry[]>([]);

  const sendCmd = async (cmd: string, params?: object) => {
    const res = await fetch(`/api/devices/${device.id}/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, params }),
    });
    const data = await res.json();
    setCmdLog(prev => [{ cmd_id: data.cmd_id, cmd, status: 'pending', ts: new Date() }, ...prev]);
  };

  return (
    <section className="rounded-md border p-4 space-y-3">
      <h3 className="font-semibold">Điều khiển từ xa</h3>

      {/* Relay control */}
      <div className="flex items-center gap-3">
        <span className="text-sm">Relay (pin 2)</span>
        <button onClick={() => sendCmd('set_relay', { pin: 2, state: true })}
          className="btn-green">Bật</button>
        <button onClick={() => sendCmd('set_relay', { pin: 2, state: false })}
          className="btn-red">Tắt</button>
      </div>

      {/* Send interval slider */}
      <div className="flex items-center gap-3">
        <span className="text-sm">Interval (giây)</span>
        <input type="range" min={1} max={60} defaultValue={5}
          onMouseUp={(e) => sendCmd('set_interval', { interval_sec: Number(e.currentTarget.value) })} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => sendCmd('reboot')}      className="btn-outline">Reboot</button>
        <button onClick={() => sendCmd('force_sync')}  className="btn-outline">Force Sync</button>
        <button onClick={() => sendCmd('get_status')}  className="btn-outline">Get Status</button>
      </div>

      {/* Command history + status badges */}
      <CommandHistoryTable entries={cmdLog} />
    </section>
  );
};
```

**Trạng thái lệnh hiển thị theo badge:**
| Status | Màu | Ý nghĩa |
|--------|-----|---------|
| `pending` | Xám | Đã gửi, chờ gateway nhận |
| `delivered` | Xanh dương | Gateway đã nhận, đang forward |
| `ack` | Xanh lá | Sensor đã thực thi thành công |
| `timeout` | Cam | Không nhận được ack sau 30s |
| `error` | Đỏ | Firmware báo lỗi thực thi |

---

#### Bảo mật luồng điều khiển

| Lớp | Biện pháp |
|-----|-----------|
| REST API | JWT required, RBAC: chỉ admin/operator gửi lệnh |
| REST rate limit | Tối đa 30 lệnh/phút per user |
| MQTT command | Payload chứa `cmd_seq` (Unix ms) — firmware reject nếu seq đã thấy (anti-replay) |
| Lệnh nguy hiểm | `reboot` / `set_relay` yêu cầu confirm dialog trên UI |
| Audit log | Mọi lệnh ghi vào `audit_log` với `event_type = 'DEVICE_CMD_SENT'` |
| Command whitelist | Firmware chỉ xử lý các lệnh trong danh sách cố định — bỏ qua mọi lệnh lạ |

---

#### MQTT Topics bổ sung

```
Backend  → Broker 2: gateway/{GW_ID}/cmd         (lệnh xuống gateway)
Gateway  → Broker 1: local/sensors/{SN_ID}/cmd   (gateway forward xuống sensor)
Sensor   → Broker 1: local/sensors/{SN_ID}/ack   (sensor báo kết quả)
Gateway  → Broker 2: gateway/{GW_ID}/ack          (gateway tổng hợp, báo về backend)
```

---

**File cần tạo mới / sửa:**

| File | Hành động |
|------|-----------|
| `backend/src/services/commandService.ts` | Tạo mới — publish + ack handler |
| `backend/src/routes/cmd.routes.ts` | Tạo mới — REST API |
| `backend/src/server.ts` hoặc `app.ts` | Gọi `initCommandPublisher()` khi start |
| `backend/src/config/migrate.ts` | Migration bảng `device_commands` |
| `firmware/gateway-node/src/cmd_handler.cpp/.h` | Tạo mới — nhận + forward lệnh |
| `firmware/sensor-node/src/cmd_executor.cpp/.h` | Tạo mới — thực thi lệnh + ACK |
| `firmware/sensor-node/src/main.cpp` | Subscribe `local/sensors/{id}/cmd` |
| `firmware/gateway-node/src/main.cpp` | Subscribe `gateway/{id}/cmd` (Broker 2) |
| `frontend/src/features/devices/pages/DeviceDetailPage.tsx` | Thêm ControlPanel + CommandHistoryTable |
| `frontend/src/shared/types/api.ts` | Thêm type `DeviceCommand` |

---

## 4. Ưu tiên thấp — Chất lượng & Hạ tầng

### 4.1 Test coverage — Hiện tại bằng 0
**Tại sao:** Không có file test nào trong toàn bộ repo.  
**Cần làm:**
- Backend: Jest + Supertest cho API endpoints (auth, HMAC validation, RBAC)
- Frontend: Vitest + React Testing Library cho components chính
- Firmware: Unity framework cho `hmac_util`, `sensor_registry`
- CI: Thêm step `npm test` vào GitHub Actions (nếu có)

---

### 4.2 Multi-language / i18n
**Tại sao:** Code mix tiếng Anh và tiếng Việt (comment, UI text, docs). Khó mở rộng cho người dùng quốc tế.  
**Cần làm:**
- Cài `next-intl` hoặc `react-i18next`
- Tách chuỗi UI ra file `messages/vi.json`, `messages/en.json`
- Thêm language switcher vào header

---

### 4.3 API Key authentication (bổ sung cho JWT)
**Tại sao:** Tích hợp với hệ thống bên ngoài (Grafana, Home Assistant, v.v.) phải dùng JWT cookie — không tiện cho programmatic access.  
**Cần làm:**
- DB: Bảng `api_keys` (user_id, key_hash, name, expires_at, scopes)
- Backend: Middleware nhận `Authorization: Bearer <api_key>` song song với JWT cookie
- Frontend: UI tạo/thu hồi API key trong trang profile

---

### 4.4 Prometheus / Grafana Monitoring — Điểm yếu (7)
**Tại sao:** `/api/health` chỉ trả `{ status: "ok" }`. Không có khả năng phát hiện sớm hành vi bất thường: đột biến AUTH_FAIL, thiết bị offline hàng loạt, MQTT message drop, hay latency tăng vọt — tất cả đều phải ngồi xem log thủ công.  
**Rủi ro cụ thể:** Một cuộc tấn công brute-force phân tán hoặc replay attack có thể chạy hàng giờ trước khi ai đó phát hiện.  
**Cần làm:**
- Backend: Thêm Prometheus metrics endpoint `GET /metrics` dùng `prom-client`
  - Counter: `auth_fail_total{device_id}`, `device_blocked_total`, `mqtt_messages_received_total`
  - Gauge: `devices_online`, `db_connection_pool_used`
  - Histogram: `http_request_duration_seconds{route}`
- `docker-compose.yml`: Thêm service `prometheus` + `grafana`
- Grafana dashboard panels:
  - AUTH_FAIL rate theo thời gian (phát hiện brute-force)
  - Số thiết bị online/offline
  - MQTT message throughput
  - API response time percentiles
- Alert rule: Grafana gửi email/webhook khi `auth_fail_total` > 50 trong 5 phút
- Mở rộng health endpoint: ping MySQL, ping MQTT broker, kiểm tra memory

---

### 4.5 MQTT Authentication (username/password)
**Tại sao:** Mosquitto hiện không cấu hình auth — bất kỳ ai trong mạng cũng có thể publish/subscribe.  
**Cần làm:**
- Tạo `mosquitto/password_file` với `mosquitto_passwd`
- Cập nhật `mosquitto/mosquitto.conf`: `allow_anonymous false`, `password_file`
- Cập nhật firmware `config.h` và backend `mqttDataService.ts` để truyền credentials

---

### 4.6 Device Grouping / Asset Management
**Tại sao:** Khi số device lớn, không có cách nhóm (theo tòa nhà, phòng, dự án).  
**Cần làm:**
- DB: Bảng `device_groups` và `device_group_members`
- API: CRUD cho groups, filter device by group
- Frontend: Dropdown group filter trên trang Devices

---

### 4.7 Rate limiting cho WebSocket/SSE (khi implement)
**Tại sao:** Khi mục 1.1 được implement, cần bảo vệ endpoint SSE/WS khỏi abuse.  
**Cần làm:**
- Giới hạn số kết nối SSE đồng thời per user
- Kiểm tra JWT trước khi chấp nhận upgrade WebSocket
- Timeout kết nối idle

---

### 4.8 Khả năng mở rộng quy mô (Scalability) — Điểm yếu (6)
**Tại sao:** Kiến trúc hiện tại (1 Mosquitto instance, MySQL, Express đơn lẻ) có giới hạn cứng về số thiết bị. Khi vượt ~500 device đồng thời, MQTT broker sẽ là bottleneck, MySQL sẽ chậm với time-series writes liên tục, và backend Express sẽ không handle được burst traffic.  
**Ước lượng giới hạn hiện tại:**
- Mosquitto 1 instance: ~10,000 kết nối đồng thời (lý thuyết), thực tế ~500-1000 với hardware phổ thông
- MySQL ghi liên tục sensor data: ~1,000 writes/giây trước khi cần tuning
- Express single process: ~500-1000 req/giây

**Lộ trình nâng cấp theo giai đoạn:**

*Giai đoạn 1 — 500–2,000 devices:*
- Thêm MQTT broker cluster (HiveMQ hoặc EMQX thay Mosquitto) — hỗ trợ horizontal scale
- Thêm Redis cho session cache và rate limiting (thay in-memory `express-rate-limit`)
- MySQL read replicas cho dashboard queries

*Giai đoạn 2 — 2,000–10,000 devices:*
- Thay MySQL time-series table bằng **TimescaleDB** hoặc **InfluxDB** cho bảng `sensor_data`
- Thêm message queue (**RabbitMQ** hoặc **Kafka**) giữa MQTT subscriber và DB writer
  - `mqttDataService.ts` → publish vào queue thay vì ghi thẳng vào DB
  - Consumer worker group ghi vào DB với batch insert
- Express chạy multi-instance đằng sau Nginx load balancer (đã có Nginx trong docker-compose)

*Giai đoạn 3 — 10,000+ devices:*
- Kubernetes deployment với HPA (Horizontal Pod Autoscaler)
- Partition MQTT topics theo geographic region
- Distributed tracing (Jaeger / OpenTelemetry)

**File cần sửa khi nâng cấp:**
- `docker-compose.yml` — thêm service Redis, queue
- `backend/src/services/mqttDataService.ts` — tách publish và consume
- `backend/src/config/database.ts` — connection pool tuning
- `backend/src/services/deviceStatus.ts` — chuyển in-memory cache sang Redis

---

## Tóm tắt theo độ phức tạp

> Các mục có nhãn **(Điểm yếu n)** là hạn chế cốt lõi cần ưu tiên trước khi triển khai thực tế.

| Mục | Loại | Độ phức tạp | Thời gian ước tính |
|-----|------|------------|-------------------|
| 2.1 Global Toast | UX | Thấp | 2–4 giờ |
| 1.8 Audit log TTL | Bảo mật | Thấp | 4–6 giờ |
| 4.5 MQTT Auth (username/pass) | Bảo mật | Thấp | 4–6 giờ |
| 2.3 Export CSV/JSON | Vận hành | Thấp | 6–8 giờ |
| **1.4 Encryption at rest (Điểm yếu 3)** | **Bảo mật** | Thấp–Trung | **6–8 giờ** |
| **1.11 Mã hóa payload AES-256-GCM** | **Bảo mật / Firmware** | Trung bình | **1–2 ngày** |
| **1.2 TLS cho MQTT (Điểm yếu 1)** | **Bảo mật** | Trung bình | **1–2 ngày** |
| **1.5 MFA cho Admin (Điểm yếu 4)** | **Bảo mật** | Trung bình | **1–2 ngày** |
| **1.9 Connection Logging (Điểm yếu 10)** | **Bảo mật** | Thấp–Trung | **4–8 giờ** |
| 2.2 Bulk device operations | UX | Trung bình | 1–2 ngày |
| 1.7 Auto backup database | Vận hành | Trung bình | 1 ngày |
| 1.1 WebSocket/SSE logs | Core | Trung bình | 2–3 ngày |
| 3.2 Deep Sleep firmware | Firmware | Trung bình | 1–2 ngày |
| 2.4 Alert/Threshold | Core | Trung bình | 2–3 ngày |
| 4.3 API Key auth | Core | Trung bình | 2–3 ngày |
| **4.4 Prometheus/Grafana (Điểm yếu 7)** | **Giám sát** | Trung bình | **2–4 ngày** |
| **2.7 Email / Telegram alert** | **Thông báo** | Thấp–Trung | **1–2 ngày** |
| 3.1 Thêm sensor types | Firmware | Thấp–Trung | 1 ngày/loại |
| 3.3 Remote config interval | Firmware | Trung bình | 2–3 ngày |
| **1.3 Key Rotation (Điểm yếu 2)** | **Bảo mật** | Cao | **3–5 ngày** |
| 3.4 Điều khiển thiết bị UI → Hardware | Firmware / Core | Cao | 1–2 tuần |
| **1.10 IDS — Rule-based (Điểm yếu 9)** | **Bảo mật** | Cao | **3–6 ngày** |
| **2.5 OTA + Chữ ký số RSA-256 (Điểm yếu 8)** | **Bảo mật / Firmware** | Cao | **1–2 tuần** |
| 4.1 Test coverage | Chất lượng | Cao | 1–2 tuần |
| 4.2 i18n | UX | Trung bình | 1 tuần |
| 4.6 Device Grouping | Core | Cao | 1 tuần |
| **1.6 ABAC (Điểm yếu 5)** | **Bảo mật** | Cao | **1–2 tuần** |
| **4.8 Scalability (Điểm yếu 6)** | **Hạ tầng** | Rất cao | **2–4 tuần (theo giai đoạn)** |

---

*Phân tích dựa trên trạng thái code ngày 2026-06-23. Bổ sung 7 hạn chế thực tế + Connection Logging, OTA chữ ký số, IDS ngày 2026-06-23.*
