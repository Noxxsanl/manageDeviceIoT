# Huong dan chay mo phong tan cong IoT

Tai lieu nay huong dan chay demo tu dau: khoi dong Docker, chay Backend/Frontend,
nap firmware ESP32, dang ky thiet bi, va chay script mo phong tan cong.

File nay duoc viet dua tren cac script hien co:

- `scripts/setup.sh`
- `scripts/setup.bat`
- `scripts/attack_demo.sh`

> Luu y: Cac kich ban tan cong chi dung cho moi truong lab/local cua du an nay.
> Khong chay vao he thong khong thuoc quyen so huu cua ban.

---

## 1. Tong quan thu tu demo

```text
1. Khoi dong Docker Desktop
2. Chay scripts/setup.bat hoac scripts/setup.sh
3. Kiem tra Backend, Frontend, MySQL, Mosquitto
4. Dang nhap Dashboard
5. Tao Gateway va Sensor, luu device_id + secret_key
6. Chuyen Gateway va Sensor sang active
7. Sua config firmware Gateway va Sensor
8. Nap firmware Gateway
9. Nap firmware Sensor
10. Xac nhan Sensor -> MQTT -> Gateway -> Backend co data
11. Chay scripts/attack_demo.sh de mo phong tan cong
12. Xem Audit Log va reset thiet bi neu bi blocked
```

---

## 2. Yeu cau truoc khi chay

### 2.1 Phan mem

Can co:

- Docker Desktop
- Git Bash, WSL, hoac terminal co Bash de chay `attack_demo.sh`
- `curl`
- `openssl`
- `xxd`
- PlatformIO IDE trong VS Code hoac PlatformIO CLI
- Driver USB cho ESP32 neu Windows chua nhan cong COM

Neu chi chay web/backend bang Docker, khong can cai Node.js tren may host.

### 2.2 Phan cung firmware

Toi thieu:

- 1 ESP32 Gateway
- 1 ESP32 Sensor
- 1 cam bien DHT22 cho Sensor
- Day USB, day jumper
- Dien tro pull-up 10k tu DATA cua DHT22 len 3.3V

### 2.3 Cong mac dinh

| Service | Cong/URL |
|---|---|
| Nginx | `http://localhost` |
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:5000` |
| Backend health | `http://localhost:5000/api/health` |
| MySQL tren host | `localhost:3308` |
| Mosquitto MQTT | `localhost:1883` |

---

## 3. Cach 1 - Khoi dong bang Docker script

Day la cach khuyen dung de demo nhanh.

### 3.1 Windows

Mo PowerShell hoac CMD tai thu muc goc repo:

```powershell
cd E:\WorkSpace\managerDeviceIoT
scripts\setup.bat
```

`setup.bat` se:

- Kiem tra Docker co trong PATH.
- Kiem tra Docker daemon dang chay.
- Kiem tra `docker-compose` hoac `docker compose`.
- Tao `backend\.env` tu `backend\.env.example` neu chua co.
- Chay `docker compose up --build -d`.

### 3.2 Linux, macOS, WSL, Git Bash

```bash
cd /e/WorkSpace/managerDeviceIoT
bash scripts/setup.sh
```

`setup.sh` lam cac viec tuong tu `setup.bat`:

- Kiem tra Docker.
- Kiem tra Docker Compose.
- Tao `backend/.env` neu chua co.
- Chay `docker compose up --build -d`.

### 3.3 Luu y ve mat khau dang nhap

Hai script setup hien dang in:

```text
admin / 123456
```

Nhung schema hien tai seed tai khoan:

```text
admin / admin123
```

Khi demo, dung:

```text
Username: admin
Password: admin123
```

---

## 4. Kiem tra Docker services

Sau khi chay setup:

```powershell
docker compose ps
```

Can thay cac container chay:

- `iot-mysql`
- `iot-mosquitto`
- `iot-nginx`
- `iot-backend`
- `iot-frontend`

