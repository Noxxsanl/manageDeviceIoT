# Demo Threat Model va kich ban tan cong

Tai lieu nay mo ta threat model va cach demo cac kich ban tan cong cho repo
`managerDeviceIoT`. Noi dung duoc viet lai theo code hien tai:

- Frontend: Next.js, cong `3000`
- Backend: Express + TypeScript, cong `5000`
- Reverse proxy: Nginx, cong `80`
- Database: MySQL 8, cong host `3308`
- MQTT broker: Mosquitto, cong `1883`
- Endpoint nhan du lieu thiet bi: `POST /api/device/data`
- Script demo: `scripts/attack_demo.sh`

> Luu y: File nay khong dung cho moi truong production. Cac lenh tan cong chi
> nen chay tren may lab/local do ban so huu.

---

## 1. Kien truc bao mat

### 1.1 Luong du lieu thuc te

```text
ESP32 Sensor Node
  |  MQTT publish topic local/sensors/<DEVICE_ID>/data
  |  payload: sensor_id, sn_timestamp, sn_hmac, data
  v
Mosquitto broker :1883
  |
  v
ESP32 Gateway Node
  |  1. parse JSON
  |  2. kiem tra sensor nam trong KNOWN_SENSORS
  |  3. kiem tra timestamp +-300 giay
  |  4. verify HMAC cua sensor
  |  5. ky them HMAC cua gateway
  v
HTTP POST /api/device/data
  |
  v
Backend Express
  |  1. validate Gateway HMAC
  |  2. validate Sensor HMAC
  |  3. kiem tra role thiet bi: gateway/sensor
  |  4. kiem tra status: active/blocked/inactive
  |  5. luu sensor_data va audit_log
  v
MySQL
```

Neu di qua frontend proxy, script co the goi:

```text
http://localhost:3000/api/device/data
```

Next.js se forward ve backend theo `BACKEND_URL`. Neu goi truc tiep backend:

```text
http://localhost:5000/api/device/data
```

Neu di qua Nginx:

```text
http://localhost/api/device/data
```

### 1.2 Payload hop le

```json
{
  "gateway_id": "ESP32-GW-XXXXXXXX",
  "gw_timestamp": 1760000000,
  "gw_hmac": "64-hex-chars",
  "sensor_id": "ESP32-SN-XXXXXXXX",
  "sn_timestamp": 1760000000,
  "sn_hmac": "64-hex-chars",
  "data": {
    "temperature": 28.5,
    "humidity": 65
  }
}
```

Backend bat buoc co:

- `gateway_id`, `gw_timestamp`, `gw_hmac`
- `sensor_id`, `sn_timestamp`, `sn_hmac`
- `data` la object JSON

### 1.3 Cong thuc HMAC

Code backend tinh HMAC trong `backend/src/services/hmacService.ts`:

```text
message = device_id + ":" + unix_timestamp
hmac    = HMAC-SHA256(secret_key, message)
output  = hex string
```

Vi du:

```text
message = "ESP32-GW-A1B2C3D4:1760000000"
hmac    = HMAC-SHA256(gateway_secret_key, message)
```

Backend dung `crypto.timingSafeEqual()` de so sanh HMAC, giup giam nguy co
timing attack khi ke tan cong do thoi gian phan hoi de doan token.

### 1.4 Cac lop phong thu

| Lop | Co che | Noi xu ly |
|---|---|---|
| HTTP hardening | Helmet, CORS, JSON body limit 10 KB | `backend/src/app.ts` |
| Rate limit login | 10 request / 15 phut / IP | `/api/auth/login` |
| Rate limit device data | 60 request / phut / IP | `/api/device/data` |
| Device identity | HMAC-SHA256 theo secret rieng tung device | `hmacService.ts` |
| Replay protection | timestamp window +-300 giay | `hmacService.ts`, firmware gateway |
| Auto block | sai 5 lan thi `status = blocked` | `validateDevice.ts` |
| Device RBAC | `gateway_id` phai la `gateway`, `sensor_id` phai la `sensor` | `data.routes.ts` |
| Admin RBAC | JWT cookie + role `admin/operator/viewer` | `verifyJWT.ts`, `rbac.ts` |
| SQL injection defense | prepared statements voi `pool.execute(..., [params])` | routes/services |
| Audit trail | ghi `audit_log` cho event quan trong | `auditLogger.ts` |

---

## 2. Chuan bi demo

### 2.1 Khoi dong he thong

