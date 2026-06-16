# Cau hoi phan bien va goi y tra loi

De tai: He thong quan ly thiet bi IoT va phan quyen truy cap

## 1. Kien truc he thong

### Cau 1. He thong gom nhung thanh phan nao?

He thong gom 4 thanh phan chinh: IoT Device, Server, Database va Dashboard. Trong project nay, IoT Device duoc chia thanh sensor node va gateway node. Sensor doc du lieu moi truong, gui qua MQTT den gateway. Gateway kiem tra sensor, ky them HMAC cua gateway va forward du lieu len backend. Backend xu ly xac thuc, luu du lieu vao database va dashboard hien thi thiet bi, trang thai, du lieu cam bien va audit log.

### Cau 2. Vi sao tach sensor node va gateway node?

Tach sensor va gateway giup mo phong kien truc IoT thuc te hon. Sensor chi can gui du lieu noi bo qua MQTT, gateway dong vai tro trung gian kiem tra sensor hop le va day du lieu len server. Cach nay giup server khong phai giao tiep truc tiep voi tung sensor trong mang noi bo, dong thoi them mot lop kiem tra truoc khi du lieu vao backend.

### Cau 3. Gateway co vai tro bao mat gi?

Gateway khong chi forward du lieu ma con kiem tra whitelist sensor, kiem tra timestamp, kiem tra HMAC cua sensor, sau do moi ky them HMAC cua gateway de gui len backend. Backend van kiem tra lai ca gateway va sensor, tao thanh co che xac thuc hai lop.

### Cau 4. Vi sao backend van kiem tra sensor HMAC neu gateway da kiem tra roi?

Vi gateway co the bi loi, bi cau hinh sai hoac bi tan cong. Backend la lop bao ve cuoi cung nen khong tin hoan toan vao gateway. Backend phai tu xac minh lai sensor_id, sn_timestamp va sn_hmac truoc khi luu du lieu.

### Cau 5. Neu gateway bi chiem quyen thi attacker co the lam gi?

Neu gateway bi chiem quyen va attacker lay duoc secret key cua gateway, attacker co the tao request hop le o lop gateway. Tuy nhien backend van yeu cau HMAC cua sensor hop le, nen attacker van can secret key cua sensor neu muon gia mao sensor. Neu attacker lay duoc ca gateway secret va sensor secret thi co the gia mao du lieu, vi vay can bao ve firmware, secret key va co co che rotate/revoke key khi bi lo.

## 2. Xac thuc thiet bi

### Cau 6. De bai yeu cau gui device_id + token + data, nhung code dung HMAC. Giai thich nhu the nao?

Trong project nay, token/secret key khong duoc gui truc tiep len server. Thay vao do, moi thiet bi co device_id va secret_key. Khi gui du lieu, thiet bi tao HMAC bang secret_key tren chuoi device_id:timestamp. HMAC dong vai tro bang chung rang thiet bi biet secret key, nhung khong lam lo secret key tren duong truyen.

### Cau 7. Vi sao khong gui secret_key truc tiep moi lan gui du lieu?

Neu gui secret_key truc tiep, attacker chi can nghe len duong truyen mot lan la co the lay duoc key va gia mao thiet bi. Dung HMAC giup server xac thuc thiet bi ma secret_key khong xuat hien trong request.

### Cau 8. HMAC duoc tao nhu the nao?

Sensor tao HMAC bang cong thuc:

```text
HMAC-SHA256(sensor_secret_key, "sensor_id:sn_timestamp")
```

Gateway tao HMAC bang cong thuc:

```text
HMAC-SHA256(gateway_secret_key, "gateway_id:gw_timestamp")
```

Backend tinh lai HMAC bang secret_key trong database va so sanh voi HMAC trong request.

### Cau 9. Timestamp co tac dung gi?

Timestamp giup chong replay attack. Backend chi chap nhan timestamp nam trong cua so thoi gian 300 giay. Neu attacker lay mot request cu va gui lai sau khi het cua so thoi gian, backend se tu choi voi loi timestamp expired.

### Cau 10. Neu attacker replay request trong vong 300 giay thi sao?

Hien tai he thong giam rui ro replay bang timestamp window, nhung chua chan tuyet doi replay trong cung cua so 300 giay. De chan tot hon, co the them nonce, message id hoac luu timestamp/sequence number gan nhat cua moi thiet bi de tu choi request lap lai.

### Cau 11. Neu secret key bi lo thi diem yeu la gi?

Neu secret key bi lo, attacker co the tao HMAC hop le va gia mao thiet bi. Khi do server khong phan biet duoc dau la thiet bi that va dau la attacker, vi ca hai deu co cung secret key. Giai phap la revoke/rotate secret key, block thiet bi, cap lai key moi va bao ve firmware de giam nguy co bi trich xuat key.

### Cau 12. Secret key duoc cap phat nhu the nao?

Khi admin hoac operator dang ky thiet bi qua API register, backend sinh device_id va secret_key ngau nhien. Secret key chi duoc tra ve mot lan trong response dang ky, sau do khong hien thi lai tren dashboard.