Kiem tra Backend:

```powershell
curl http://localhost:5000/api/health
```

Kiem tra log neu co loi:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
docker compose logs -f mosquitto
```

Dung toan bo stack:

```powershell
docker compose down
```

Build lai sau khi sua code:

```powershell
docker compose up -d --build
```

---

## 5. Cach 2 - Chay Backend va Frontend rieng

Dung cach nay khi muon debug code Node/Next truc tiep tren may host. Van co the
dung Docker chi cho MySQL va Mosquitto, hoac cai MySQL/Mosquitto local rieng.

### 5.1 Chay MySQL va Mosquitto bang Docker

Neu muon chi dung Docker cho ha tang:

```powershell
docker compose up -d mysql mosquitto
```

Voi cach nay, tren host:

- MySQL la `localhost:3308`
- Mosquitto la `localhost:1883`

### 5.2 Cau hinh Backend local

Tao hoac sua `backend\.env`:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=3308
DB_USER=iot_managerIoT
DB_PASS=iot_managerIoTpassword
DB_NAME=iot_managerDeviceIoT

JWT_SECRET=local_dev_secret_key_change_in_production_32chars

MQTT_HOST=localhost
MQTT_PORT=1883

FRONTEND_URL=http://localhost:3000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> Neu MySQL chay local ngoai Docker o cong `3306`, doi `DB_PORT=3306`.

Chay Backend:

```powershell
cd E:\WorkSpace\managerDeviceIoT\backend
npm install
npm run dev
```

Kiem tra:

```powershell
curl http://localhost:5000/api/health
```

### 5.3 Cau hinh Frontend local

Tao hoac sua `frontend\.env.local`:

```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=IoT Device Manager
```

Chay Frontend:

```powershell
cd E:\WorkSpace\managerDeviceIoT\frontend
npm install
npm run dev
```

Mo:

```text
http://localhost:3000
```

---

## 6. Dang ky thiet bi demo

Mo Dashboard:

```text
http://localhost:3000
```

Dang nhap:

```text
admin / admin123
```

Tao 2 thiet bi:

| Thiet bi | Type | Ten goi y |
|---|---|---|
| Gateway | `gateway` | `Demo Gateway` |
| Sensor | `sensor` | `Demo Sensor` |

Sau khi tao, Dashboard tra ve:

- `device_id`
- `secret_key`

Sao chep ngay cac gia tri nay:

```text
GW_ID=ESP32-GW-...
GW_SECRET=...
SN_ID=ESP32-SN-...
SN_SECRET=...
```

Thiet bi moi co status `inactive`. Truoc khi chay demo, chuyen ca Gateway va
Sensor sang:

```text
active
```

---

## 7. Lay IP may chay Docker

ESP32 can truy cap duoc may dang chay Docker qua LAN.

Tren Windows:

```powershell
ipconfig
```

Tim `IPv4 Address` cua card WiFi, vi du:

```text
192.168.1.100
```

Dung IP nay cho:

- `MQTT_HOST`
- `BACKEND_URL`

May tinh va ESP32 phai cung mang WiFi/LAN.

---

## 8. Cau hinh va nap firmware Gateway

Mo file:

```text
firmware/gateway-node/include/config_gw.h
```

Sua cac gia tri:

```cpp
#define GW_DEVICE_ID   "ESP32-GW-..."
#define GW_SECRET_KEY  "..."

#define WIFI_SSID      "ten-wifi"
#define WIFI_PASS      "mat-khau-wifi"

#define MQTT_HOST      "192.168.1.100"
#define MQTT_PORT      1883