```powershell
cd E:\WorkSpace\managerDeviceIoT
docker compose up -d --build
docker compose ps
```

Kiem tra nhanh:

```powershell
curl http://localhost:5000/api/health
```

Truy cap:

| Dich vu | URL |
|---|---|
| Dashboard qua frontend | `http://localhost:3000` |
| Dashboard qua Nginx | `http://localhost` |
| Backend API | `http://localhost:5000` |
| MySQL tren host | `localhost:3308` |
| Mosquitto MQTT | `localhost:1883` |

Tai khoan mac dinh trong migration:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | `admin` |

### 2.2 Tao thiet bi demo

1. Dang nhap Dashboard bang `admin/admin123`.
2. Vao `Devices`.
3. Tao mot thiet bi type `gateway`.
4. Tao mot thiet bi type `sensor`.
5. Sao chep ngay `device_id` va `secret_key`.

Backend chi tra `secret_key` mot lan khi dang ky. Thiet bi moi co status
`inactive`, nen truoc khi demo can chuyen ca gateway va sensor sang `active`
bang giao dien status.

Gia tri can co:

```bash
GW_ID="ESP32-GW-..."
GW_SECRET="..."
SN_ID="ESP32-SN-..."
SN_SECRET="..."
```

### 2.3 Chay script demo nhanh

Script hien tai chay 6 muc: baseline + 5 kich ban tan cong.

```bash
cd /e/WorkSpace/managerDeviceIoT
chmod +x scripts/attack_demo.sh

./scripts/attack_demo.sh \
  "http://localhost:3000" \
  "$GW_ID" "$GW_SECRET" \
  "$SN_ID" "$SN_SECRET"
```

Co the thay URL dau tien bang `http://localhost:5000` neu muon goi backend truc
tiep.

> Can co `curl`, `openssl`, va `xxd`. `jq` khong bat buoc.

---

## 3. Thu tu validate cua backend

`POST /api/device/data` di qua `validateDevice` truoc khi handler luu data.

```text
1. Thieu gateway_id/gw_timestamp/gw_hmac
   -> 400 MISSING_GATEWAY_FIELDS

2. verifyGatewayHMAC()
   - khong tim thay gateway_id -> 401 GATEWAY_AUTH_FAIL, reason NOT_FOUND
   - timestamp cu/qua xa      -> 401 GATEWAY_AUTH_FAIL, reason TIMESTAMP_EXPIRED
   - HMAC sai                 -> 401 GATEWAY_AUTH_FAIL, reason HMAC_MISMATCH
   - neu device ton tai: fail_count +1
   - fail_count >= 5: status = blocked, audit DEVICE_BLOCKED

3. Thieu sensor_id/sn_timestamp/sn_hmac
   -> 400 MISSING_SENSOR_FIELDS

4. verifyDeviceHMAC()
   - loi tuong tu gateway
   - event audit la SENSOR_AUTH_FAIL

5. Handler kiem tra data
   - data khong phai object -> 400 MISSING_PAYLOAD_DATA

6. Handler kiem tra device_type
   - gateway_id khong phai gateway -> 403 INVALID_DEVICE_TYPE
   - sensor_id khong phai sensor   -> 403 INVALID_DEVICE_TYPE

7. Handler kiem tra status
   - blocked  -> 403 DEVICE_BLOCKED
   - inactive -> 403 DEVICE_NOT_ACTIVE

8. Hop le
   - INSERT sensor_data
   - UPDATE last_seen, fail_count = 0
   - INSERT audit_log DATA_RECV
   - 200 success
```

---

## 4. Scenario 0 - Baseline hop le

### Muc tieu

Chung minh request hop le duoc chap nhan. Day la diem doi chieu cho cac attack.

### Dieu kien pass

- Gateway ton tai trong DB.
- Gateway co `status = active`.
- Gateway co `device_type = gateway`.
- Gateway HMAC dung.
- Sensor ton tai trong DB.
- Sensor co `status = active`.
- Sensor co `device_type = sensor`.
- Sensor HMAC dung.
- Timestamp nam trong cua so +-300 giay.

### Ket qua mong doi

```text
HTTP 200
{
  "success": true,
  "sensor_id": "...",
  "gateway_id": "...",
  "received_at": "..."
}
```

### Chung cu can cho thay

- Dashboard Devices: `last_seen` cap nhat, device online neu moi gui du lieu.
- Dashboard Audit: co event `DATA_RECV`.
- DB bang `sensor_data`: co record moi.