### Cau 13. Neu nguoi dung quen luu secret key thi lam sao?

Do secret key chi tra ve mot lan, neu quen luu thi nen tao co che cap lai key moi thay vi hien thi lai key cu. Cach an toan hon la rotate secret key: server sinh secret moi, vo hieu hoa secret cu, sau do nguoi quan tri nap secret moi vao firmware.

## 3. Kiem soat truy cap va RBAC

### Cau 14. RBAC trong he thong duoc ap dung o dau?

RBAC duoc ap dung cho cac API quan tri cua dashboard. Nguoi dung dang nhap bang JWT cookie, sau do middleware requireRole kiem tra role. He thong co cac role admin, operator va viewer.

### Cau 15. Admin, operator va viewer khac nhau nhu the nao?

Admin co quyen cao nhat, co the tao user, xoa user, dang ky thiet bi, doi trang thai va xoa thiet bi. Operator co the dang ky thiet bi va doi trang thai thiet bi. Viewer chu yeu xem danh sach, chi tiet thiet bi, dashboard va log.

### Cau 16. Vi sao API gui du lieu cua thiet bi khong dung JWT?

Thiet bi IoT thuong la firmware nho, khong phu hop voi flow dang nhap web nhu user dashboard. Thay vao do, thiet bi duoc xac thuc bang device_id, timestamp va HMAC dua tren secret key rieng cua thiet bi.

### Cau 17. Thiet bi inactive, active va blocked khac nhau nhu the nao?

Inactive la thiet bi moi dang ky nhung chua duoc phep gui du lieu. Active la thiet bi hop le va duoc phep gui du lieu. Blocked la thiet bi bi khoa do quan tri vien/operator khoa thu cong hoac do xac thuc sai nhieu lan.

### Cau 18. He thong xu ly thiet bi sai token/HMAC nhu the nao?

Neu gateway hoac sensor gui HMAC sai, backend ghi audit log, tang fail_count neu tim thay thiet bi trong database. Khi fail_count dat nguong 5 lan, backend chuyen trang thai thiet bi sang blocked va tu choi cac request tiep theo.

## 4. Dashboard va trang thai thiet bi

### Cau 19. Dashboard hien thi online/offline dua tren co che nao?

Backend cap nhat last_seen khi gateway va sensor gui du lieu hop le. Dashboard coi thiet bi la online neu last_seen khong null va thoi gian tu last_seen den hien tai nho hon 60 giay. Neu qua 60 giay khong co du lieu hop le moi, thiet bi duoc xem la offline.

### Cau 20. Active va online co giong nhau khong?

Khong. Active la trang thai quyen truy cap, nghia la thiet bi duoc phep gui du lieu. Online la trang thai ket noi duoc suy ra tu last_seen. Mot thiet bi co the active nhung offline neu no duoc phep gui du lieu nhung hien tai khong ket noi hoac khong gui du lieu.

### Cau 21. Dashboard co the hien thi sai so lieu thong ke khong?

Co mot diem can luu y trong code hien tai: backend tra ve cac field total_gateways, total_sensors, online_gateways, online_sensors, nhung frontend dang doc total_gateway, total_sensor, gateway_online, sensor_online. Neu chua sua mapping nay, dashboard co the hien thi 0 du DB co du lieu.

### Cau 22. Dashboard bao ve API quan tri nhu the nao?

Dashboard goi API backend bang cookie JWT httpOnly. Backend dung middleware verifyJWT de kiem tra token. Cac API nhay cam nhu dang ky thiet bi, doi trang thai, xoa thiet bi hoac quan ly user se kiem tra them role bang RBAC.

## 5. Database va luu tru

### Cau 23. Database gom cac bang chinh nao?

Database gom users, devices, sensor_data, device_tokens va audit_log. Bang users luu tai khoan dashboard. Bang devices luu device_id, secret_key, device_type, status, fail_count va last_seen. Bang sensor_data luu du lieu cam bien. Bang audit_log luu su kien bao mat va quan tri.

### Cau 24. Vi sao secret_key dang duoc luu trong bang devices?

Backend can secret_key de tinh lai HMAC va so sanh voi request cua thiet bi. Trong phien ban hien tai, secret_key duoc luu de server co the xac thuc HMAC. Khi trien khai that, nen bao ve database tot hon, co the ma hoa secret at rest hoac dung co che quan ly khoa rieng.

### Cau 25. Bang device_tokens dung de lam gi?

Bang device_tokens co trong schema nhung luong chinh hien tai dang dung secret_key va HMAC. Bang nay co the duoc xem la phan mo rong cho co che token co han su dung, revoke token hoac rotate token trong cac phien ban sau.

### Cau 26. Audit log giup ich gi trong threat model?

Audit log ghi cac su kien nhu dang ky thiet bi, nhan du lieu, xac thuc gateway/sensor that bai, block thiet bi va thay doi trang thai. Nho do nguoi quan tri co the truy vet IP, user agent, device_id va ly do loi khi co hanh vi tan cong hoac truy cap trai phep.