#define BACKEND_URL    "http://192.168.1.100:3000/api/device/data"
```

Co the doi `BACKEND_URL` thanh backend truc tiep:

```cpp
#define BACKEND_URL    "http://192.168.1.100:5000/api/device/data"
```

Them Sensor vao whitelist cua Gateway:

```cpp
static const SensorCredential KNOWN_SENSORS[] = {
    { "ESP32-SN-...", "SN_SECRET_64_HEX" },
};
```

Nap firmware Gateway bang PlatformIO CLI:

```powershell
cd E:\WorkSpace\managerDeviceIoT\firmware\gateway-node
pio run --target upload
pio device monitor -b 115200
```

Hoac mo thu muc `firmware/gateway-node` bang VS Code PlatformIO va bam `Upload`.

Ket qua mong doi trong Serial Monitor:

```text
IoT Gateway Node - Starting
Gateway ID : ESP32-GW-...
Backend URL: http://192.168.1.100:3000/api/device/data
[MAIN] Ready - listening for sensor data...
```

---

## 9. Cau hinh va nap firmware Sensor

Mo file:

```text
firmware/sensor-node/include/config.h
```

Sua cac gia tri:

```cpp
#define DEVICE_ID   "ESP32-SN-..."
#define SECRET_KEY  "..."

#define WIFI_SSID   "ten-wifi"
#define WIFI_PASS   "mat-khau-wifi"

#define MQTT_HOST   "192.168.1.100"
#define MQTT_PORT   1883
```

Kiem tra chan DHT22:

```cpp
#define DHT_PIN     4
#define DHT_TYPE    DHT22
```

Nap firmware Sensor:

```powershell
cd E:\WorkSpace\managerDeviceIoT\firmware\sensor-node
pio run --target upload
pio device monitor -b 115200
```

Ket qua mong doi:

```text
IoT Sensor Node - Khoi dong
Device ID  : ESP32-SN-...
[MQTT] Published (... bytes): {"sensor_id":"ESP32-SN-...","sn_timestamp":...}
```

Gateway sau do se in:

```text
[FWD] Sensor HMAC OK
[FWD] Posting ... bytes to backend
[FWD] Backend OK (200)
```

---

## 10. Xac nhan data da ve Backend

Mo Dashboard:

```text
http://localhost:3000/dashboard
```

Kiem tra:

- Trang `Devices`: Sensor/Gateway co `last_seen` moi.
- Trang `Logs` hoac device detail: co du lieu sensor.
- Trang `Audit`: co event `DATA_RECV`.

Kiem tra truc tiep DB:

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SELECT d.device_id AS sensor, gw.device_id AS gateway, sd.payload, sd.received_at
FROM sensor_data sd
JOIN devices d ON sd.device_id = d.id
JOIN devices gw ON sd.gateway_id = gw.id
ORDER BY sd.received_at DESC
LIMIT 10;
```

---

## 11. Chay mo phong tan cong bang script

`scripts/attack_demo.sh` nhan 5 tham so:

```text
./scripts/attack_demo.sh [BACKEND_URL] [GW_ID] [GW_SECRET] [SN_ID] [SN_SECRET]
```

Trong repo nay, `BACKEND_URL` la base URL, script tu them `/api/device/data`.

### 11.1 Chay qua Frontend proxy

```bash
cd /e/WorkSpace/managerDeviceIoT
chmod +x scripts/attack_demo.sh

export GW_ID="ESP32-GW-..."
export GW_SECRET="..."
export SN_ID="ESP32-SN-..."
export SN_SECRET="..."

./scripts/attack_demo.sh \
  "http://localhost:3000" \
  "$GW_ID" "$GW_SECRET" \
  "$SN_ID" "$SN_SECRET"
```

Script se gui den:

```text
http://localhost:3000/api/device/data
```

### 11.2 Chay truc tiep vao Backend

```bash
./scripts/attack_demo.sh \
  "http://localhost:5000" \
  "$GW_ID" "$GW_SECRET" \
  "$SN_ID" "$SN_SECRET"
```

Script se gui den:

```text
http://localhost:5000/api/device/data
```

### 11.3 Cac scenario trong script