---

## 5. Scenario 1 - Device Spoofing

### Mo ta

Ke tan cong biet `gateway_id` hoac `sensor_id`, nhung khong co `secret_key`.
No tao HMAC gia, vi du `deadbeef...`, roi gui len `/api/device/data`.

### Vi sao bi chan

Backend lay `secret_key` that trong bang `devices`, tinh lai:

```text
expected = HMAC-SHA256(secret_key, gateway_id + ":" + gw_timestamp)
```

HMAC trong request khong khop `expected`, nen `safeCompare()` tra ve false.

### Ket qua mong doi

```text
HTTP 401
{
  "error": "GATEWAY_AUTH_FAIL",
  "reason": "HMAC_MISMATCH"
}
```

Neu spoofing xay ra o sensor sau khi gateway pass, ket qua se la:

```text
HTTP 401
{
  "error": "SENSOR_AUTH_FAIL",
  "reason": "HMAC_MISMATCH"
}
```

### Audit

- `GATEWAY_AUTH_FAIL` hoac `SENSOR_AUTH_FAIL`
- `fail_count` cua device ton tai trong DB tang len 1

---

## 6. Scenario 2 - Replay Attack

### Mo ta

Ke tan cong bat duoc mot request hop le va gui lai sau do. HMAC van dung, nhung
timestamp da cu.

Script demo tao timestamp cu hon khoang 700 giay:

```text
OLD_TS = now - 700
```

### Vi sao bi chan

Backend chi chap nhan:

```text
abs(now - timestamp) <= 300 seconds
```

Timestamp cu hon 5 phut se bi tu choi truoc khi so sanh HMAC co y nghia ve
mat business.

### Ket qua mong doi

```text
HTTP 401
{
  "error": "GATEWAY_AUTH_FAIL",
  "reason": "TIMESTAMP_EXPIRED"
}
```

Hoac neu gateway timestamp hop le nhung sensor timestamp cu:

```text
HTTP 401
{
  "error": "SENSOR_AUTH_FAIL",
  "reason": "TIMESTAMP_EXPIRED"
}
```

### Diem noi khi thuyet trinh

Replay attack khong can biet secret key. No tan dung viec request cu tung hop
le. Vi vay timestamp window la bat buoc trong mo hinh HMAC.

---

## 7. Scenario 3 - Brute Force va Auto Block

### Mo ta

Ke tan cong thu nhieu HMAC ngau nhien lien tiep de doan token hop le.

### Vi sao bi chan

Moi lan verify fail voi device ton tai, backend goi:

```text
fail_count = fail_count + 1
```

Khi `fail_count >= 5`:

```text
status = blocked
```

Sau do request hop le cung bi chan neu thiet bi van `blocked`.

### Ket qua mong doi

```text
Lan 1 -> HTTP 401 GATEWAY_AUTH_FAIL
Lan 2 -> HTTP 401 GATEWAY_AUTH_FAIL
Lan 3 -> HTTP 401 GATEWAY_AUTH_FAIL
Lan 4 -> HTTP 401 GATEWAY_AUTH_FAIL
Lan 5 -> HTTP 401 GATEWAY_AUTH_FAIL + DEVICE_BLOCKED
Lan 6 -> HTTP 401 hoac 403 tuy diem bi chan va status hien tai
```

Trong code hien tai, `verifyGatewayHMAC()` chua tu choi `DEVICE_BLOCKED` ngay
trong service, nen neu HMAC van sai thi request tiep theo van co the tra `401
HMAC_MISMATCH`. Request hop le voi device da blocked se bi handler chan bang
`403 DEVICE_BLOCKED`.

### Reset sau demo

Chuyen status thiet bi ve `active` tren Dashboard. Luu y route status hien tai
chi cap nhat `status`, khong reset `fail_count`; mot request data hop le se reset
`fail_count = 0` sau khi duoc luu.

---

## 8. Scenario 4 - Unregistered Device

### Mo ta

Thiet bi chua tung duoc dang ky trong DB tu dat `device_id` va gui request.

### Vi sao bi chan

Backend query:

```sql
SELECT id, secret_key, status, fail_count
FROM devices
WHERE device_id = ?
LIMIT 1
```

Khong co record -> khong co secret de verify -> `NOT_FOUND`.

### Ket qua mong doi

```text
HTTP 401
{
  "error": "GATEWAY_AUTH_FAIL",
  "reason": "NOT_FOUND"
}
```