## 6. Threat model

### Cau 27. He thong chong gia mao thiet bi nhu the nao?

He thong khong chi dua vao device_id vi device_id co the bi doan hoac bi sao chep. Moi request phai co HMAC hop le duoc tao tu secret_key rieng cua thiet bi. Neu attacker chi biet device_id ma khong biet secret_key thi khong tao duoc HMAC hop le.

### Cau 28. He thong chong truy cap trai phep API dashboard nhu the nao?

API dashboard yeu cau JWT cookie hop le. Cac thao tac quan tri yeu cau role phu hop. Ngoai ra backend co CORS gioi han origin frontend, helmet cho security headers va rate limit cho login/API.

### Cau 29. Rate limit co tac dung gi?

Rate limit giup giam tan cong brute force va DoS co ban. Login bi gioi han 10 request trong 15 phut moi IP. API gui data cua thiet bi bi gioi han 60 request moi phut moi IP. Cac API quan tri khac bi gioi han 100 request trong 15 phut moi IP.

### Cau 30. Neu attacker biet device_id nhung khong biet secret key thi sao?

Attacker khong the tao HMAC hop le, nen backend se tu choi request voi loi HMAC_MISMATCH. Neu device_id ton tai, fail_count cua thiet bi co the tang va thiet bi co the bi block sau nhieu lan sai.

### Cau 31. Neu attacker gui device_id khong ton tai thi sao?

Backend tra ve loi NOT_FOUND va ghi audit log xac thuc that bai. Tuy nhien vi khong co device trong database nen khong co fail_count cua device nao de tang. Co the mo rong bang cach thong ke theo IP hoac theo device_id gia mao de phat hien scan/brute force.

### Cau 32. Neu attacker lay duoc firmware thi co nguy hiem khong?

Co. Firmware hien luu device_id, secret_key, WiFi credential va danh sach sensor trong file cau hinh. Neu attacker trich xuat firmware thanh cong, secret key co the bi lo. Huong giam rui ro la bat secure boot/flash encryption neu phan cung ho tro, khong commit secret that vao repo, rotate key khi nghi ngo bi lo va han che quyen cua moi thiet bi.

### Cau 33. MQTT port 1883 co diem yeu gi?

MQTT port 1883 thuong la MQTT khong ma hoa. Neu trien khai that, nen dung MQTT over TLS, cau hinh username/password hoac certificate cho broker, va gioi han topic publish/subscribe theo tung device.

### Cau 34. HTTP tu gateway len backend co diem yeu gi?

Firmware gateway dang cau hinh BACKEND_URL dang HTTP. Trong moi truong that, HTTP co the bi nghe len hoac bi sua doi goi tin. Nen dung HTTPS de dam bao tinh bao mat va toan ven du lieu tren duong truyen.

## 7. Cau hoi bat loi code/demo

### Cau 35. Neu dashboard hien thi thong ke bang 0 du da co thiet bi thi nguyen nhan co the la gi?

Nguyen nhan co the do mismatch ten field giua backend va frontend. Backend tra total_gateways, total_sensors, online_gateways, online_sensors, nhung frontend lai doc total_gateway, total_sensor, gateway_online, sensor_online. Can dong bo lai ten field o frontend hoac backend.

### Cau 36. Neu them sensor moi thi gateway co tu nhan khong?

Chua. Gateway hien co whitelist KNOWN_SENSORS trong firmware. Khi them sensor moi, can them device_id va secret_key vao danh sach nay va nap lai firmware, hoac mo rong gateway de lay whitelist tu server.

### Cau 37. He thong co the xoa du lieu sensor khi xoa device khong?

Co. Schema co foreign key ON DELETE CASCADE cho sensor_data tham chieu devices. Route delete device cung xoa sensor_data va device_tokens lien quan truoc khi xoa device.

### Cau 38. Vi sao secret_key chi hien thi mot lan khi dang ky thiet bi?

De giam nguy co lo bi mat. Neu dashboard cho xem lai secret_key bat ky luc nao, tai khoan bi chiem quyen co the lay toan bo key cua thiet bi. Tra ve mot lan buoc nguoi quan tri luu key dung quy trinh va neu mat thi cap lai key moi.

### Cau 39. He thong da co chong SQL injection chua?

Backend dung query co tham so voi pool.execute va placeholder, vi vay cac input nhu username, device_id, id, status khong duoc noi chuoi truc tiep vao SQL. Day la cach giam nguy co SQL injection.

### Cau 40. Diem han che lon nhat cua he thong hien tai la gi?

Mot so han che gom: chua co rotate/revoke secret key hoan chinh, chua chan replay tuyet doi trong cua so 300 giay, MQTT/HTTP trong firmware chua ma hoa theo cau hinh demo, whitelist sensor tren gateway con tinh va secret key trong firmware co nguy co bi lo neu thiet bi bi chiem quyen vat ly.