| Scenario | Noi dung | Ket qua mong doi |
|---|---|---|
| 0 | Baseline request hop le | `200 OK` |
| 1 | Device spoofing, HMAC gia | `401 GATEWAY_AUTH_FAIL` |
| 2 | Replay attack, timestamp cu | `401 TIMESTAMP_EXPIRED` |
| 3 | Brute force HMAC sai nhieu lan | fail_count tang, device co the bi `blocked` |
| 4 | Unregistered device | `401 GATEWAY_AUTH_FAIL` |
| 5 | Sensor gia lam Gateway | `403 INVALID_DEVICE_TYPE` |

---

## 12. Xem ket qua mo phong

### 12.1 Xem Audit tren Dashboard

Mo:

```text
http://localhost:3000/audit
```

Can thay cac event:

- `DATA_RECV`
- `GATEWAY_AUTH_FAIL`
- `SENSOR_AUTH_FAIL`
- `DEVICE_BLOCKED`

### 12.2 Xem log Backend

```powershell
docker compose logs -f backend
```

### 12.3 Xem DB

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
SELECT event_type, device_id, ip_address, details, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 30;

SELECT device_id, device_type, status, fail_count, last_seen
FROM devices
ORDER BY created_at DESC;
```

---

## 13. Reset sau khi demo

Scenario brute force co the lam Gateway hoac Sensor bi `blocked`.

### 13.1 Reset bang Dashboard

Vao `Devices`, chon thiet bi bi block, doi status ve:

```text
active
```

### 13.2 Reset bang SQL

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

```sql
UPDATE devices
SET status = 'active', fail_count = 0
WHERE device_id IN ('ESP32-GW-...', 'ESP32-SN-...');
```

---

## 14. Loi thuong gap

### Docker daemon chua chay

Loi tu `setup.bat` hoac `setup.sh`:

```text
Docker daemon chua chay
```

Cach xu ly:

- Mo Docker Desktop.
- Doi den khi Docker bao `Running`.
- Chay lai script setup.

### Dang nhap sai mat khau

Neu setup script in `admin / 123456`, bo qua dong nay. Dung:

```text
admin / admin123
```

### Backend khong ket noi DB

Kiem tra container MySQL:

```powershell
docker compose ps mysql
docker compose logs mysql
```

Neu chay Backend local voi MySQL Docker, nho dung:

```env
DB_PORT=3308
```

### ESP32 khong gui duoc MQTT

Kiem tra:

- ESP32 va may Docker cung mang WiFi.
- `MQTT_HOST` la IP LAN cua may, khong phai `localhost`.
- Cong `1883` khong bi firewall chan.
- Mosquitto container dang chay.

### Gateway forward fail

Kiem tra:

- `BACKEND_URL` dung IP LAN va dung endpoint `/api/device/data`.
- Neu dung `:3000`, frontend container phai chay.
- Neu dung `:5000`, backend container phai expose duoc cong 5000.
- Gateway co dung `GW_DEVICE_ID` va `GW_SECRET_KEY`.
- Sensor co trong `KNOWN_SENSORS`.

### Request hop le van bi `DEVICE_NOT_ACTIVE`

Thiet bi moi dang ky mac dinh la `inactive`. Vao Dashboard doi ca Gateway va
Sensor sang `active`.

---

## 15. Lenh nhanh cho buoi demo

```powershell
cd E:\WorkSpace\managerDeviceIoT
scripts\setup.bat
docker compose ps
curl http://localhost:5000/api/health
```

Mo Dashboard:

```text
http://localhost:3000
admin / admin123
```

Chay attack script tu Git Bash:

```bash
cd /e/WorkSpace/managerDeviceIoT

export GW_ID="ESP32-GW-..."
export GW_SECRET="..."
export SN_ID="ESP32-SN-..."
export SN_SECRET="..."

./scripts/attack_demo.sh "http://localhost:3000" "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET"
```

Xem audit:

```text
http://localhost:3000/audit
```