### Audit

- Co `GATEWAY_AUTH_FAIL`.
- `device_id` trong audit details la ID gia.
- `device_id` DB co the la `null` vi khong co record de lien ket.
- `fail_count` khong tang vi device khong ton tai.

---

## 9. Scenario 5 - Privilege Escalation

### Mo ta

Sensor dung chinh `sensor_id` cua minh lam `gateway_id`. Vi no co `SN_SECRET`,
HMAC co the dung ve mat ky thuat, nhung no dang dong vai sai.

Payload y tuong:

```json
{
  "gateway_id": "ESP32-SN-...",
  "gw_hmac": "HMAC bang SN_SECRET",
  "sensor_id": "ESP32-SN-...",
  "sn_hmac": "HMAC bang SN_SECRET"
}
```

### Vi sao bi chan

Sau khi HMAC pass, `data.routes.ts` lay `device_type` tu DB:

```text
gateway_id must be a gateway device
sensor_id must be a sensor device
```

Neu `gateway_id` tro den mot sensor:

```text
sensor != gateway
```

### Ket qua mong doi

```text
HTTP 403
{
  "error": "INVALID_DEVICE_TYPE",
  "detail": "gateway_id must be a gateway device"
}
```

### Diem noi khi thuyet trinh

Day la khac biet giua authentication va authorization:

- Authentication: HMAC dung, danh tinh thiet bi duoc xac nhan.
- Authorization: thiet bi da xac thuc nhung khong du quyen dong vai gateway.

---

## 10. Scenario 6 - SQL Injection thu cong

`attack_demo.sh` chua chay scenario SQL injection, nhung co the demo thu cong.

### Payload OR bypass

```bash
curl -i -X POST "http://localhost:3000/api/device/data" \
  -H "Content-Type: application/json" \
  -d '{
    "gateway_id": "'\'' OR '\''1'\''='\''1",
    "gw_timestamp": 1760000000,
    "gw_hmac": "fake",
    "sensor_id": "'\'' OR '\''1'\''='\''1",
    "sn_timestamp": 1760000000,
    "sn_hmac": "fake",
    "data": {}
  }'
```

### Payload DROP TABLE

```bash
curl -i -X POST "http://localhost:3000/api/device/data" \
  -H "Content-Type: application/json" \
  -d '{
    "gateway_id": "ESP32-GW-X'\''; DROP TABLE devices;--",
    "gw_timestamp": 1760000000,
    "gw_hmac": "fake",
    "sensor_id": "ESP32-SN-X",
    "sn_timestamp": 1760000000,
    "sn_hmac": "fake",
    "data": {}
  }'
```

### Vi sao bi chan

Code dung prepared statements:

```ts
pool.execute(
  "SELECT id, secret_key, status, fail_count FROM devices WHERE device_id = ? LIMIT 1",
  [device_id]
)
```

Chuoi injection bi xem la gia tri cua `device_id`, khong duoc parse thanh SQL.

### Ket qua mong doi

```text
HTTP 401
{
  "error": "GATEWAY_AUTH_FAIL",
  "reason": "NOT_FOUND"
}
```

Kiem tra DB van con bang:

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SHOW TABLES;
SELECT COUNT(*) FROM devices;
```

---

## 11. Bang tong hop STRIDE

| Scenario | Threat | STRIDE | Defense | Ket qua |
|---|---|---|---|---|
| 0. Baseline | Request hop le | - | HMAC + RBAC + status deu pass | `200` |
| 1. Spoofing | Gia mao device/HMAC | Spoofing | HMAC-SHA256 + timing-safe compare | `401 HMAC_MISMATCH` |
| 2. Replay | Gui lai request cu | Tampering | Timestamp window +-300 giay | `401 TIMESTAMP_EXPIRED` |
| 3. Brute force | Thu token lien tuc | DoS / Spoofing | Rate limit + fail_count + auto block | `401`, sau do blocked |
| 4. Unregistered | Thiet bi la | Spoofing | DB lookup theo device_id | `401 NOT_FOUND` |
| 5. Privilege escalation | Sensor gia gateway | Elevation of Privilege | device_type RBAC | `403 INVALID_DEVICE_TYPE` |
| 6. SQL injection | Chen SQL vao ID | Tampering / Info Disclosure | Prepared statements | `401 NOT_FOUND`, DB an toan |

---

## 12. Audit log va cau lenh kiem tra

### 12.1 Xem audit tren Dashboard

Vao:

```text
http://localhost:3000/audit
```

Hoac qua Nginx:

```text
http://localhost/audit
```

Event quan trong:

| Event | Y nghia |
|---|---|
| `DATA_RECV` | Backend nhan va luu data hop le |
| `GATEWAY_AUTH_FAIL` | Gateway HMAC/timestamp/lookup fail |
| `SENSOR_AUTH_FAIL` | Sensor HMAC/timestamp/lookup fail |
| `DEVICE_BLOCKED` | Thiet bi bi block sau nhieu lan fail |
| `DEVICE_REGISTER` | Dang ky thiet bi moi |
| `DEVICE_STATUS_CHANGE` | Doi status active/inactive/blocked |
| `DEVICE_DELETE` | Xoa thiet bi |

### 12.2 Xem truc tiep MySQL

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SELECT event_type, device_id, ip_address, details, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;

SELECT device_id, device_type, status, fail_count, last_seen
FROM devices
ORDER BY created_at DESC;

SELECT sd.id, d.device_id AS sensor, gw.device_id AS gateway, sd.payload, sd.received_at
FROM sensor_data sd
JOIN devices d ON sd.device_id = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC
LIMIT 10;
```

