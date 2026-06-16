# Truy vấn Database MySQL đang chạy trong Docker

> Áp dụng khi hệ thống đang chạy bằng `docker-compose up` (container `iot-mysql`).
> Thông tin kết nối lấy từ [docker-compose.yml](../docker-compose.yml).

```
Container : iot-mysql
User      : iot_managerIoT
Password  : iot_managerIoTpassword
Database  : iot_managerDeviceIoT
Port      : 3306 (trong container)  →  3308 (map ra host)
```

⚠️ **Lưu ý quan trọng:** Máy host có thể có sẵn một MySQL Windows service khác lắng nghe ở cổng **3306** (không liên quan đến project). Khi truy vấn từ host, luôn dùng cổng **3308** để chắc chắn đang nối vào đúng MySQL của Docker, không phải MySQL native.

---

## Cách 1a — Tab **Exec** trong Docker Desktop (GUI, không cần dùng PowerShell)

1. Mở **Docker Desktop** → menu **Containers** ở sidebar trái.
2. Click vào container **`iot-mysql`** (hoặc tên project nếu Compose group nó vào 1 stack — mở rộng stack ra để thấy `iot-mysql`).
3. Chọn tab **Exec** ở trên cùng — Docker Desktop sẽ mở 1 terminal **đã nằm sẵn trong container**, không cần gõ `docker exec ...` nữa.
4. Trong terminal đó, gõ thẳng:
   ```sh
   mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
   ```
5. Vào được prompt `mysql>` thì gõ SQL trực tiếp:
   ```sql
   SHOW TABLES;
   SELECT COUNT(*) FROM sensor_data;
   SELECT * FROM sensor_data ORDER BY received_at DESC LIMIT 5;
   EXIT;
   ```

> Tab Exec của Docker Desktop về bản chất tương đương `docker exec -it iot-mysql sh` — nó mở thẳng shell bên trong container nên **không cần gõ lại** `docker exec -it iot-mysql` ở đầu lệnh, chỉ cần gõ lệnh `mysql ...` như trên.

---

## Cách 1b — `docker exec` từ terminal ngoài (PowerShell), không qua GUI

Mở 1 shell MySQL bên trong container:

```powershell
docker exec -it iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

Sau đó gõ SQL trực tiếp tại prompt `mysql>`, ví dụ:

```sql
SHOW TABLES;
SELECT COUNT(*) FROM sensor_data;
EXIT;
```

### Chạy 1 câu lệnh rồi thoát ngay (không cần vào shell)

```powershell
docker exec iot-mysql mysql -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT -e "SELECT * FROM sensor_data ORDER BY received_at DESC LIMIT 5;"
```

---

## Cách 2 — Kết nối từ host qua cổng map (3308)

Cần có MySQL client cài trên Windows (`mysql.exe` trong PATH):

```powershell
mysql -h 127.0.0.1 -P 3308 -u iot_managerIoT -piot_managerIoTpassword iot_managerDeviceIoT
```

Hoặc dùng GUI (DBeaver, TablePlus, MySQL Workbench, HeidiSQL...) với cấu hình:
- Host: `127.0.0.1`
- Port: `3308`
- User: `iot_managerIoT`
- Password: `iot_managerIoTpassword`
- Database: `iot_managerDeviceIoT`

---

## Cách 3 — Script Node.js (dùng khi không có MySQL client cài sẵn)

Project đã có `mysql2` trong `backend/node_modules`, có thể viết script tạm để query:

```js
// backend/_query.js (xoá sau khi dùng xong)
const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3308,
    user: "iot_managerIoT",
    password: "iot_managerIoTpassword",
    database: "iot_managerDeviceIoT",
  });

  const [rows] = await conn.query("SELECT * FROM sensor_data ORDER BY received_at DESC LIMIT 5;");
  console.log(rows);

  await conn.end();
})();
```

```powershell
cd backend
node _query.js
```

---

## Các câu lệnh hữu ích

### Xem dữ liệu sensor mới nhất
```sql
SELECT id, device_id, gateway_id, payload, received_at
FROM sensor_data
ORDER BY received_at DESC
LIMIT 10;
```

### Đếm số bản ghi theo từng sensor
```sql
SELECT device_id, COUNT(*) AS total, MAX(received_at) AS last_received
FROM sensor_data
GROUP BY device_id;
```

### Kiểm tra khoảng thời gian dữ liệu đã ghi (để biết simulator/thiết bị còn gửi hay đã dừng)
```sql
SELECT MIN(received_at) AS first_ts, MAX(received_at) AS last_ts, NOW() AS server_now
FROM sensor_data;
```

### Trạng thái & last_seen của tất cả device
```sql
SELECT device_id, device_name, device_type, status, fail_count, last_seen
FROM devices;
```

### Xem audit log gần nhất (auth fail, block, data nhận...)
```sql
SELECT event_type, device_id, ip_address, details, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;
```

### Đếm tổng theo loại thiết bị + đang online (khớp logic dashboard)
```sql
SELECT
  COALESCE(SUM(device_type = 'gateway'), 0) AS total_gateway,
  COALESCE(SUM(device_type = 'sensor'), 0)  AS total_sensor,
  COALESCE(SUM(device_type = 'gateway' AND last_seen IS NOT NULL
            AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS gateway_online,
  COALESCE(SUM(device_type = 'sensor' AND last_seen IS NOT NULL
            AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS sensor_online
FROM devices;
```

### Unblock 1 device bằng SQL trực tiếp (thay nút Unlock trên UI)
```sql
UPDATE devices
SET status = 'active', fail_count = 0
WHERE device_id = 'ESP32-GW-XXXXXXXX';
```

### Xoá toàn bộ dữ liệu sensor cũ (cẩn thận — không thể hoàn tác)
```sql
DELETE FROM sensor_data WHERE received_at < NOW() - INTERVAL 7 DAY;
```

---

## Kiểm tra nhanh container có đang chạy không

```powershell
docker ps --filter "name=iot-mysql"
```

Nếu không thấy container, khởi động lại toàn bộ stack:

```powershell
docker-compose up -d
```
