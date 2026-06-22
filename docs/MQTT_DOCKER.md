# Làm việc với MQTT Broker đang chạy trong Docker

> Áp dụng khi hệ thống đang chạy bằng `docker-compose up` (container `iot-mosquitto-1` và `iot-mosquitto-2`).
> Thông tin kết nối lấy từ [docker-compose.yml](../docker-compose.yml) và [mosquitto/broker1/mosquitto.conf](../mosquitto/broker1/mosquitto.conf), [mosquitto/broker2/mosquitto.conf](../mosquitto/broker2/mosquitto.conf).

```
Broker 1 (Sensor ↔ Gateway)
  Container : iot-mosquitto-1
  Port      : 1883 (trong container)  →  1883 (map ra host)
  Topic     : local/sensors/+/data

Broker 2 (Gateway ↔ Backend)
  Container : iot-mosquitto-2
  Port      : 1883 (trong container)  →  1884 (map ra host)
  Topic     : gateway/+/data
```

⚠️ **Lưu ý:** Cả hai broker đều bật `allow_anonymous true` — không cần username/password khi kết nối. Broker 2 bật thêm `log_dest topic` để backend đọc IP gateway qua `$SYS/broker/log/N`.

---

## Cách 1a — Tab **Exec** trong Docker Desktop (GUI, không cần PowerShell)

1. Mở **Docker Desktop** → menu **Containers** ở sidebar trái.
2. Click vào container **`iot-mosquitto-1`** hoặc **`iot-mosquitto-2`**.
3. Chọn tab **Exec** — Docker Desktop mở terminal bên trong container.
4. Subscribe để xem tất cả message đang chạy qua broker:
   ```sh
   mosquitto_sub -v -t '#'
   ```
5. Publish thử 1 message để test:
   ```sh
   mosquitto_pub -t local/sensors/ESP32-SN-TEST/data -m '{"sensor_id":"ESP32-SN-TEST","sn_timestamp":0,"sn_hmac":"test","data":{"temperature":28.5,"humidity":65.2}}'
   ```

> Tab Exec tương đương `docker exec -it iot-mosquitto-1 sh` — đã nằm trong container nên không cần tiền tố `docker exec`.

---

## Cách 1b — `docker exec` từ terminal ngoài (PowerShell)

### Subscribe xem message realtime — Broker 1

```powershell
docker exec -it iot-mosquitto-1 mosquitto_sub -v -t '#'
```

### Subscribe xem message realtime — Broker 2

```powershell
docker exec -it iot-mosquitto-2 mosquitto_sub -v -t '#'
```

Cờ `-v` in kèm tên topic trước mỗi message, `#` là wildcard tất cả topic.

### Subscribe chỉ 1 topic cụ thể

```powershell
# Chỉ xem data từ 1 sensor cụ thể
docker exec -it iot-mosquitto-1 mosquitto_sub -v -t 'local/sensors/ESP32-SN-XXXXXXXX/data'

# Chỉ xem data từ 1 gateway cụ thể
docker exec -it iot-mosquitto-2 mosquitto_sub -v -t 'gateway/ESP32-GW-XXXXXXXX/data'
```

### Publish message thử vào Broker 1

```powershell
docker exec iot-mosquitto-1 mosquitto_pub `
  -t local/sensors/ESP32-SN-TEST/data `
  -m '{"sensor_id":"ESP32-SN-TEST","sn_timestamp":1700000000,"sn_hmac":"aabbcc","data":{"temperature":28.5,"humidity":65.0}}'
```

### Publish message thử vào Broker 2

```powershell
docker exec iot-mosquitto-2 mosquitto_pub `
  -t gateway/ESP32-GW-TEST/data `
  -m '{"gateway_id":"ESP32-GW-TEST","gw_timestamp":1700000000,"gw_hmac":"aabbcc","gateway_ip":"192.168.1.1","sensor_payload":{"sensor_id":"ESP32-SN-TEST","sn_timestamp":1700000000,"sn_hmac":"aabbcc","data":{"temperature":28.5,"humidity":65.0}}}'
```

---