### 12.3 Xem log backend

```powershell
docker compose logs -f backend
```

---

## 13. Rui ro con lai

### 13.1 Secret key dang nam trong firmware

Neu ke tan cong lay duoc ESP32 vat ly, co the dump flash va tim:

- `DEVICE_ID`
- `SECRET_KEY`
- `GW_DEVICE_ID`
- `GW_SECRET_KEY`
- danh sach `KNOWN_SENSORS`

Giam thieu:

- Bat ESP32 Secure Boot.
- Bat Flash Encryption.
- Khong commit config that len git.
- Co co che rotate key khi nghi ngo lo bi mat.

### 13.2 MQTT chua ma hoa va chua xac thuc broker

Mosquitto hien expose cong `1883`. Neu trong LAN khong tin cay, ke tan cong co
the sniff payload MQTT. HMAC giup chong sua/gia mao, nhung payload sensor van bi
lo.

Giam thieu:

- Dung MQTT over TLS cong `8883`.
- Bat username/password hoac client certificate cho MQTT.
- Gioi han network truy cap broker.

### 13.3 Gateway co whitelist sensor cuc bo

Gateway chi biet sensor trong `KNOWN_SENSORS`. Khi them sensor moi, can flash
lai hoac cap nhat firmware gateway. Neu whitelist cu bi lo, attacker co them
thong tin ve sensor hop le.

Giam thieu:

- Quan ly enrollment dong tu backend.
- Dung OTA co ky so.
- Tach key moi lan rotate.

### 13.4 Secret key luu plain text trong DB

Bang `devices.secret_key` dang luu key de backend tinh HMAC. Neu DB bi lo, attacker
co the ky request hop le.

Giam thieu:

- Ma hoa secret at rest bang master key tu KMS/env.
- Gioi han user DB chi co quyen can thiet.
- Rotate key sau incident.

### 13.5 Cookie JWT thieu cau hinh Secure trong local

Cookie login co `httpOnly` va `sameSite: strict`, nhung chua bat `secure` trong
code hien tai. Dieu nay phu hop local HTTP, nhung production nen bat HTTPS va
`secure: true`.

---

## 14. Thu tu demo khuyen dung

```text
1. Mo kien truc: Sensor -> MQTT -> Gateway -> HTTP -> Backend -> MySQL
2. Cho xem /api/device/data va cong thuc HMAC
3. Scenario 0: request hop le -> 200 DATA_RECV
4. Scenario 1: HMAC gia -> 401 HMAC_MISMATCH
5. Scenario 2: timestamp cu -> 401 TIMESTAMP_EXPIRED
6. Scenario 3: brute force -> fail_count tang, device blocked
7. Scenario 4: device chua dang ky -> 401 NOT_FOUND
8. Scenario 5: sensor gia gateway -> 403 INVALID_DEVICE_TYPE
9. Scenario 6: SQL injection -> prepared statement chan
10. Mo Audit Dashboard va MySQL de doi chieu
11. Ket luan rui ro con lai: firmware key, MQTT TLS, DB secret, key rotation
```

Lenh script nhanh:

```bash
./scripts/attack_demo.sh "http://localhost:3000" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

Neu thiet bi bi block sau demo, vao Dashboard doi status ve `active` truoc khi
chay lai.