## Cách 2 — Kết nối từ host qua cổng map

Cần cài **Mosquitto client** trên Windows (tải tại mosquitto.org, tick chọn "Client tools" khi cài).

### Subscribe từ host — Broker 1 (port 1883)

```powershell
mosquitto_sub -h 127.0.0.1 -p 1883 -v -t '#'
```

### Subscribe từ host — Broker 2 (port 1884)

```powershell
mosquitto_sub -h 127.0.0.1 -p 1884 -v -t '#'
```

### Publish từ host vào Broker 1

```powershell
mosquitto_pub -h 127.0.0.1 -p 1883 -t local/sensors/ESP32-SN-TEST/data -m '{"sensor_id":"ESP32-SN-TEST","sn_timestamp":1700000000,"sn_hmac":"test","data":{"temperature":28.5,"humidity":65.0}}'
```

Hoặc dùng GUI: **MQTT Explorer** (mqtt-explorer.com) — kết nối `127.0.0.1:1883` hoặc `127.0.0.1:1884`, không cần username/password.

---

## Cách 3 — Script Node.js (dùng khi không có Mosquitto client cài sẵn)

Project đã có `mqtt` trong `backend/node_modules`, có thể viết script tạm:

```js
// backend/_mqtt_listen.js (xoá sau khi dùng xong)
const mqtt = require("mqtt");

const BROKER = process.argv[2] === "2"
  ? "mqtt://127.0.0.1:1884"
  : "mqtt://127.0.0.1:1883";

const client = mqtt.connect(BROKER);

client.on("connect", () => {
  console.log(`Connected to ${BROKER}`);
  client.subscribe("#");
});

client.on("message", (topic, payload) => {
  console.log(`[${topic}]`, payload.toString());
});
```

```powershell
# Lắng nghe Broker 1
cd backend
node _mqtt_listen.js 1

# Lắng nghe Broker 2
node _mqtt_listen.js 2
```

---

## Xem log của broker

### Xem log realtime (container đang chạy)

```powershell
# Broker 1
docker logs -f iot-mosquitto-1

# Broker 2
docker logs -f iot-mosquitto-2
```

### Xem 50 dòng log gần nhất

```powershell
docker logs --tail 50 iot-mosquitto-1
docker logs --tail 50 iot-mosquitto-2
```

Log Broker 2 sẽ ghi thêm dòng dạng:
```
1700000000: New client connected from 192.168.x.x as ESP32-GW-XXXX
```
— đây là nguồn dữ liệu mà `mqttTracker.ts` dùng để cập nhật `last_ip` cho gateway trong database.

---

## Xem thống kê broker qua topic $SYS (chỉ Broker 2)

Broker 2 bật `log_dest topic` nên publish số liệu nội bộ vào topic `$SYS/`:

```powershell
# Xem số client đang kết nối
docker exec -it iot-mosquitto-2 mosquitto_sub -v -t '$SYS/broker/clients/connected'

# Xem số message đã nhận
docker exec -it iot-mosquitto-2 mosquitto_sub -v -t '$SYS/broker/messages/received'

# Xem tất cả $SYS metrics
docker exec -it iot-mosquitto-2 mosquitto_sub -v -t '$SYS/#'
```

⚠️ Broker 1 không bật `log_dest topic` nên **không có** topic `$SYS` để subscribe.

---

## Kiểm tra nhanh cấu trúc topic

```
Broker 1 (port 1883)                    Broker 2 (port 1884)
─────────────────────────────────       ─────────────────────────────────
local/sensors/{sensor_id}/data          gateway/{gateway_id}/data
                                        $SYS/broker/log/N  (nội bộ)
                                        $SYS/broker/clients/connected
```

---

## Kiểm tra nhanh container có đang chạy không

```powershell
docker ps --filter "name=iot-mosquitto"
```

Nếu không thấy container, khởi động lại toàn bộ stack:

```powershell
docker-compose up -d
```

Restart riêng 1 broker (không ảnh hưởng service khác):

```powershell
docker-compose restart mqtt-broker-1
docker-compose restart mqtt-broker-2
```
