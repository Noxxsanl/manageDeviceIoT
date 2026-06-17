# Câu hỏi phản biện và gợi ý trả lời

Đề tài: Hệ thống quản lý thiết bị IoT và phân quyền truy cập

---

## 1. Kiến trúc hệ thống

### Câu 1. Hệ thống gồm những thành phần nào?

Hệ thống gồm 4 thành phần chính: IoT Device, Server, Database và Dashboard. Trong project này, IoT Device được chia thành Sensor Node và Gateway Node. Sensor đọc dữ liệu môi trường, gửi qua MQTT đến Gateway. Gateway kiểm tra sensor, ký thêm HMAC của gateway và forward dữ liệu lên Backend qua MQTT. Backend xử lý xác thực, lưu dữ liệu vào database và Dashboard hiển thị thiết bị, trạng thái, dữ liệu cảm biến và audit log. Toàn bộ hạ tầng chạy trong Docker Compose với 5 service: MySQL, Mosquitto (MQTT Broker), Nginx (reverse proxy), Backend Express và Frontend Next.js.

### Câu 2. Vì sao tách Sensor Node và Gateway Node?

Tách sensor và gateway giúp mô phỏng kiến trúc IoT thực tế hơn. Sensor chỉ cần gửi dữ liệu nội bộ qua MQTT trong mạng LAN, gateway đóng vai trò trung gian kiểm tra sensor hợp lệ và đẩy dữ liệu lên server. Cách này giúp server không phải giao tiếp trực tiếp với từng sensor trong mạng nội bộ, đồng thời thêm một lớp kiểm tra trước khi dữ liệu vào backend.

### Câu 3. Gateway có vai trò bảo mật gì?

Gateway không chỉ forward dữ liệu mà còn thực hiện xác thực cục bộ: kiểm tra whitelist sensor (dynamic registry từ backend, refresh mỗi 5 phút; fallback về `KNOWN_SENSORS[]` trong firmware), kiểm tra timestamp trong cửa sổ ±300 giây và kiểm tra HMAC của sensor bằng `safeEq64()` — hàm constant-time chống timing attack. Sau khi sensor pass, gateway mới ký thêm HMAC của mình (`gw_hmac`) và gửi payload lồng ghép lên backend qua MQTT topic `gateway/{gw_id}/data`. Backend vẫn xác thực lại cả gateway lẫn sensor độc lập, tạo thành cơ chế xác thực hai lớp.

### Câu 4. Vì sao backend vẫn kiểm tra sensor HMAC nếu gateway đã kiểm tra rồi?

Vì gateway có thể bị lỗi, bị cấu hình sai hoặc bị tấn công. Backend là lớp bảo vệ cuối cùng nên không tin hoàn toàn vào gateway. Backend phải tự xác minh lại `sensor_id`, `sn_timestamp` và `sn_hmac` — dùng `crypto.timingSafeEqual()` — trước khi lưu dữ liệu. Ngay cả khi gateway bị compromise, attacker vẫn cần `secret_key` của sensor để tạo HMAC hợp lệ vượt qua backend.

### Câu 5. Nếu gateway bị chiếm quyền thì attacker có thể làm gì?

Nếu gateway bị chiếm quyền và attacker lấy được `secret_key` của gateway, attacker có thể tạo request hợp lệ ở lớp gateway. Tuy nhiên backend vẫn yêu cầu HMAC của sensor hợp lệ (Level 2), nên attacker vẫn cần `secret_key` của sensor nếu muốn giả mạo sensor. Nếu attacker lấy được cả gateway secret và sensor secret thì có thể giả mạo dữ liệu, vì vậy cần bảo vệ firmware, secret key và có cơ chế rotate/revoke key khi bị lộ.

---

## 2. Xác thực thiết bị

### Câu 6. Đề bài yêu cầu gửi `device_id + token + data`, nhưng code dùng HMAC. Giải thích như thế nào?

Trong project này, `token` / `secret_key` không được gửi trực tiếp lên server. Thay vào đó, mỗi thiết bị có `device_id` và `secret_key`. Khi gửi dữ liệu, thiết bị tạo HMAC bằng `secret_key` trên chuỗi `device_id:timestamp`. HMAC đóng vai trò bằng chứng rằng thiết bị biết `secret_key`, nhưng không làm lộ `secret_key` trên đường truyền. Đây là cơ chế mạnh hơn so với gửi token tĩnh, vì mỗi lần gửi có timestamp khác nhau nên HMAC cũng khác nhau — kẻ tấn công bắt được request cũ không thể dùng lại.

### Câu 7. Vì sao không gửi `secret_key` trực tiếp mỗi lần gửi dữ liệu?

Nếu gửi `secret_key` trực tiếp, attacker chỉ cần nghe lén đường truyền một lần là có thể lấy được key và giả mạo thiết bị. Dùng HMAC giúp server xác thực thiết bị mà `secret_key` không xuất hiện trong request — ngay cả khi toàn bộ gói tin bị bắt, attacker cũng không thể tách `secret_key` từ HMAC.

### Câu 8. HMAC được tạo như thế nào?

Sensor tạo HMAC bằng công thức:

```
HMAC-SHA256(sensor_secret_key, "sensor_id:sn_timestamp")
```

Gateway tạo HMAC bằng công thức:

```
HMAC-SHA256(gateway_secret_key, "gateway_id:gw_timestamp")
```

Cả hai firmware đều dùng thư viện **mbedTLS** (built-in ESP32 Arduino SDK) để tính HMAC — `firmware/sensor-node/lib/hmac_util/hmac_util.cpp` và `firmware/gateway-node/lib/hmac_util/hmac_util.cpp`. Backend tính lại HMAC bằng `secret_key` trong database và so sánh với HMAC trong request bằng `crypto.timingSafeEqual()` (`backend/src/services/hmacService.ts`).

### Câu 9. Timestamp có tác dụng gì?

Timestamp giúp chống replay attack. Cửa sổ thời gian hợp lệ là **±300 giây**, được kiểm tra ở **ba điểm độc lập**:
- **Gateway firmware** (`firmware/gateway-node/lib/forwarder/forwarder.cpp`): kiểm tra `sn_timestamp` của sensor trước khi forward
- **Backend Level 1** (`backend/src/services/hmacService.ts`): kiểm tra `gw_timestamp` của gateway
- **Backend Level 2** (`backend/src/services/hmacService.ts`): kiểm tra lại `sn_timestamp` của sensor

Nếu attacker lấy một request cũ và gửi lại sau khi hết cửa sổ thời gian, backend sẽ từ chối với lỗi `TIMESTAMP_EXPIRED`.

### Câu 10. Nếu attacker replay request trong vòng 300 giây thì sao?

Hiện tại hệ thống giảm rủi ro replay bằng timestamp window, nhưng chưa chặn tuyệt đối replay trong cùng cửa sổ 300 giây. Để chặn tốt hơn, có thể thêm **nonce** — một số ngẫu nhiên chỉ dùng một lần — server lưu nonce đã dùng và từ chối request trùng nonce. Hoặc lưu timestamp gần nhất của mỗi thiết bị và từ chối request có timestamp nhỏ hơn hoặc bằng lần trước.

### Câu 11. Nếu secret key bị lộ thì điểm yếu là gì?

Nếu `secret_key` bị lộ, attacker có thể tạo HMAC hợp lệ và giả mạo thiết bị. Khi đó server không phân biệt được đâu là thiết bị thật và đâu là attacker, vì cả hai đều có cùng `secret_key`. Giải pháp là revoke/rotate `secret_key`, block thiết bị, cấp lại key mới và bảo vệ firmware để giảm nguy cơ bị trích xuất key.

### Câu 12. Secret key được cấp phát như thế nào?

Khi admin hoặc operator đăng ký thiết bị qua API `/api/devices/register`, backend sinh `device_id` và `secret_key` ngẫu nhiên bằng `crypto.randomBytes(32).toString("hex")` — tạo ra chuỗi 64 ký tự hex. `secret_key` **chỉ được trả về một lần duy nhất** trong response đăng ký, sau đó không có endpoint nào cho phép xem lại. Người quản trị phải copy và nạp vào firmware ngay lúc đó.

### Câu 13. Nếu người dùng quên lưu secret key thì làm sao?

Do `secret_key` chỉ trả về một lần, nếu quên lưu thì nên tạo cơ chế cấp lại key mới thay vì hiển thị lại key cũ. Cách an toàn hơn là **rotate secret key**: server sinh secret mới, vô hiệu hóa secret cũ, sau đó người quản trị nạp secret mới vào firmware. Hệ thống hiện tại chưa có endpoint rotate — cần đăng ký lại thiết bị nếu mất key.

---

## 3. Kiểm soát truy cập và RBAC

### Câu 14. RBAC trong hệ thống được áp dụng ở đâu?

RBAC được áp dụng cho các API quản trị của dashboard. Người dùng đăng nhập bằng username/password, nhận JWT được set vào HttpOnly cookie. Mỗi request đến API protected phải đi qua middleware `verifyJWT` (`backend/src/middleware/verifyJWT.ts`) để xác thực JWT, sau đó qua `requireRole(...roles)` (`backend/src/middleware/rbac.ts`) để kiểm tra role. Hệ thống có ba role: `admin`, `operator` và `viewer`.

### Câu 15. Admin, operator và viewer khác nhau như thế nào?

- **Admin**: Toàn quyền — tạo/xóa user, đăng ký thiết bị, kích hoạt/khóa/xóa thiết bị, xem và xóa audit log. Không thể xóa chính mình và không thể xóa tài khoản `admin` khác.
- **Operator**: Đăng ký thiết bị, kích hoạt/khóa thiết bị, xem dữ liệu và xóa log `DATA_RECV`. Không thể xóa thiết bị hay quản lý user.
- **Viewer**: Chỉ xem — danh sách thiết bị, chi tiết thiết bị, dữ liệu cảm biến, dashboard và audit log. Không thể thực hiện bất kỳ thao tác ghi nào.

### Câu 16. Vì sao API gửi dữ liệu của thiết bị không dùng JWT?

Thiết bị IoT thường là firmware nhỏ, không phù hợp với flow đăng nhập web như user dashboard — không có browser, không lưu được cookie, không thực hiện được OAuth flow. Thay vào đó, thiết bị được xác thực bằng `device_id`, `timestamp` và `HMAC` dựa trên `secret_key` riêng của thiết bị. Cơ chế này phù hợp với tài nguyên phần cứng hạn chế và không yêu cầu session.

### Câu 17. Thiết bị inactive, active và blocked khác nhau như thế nào?

- **inactive**: Thiết bị mới đăng ký, chưa được phép gửi dữ liệu. Trạng thái mặc định khi tạo mới.
- **active**: Thiết bị hợp lệ và được phép gửi dữ liệu. `fail_count` được reset về 0 khi chuyển sang active.
- **blocked**: Thiết bị bị khóa — do admin/operator khóa thủ công, hoặc do `fail_count` đạt ngưỡng 5 lần xác thực sai. Thiết bị bị blocked bị từ chối hoàn toàn cho đến khi được mở khóa thủ công.

### Câu 18. Hệ thống xử lý thiết bị sai token/HMAC như thế nào?

Nếu gateway hoặc sensor gửi HMAC sai, backend ghi audit log (`GATEWAY_AUTH_FAIL` hoặc `SENSOR_AUTH_FAIL`) và tăng `fail_count` nếu tìm thấy thiết bị trong database. Khi `fail_count` đạt ngưỡng 5 (`BLOCK_THRESHOLD = 5`), backend chuyển trạng thái thiết bị sang `blocked`, ghi event `DEVICE_BLOCKED` vào audit log và từ chối tất cả request tiếp theo cho đến khi admin/operator mở khóa. Cơ chế này áp dụng cho cả luồng MQTT (`mqttDataService.ts`) lẫn HTTP fallback (`validateDevice.ts`).

---

## 4. Dashboard và trạng thái thiết bị

### Câu 19. Dashboard hiển thị online/offline dựa trên cơ chế nào?

Backend cập nhật `last_seen` cho cả gateway lẫn sensor mỗi khi nhận dữ liệu hợp lệ. Dashboard coi thiết bị là **online** nếu `last_seen` không null và `TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`. Ngưỡng 60 giây phù hợp với chu kỳ gửi dữ liệu 5 giây của sensor — nếu mất kết nối, sau 60 giây sẽ chuyển sang offline. Tính toán này thực hiện ở backend mỗi lần query, không lưu cột `is_online` vào database.

### Câu 20. Active và online có giống nhau không?

Không. **Active** là trạng thái quyền truy cập — thiết bị được phép gửi dữ liệu. **Online** là trạng thái kết nối được suy ra từ `last_seen` — thiết bị đang thực sự giao tiếp. Một thiết bị có thể `active` nhưng `offline` (được phép gửi nhưng hiện không kết nối), hoặc `blocked` nhưng từng online (bị khóa sau khi đã hoạt động). Cả hai trạng thái được hiển thị riêng biệt trên trang Devices của dashboard.

### Câu 21. Dashboard có thể hiển thị sai số liệu thống kê không?

Không, với codebase hiện tại. Backend trả về đúng tên field `total_gateway`, `total_sensor`, `gateway_online`, `sensor_online` và `total_data_points` (`backend/src/routes/dashboard.ts`). Frontend đọc đúng các field này qua type `DashboardStats` (`frontend/src/package/schema/api.ts`) và render bằng `stats?.total_gateway`, `stats?.gateway_online`, v.v. (`frontend/src/containers/Dashboard/index.tsx`). Tên field giữa backend và frontend khớp hoàn toàn, không có mismatch.

### Câu 22. Dashboard bảo vệ API quản trị như thế nào?

Dashboard gọi API backend bằng cookie JWT HttpOnly — trình duyệt tự gửi cookie mà JavaScript không đọc được (chống XSS). Backend dùng middleware `verifyJWT` để kiểm tra token. Các API nhạy cảm như đăng ký thiết bị, đổi trạng thái, xóa thiết bị hoặc quản lý user sẽ kiểm tra thêm role bằng `requireRole(...)`. Ngoài ra có CORS giới hạn origin frontend, Helmet cho security headers và rate limit cho login/API.

---

## 5. Database và lưu trữ

### Câu 23. Database gồm các bảng chính nào?

Database gồm 5 bảng: `users`, `devices`, `sensor_data`, `device_tokens` và `audit_log`.
- `users`: Tài khoản dashboard với role `admin/operator/viewer`, password hash bcrypt.
- `devices`: `device_id` (UNIQUE), `secret_key`, `device_type`, `status`, `fail_count`, `last_seen`, `last_ip`, `created_by`.
- `sensor_data`: Dữ liệu cảm biến với foreign key cascade cả `device_id` (sensor) lẫn `gateway_id` (gateway).
- `device_tokens`: Schema đã có nhưng chưa được sử dụng bởi bất kỳ route nào — dự phòng cho cơ chế token dài hạn.
- `audit_log`: Sự kiện bảo mật và quản trị với 7 event types.

### Câu 24. Vì sao `secret_key` đang được lưu trong bảng devices?

Backend cần `secret_key` để tính lại HMAC và so sánh với request của thiết bị — đây là yêu cầu kỹ thuật của cơ chế HMAC (không thể hash `secret_key` vì cần key gốc để tính). Trong phiên bản hiện tại, `secret_key` được lưu plain text. Khi triển khai thật, nên bảo vệ database tốt hơn, có thể mã hóa cột `secret_key` ở mức storage hoặc dùng cơ chế quản lý khóa riêng (KMS).

### Câu 25. Bảng `device_tokens` dùng để làm gì?

Bảng `device_tokens` có trong schema nhưng **chưa có route nào đọc hoặc ghi vào bảng này** trong codebase hiện tại. Bảng này được chuẩn bị cho cơ chế token có thời hạn sử dụng, revoke token hoặc rotate token — thay thế cho việc dùng `secret_key` trực tiếp. Luồng chính hiện tại vẫn dùng HMAC-SHA256 với `secret_key`.

### Câu 26. Audit log giúp ích gì trong threat model?

Audit log ghi các sự kiện: `DEVICE_REGISTER`, `DEVICE_STATUS_CHANGE`, `DEVICE_DELETE`, `DATA_RECV`, `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `DEVICE_BLOCKED`. Nhờ đó người quản trị có thể truy vết IP, user_agent, device_id và lý do lỗi khi có hành vi tấn công hoặc truy cập trái phép. Audit log được ghi không đồng bộ — lỗi ghi log không bao giờ làm crash luồng chính.

---

## 6. Threat model

### Câu 27. Hệ thống chống giả mạo thiết bị như thế nào?

Hệ thống không chỉ dựa vào `device_id` vì `device_id` có thể bị đoán hoặc bị sao chép. Mỗi request phải có HMAC hợp lệ được tạo từ `secret_key` riêng của thiết bị. Nếu attacker chỉ biết `device_id` mà không biết `secret_key` thì không tạo được HMAC hợp lệ. Ngoài ra còn có timestamp window ±300 giây chống replay, kiểm tra `device_type` chống thiết bị đóng giả sai vai trò, và auto-block sau 5 lần sai chống brute force.

### Câu 28. Hệ thống chống truy cập trái phép API dashboard như thế nào?

API dashboard yêu cầu JWT cookie hợp lệ. Các thao tác quản trị yêu cầu role phù hợp qua `requireRole(...)`. Ngoài ra backend có CORS giới hạn origin frontend, Helmet cho security headers, rate limit cho login và API, giới hạn body size 10KB và sử dụng prepared statements chống SQL injection.

### Câu 29. Rate limit có tác dụng gì?

Rate limit giúp giảm tấn công brute force và DoS cơ bản. Login bị giới hạn **10 request trong 15 phút** mỗi IP (`authLimiter`). API gửi data của thiết bị bị giới hạn **60 request mỗi phút** mỗi IP (`deviceDataLimiter`). Các API quản trị khác bị giới hạn **100 request trong 15 phút** mỗi IP (`apiLimiter`). Khi vượt ngưỡng, server trả về lỗi `TOO_MANY_REQUESTS`.

### Câu 30. Nếu attacker biết `device_id` nhưng không biết secret key thì sao?

Attacker không thể tạo HMAC hợp lệ, nên backend sẽ từ chối request với lỗi `HMAC_MISMATCH`. Nếu `device_id` tồn tại trong database, `fail_count` của thiết bị sẽ tăng sau mỗi lần sai và thiết bị có thể bị block sau 5 lần — bảo vệ thêm một lớp chống attacker thử nhiều HMAC khác nhau.

### Câu 31. Nếu attacker gửi `device_id` không tồn tại thì sao?

Backend trả về lỗi `NOT_FOUND` và ghi audit log xác thực thất bại. Tuy nhiên vì không có device trong database nên không có `fail_count` của device nào để tăng. Có thể mở rộng bằng cách thống kê theo IP hoặc theo `device_id` giả mạo để phát hiện scan/brute force.

### Câu 32. Nếu attacker lấy được firmware thì có nguy hiểm không?

Có. Firmware hiện lưu `device_id`, `secret_key`, WiFi credential và danh sách sensor trong file cấu hình (`firmware/sensor-node/include/config.h`, `firmware/gateway-node/include/config_gw.h`). Nếu attacker trích xuất firmware thành công, `secret_key` có thể bị lộ. Hướng giảm rủi ro: bật **Secure Boot và Flash Encryption** nếu phần cứng hỗ trợ, không commit secret thật vào repo, rotate key khi nghi ngờ bị lộ và hạn chế quyền của mỗi thiết bị.

### Câu 33. MQTT port 1883 có điểm yếu gì?

MQTT port 1883 là MQTT không mã hóa (plain TCP). Dữ liệu MQTT truyền trong mạng LAN có thể bị nghe lén. Nếu triển khai thật, nên dùng **MQTT over TLS** (port 8883), cấu hình username/password hoặc certificate cho broker Mosquitto, và giới hạn topic publish/subscribe theo từng thiết bị. Firmware cần chuyển từ `WiFiClient` sang `WiFiClientSecure`.

### Câu 34. Giao tiếp từ gateway lên backend có điểm yếu gì?

Gateway giao tiếp với backend theo **hai kênh khác nhau**:

1. **MQTT** (kênh chính — dữ liệu cảm biến): Gateway publish lên topic `gateway/{gw_id}/data` qua Mosquitto broker. Kênh này plain TCP, chưa có TLS.
2. **HTTP** (kổng phụ — lấy danh sách sensor): Gateway gọi `GET /api/device/sensors` để fetch danh sách sensor hợp lệ mỗi 5 phút. URL cấu hình trong `BACKEND_SENSORS_URL` dạng HTTP, chưa mã hóa.

Trong môi trường thật, cả MQTT lẫn HTTP đều cần mã hóa (MQTT TLS port 8883, HTTPS thay vì HTTP) để đảm bảo tính bảo mật và toàn vẹn dữ liệu trên đường truyền.

---

## 7. Câu hỏi bắt lỗi code/demo

### Câu 35. Nếu dashboard hiển thị thống kê bằng 0 dù đã có thiết bị thì nguyên nhân có thể là gì?

Tên field giữa backend và frontend trong codebase hiện tại đã khớp: backend trả về `total_gateway`, `total_sensor`, `gateway_online`, `sensor_online`, `total_data_points` — frontend đọc đúng các tên này. Nếu dashboard hiển thị 0, nguyên nhân có thể là: JWT cookie hết hạn hoặc không hợp lệ khiến request trả về 401, backend chưa khởi động hoặc không kết nối được database, hoặc chưa có thiết bị nào ở trạng thái `active` nên `gateway_online`/`sensor_online` đúng là 0. Cần kiểm tra Network tab trong browser DevTools để xem response thực tế từ `/api/dashboard/stats`.

### Câu 36. Nếu thêm sensor mới thì gateway có tự nhận không?

**Có.** Gateway đã có cơ chế **dynamic sensor registry** (`firmware/gateway-node/lib/sensor_registry/sensor_registry.cpp`): tự động fetch danh sách sensor từ `GET /api/device/sensors` mỗi **5 phút** (`SENSOR_REGISTRY_TTL_MS = 300000ms`). Ngoài ra, khi gặp `sensor_id` chưa có trong registry, gateway còn thực hiện **lazy refresh** — fetch ngay lập tức mà không cần đợi hết TTL.

Quy trình: đăng ký sensor mới trên dashboard → kích hoạt → gateway nhận sensor mới trong lần refresh tiếp theo (tối đa 5 phút) hoặc ngay lập tức nếu sensor đó đã publish data.

`KNOWN_SENSORS[]` trong `config_gw.h` chỉ là **fallback tĩnh** khi backend không phản hồi — không phải cơ chế chính.

### Câu 37. Hệ thống có thể xóa dữ liệu sensor khi xóa device không?

Có. Schema có foreign key `ON DELETE CASCADE` cho bảng `sensor_data` tham chiếu `devices`. Route delete device (`backend/src/routes/devices.ts`) cũng tự xóa `sensor_data` và `device_tokens` liên quan trước khi xóa device row, đảm bảo không có orphaned data. Sự kiện xóa được ghi vào `audit_log` với event `DEVICE_DELETE` kèm thông tin người thực hiện.

### Câu 38. Vì sao `secret_key` chỉ hiển thị một lần khi đăng ký thiết bị?

Để giảm nguy cơ lộ bí mật. Nếu dashboard cho xem lại `secret_key` bất kỳ lúc nào, tài khoản bị chiếm quyền có thể lấy toàn bộ key của thiết bị. Trả về một lần buộc người quản trị lưu key đúng quy trình và nếu mất thì phải cấp lại key mới — không thể lấy lại key cũ.

### Câu 39. Hệ thống đã có chống SQL injection chưa?

Có. Backend dùng query có tham số với `pool.execute(sql, [params])` và placeholder `?` cho tất cả input — username, `device_id`, id, status không được nối chuỗi trực tiếp vào SQL. Đây là prepared statements, giúp database engine phân biệt rõ câu lệnh SQL và dữ liệu người dùng, ngăn chặn SQL injection.

### Câu 40. Điểm hạn chế lớn nhất của hệ thống hiện tại là gì?

Một số hạn chế chính:
- Chưa có cơ chế rotate/revoke `secret_key` — phải đăng ký lại thiết bị nếu key bị lộ.
- Chưa chặn tuyệt đối replay trong cùng cửa sổ 300 giây (không có nonce).
- MQTT và HTTP sensor list chưa mã hóa (plain TCP/HTTP) — phù hợp LAN nội bộ, chưa đủ cho internet.
- `secret_key` lưu plain text trong database — cần bảo vệ DB tốt hoặc mã hóa at-rest.
- `device_tokens` table đã có trong schema nhưng chưa được triển khai.
- Config firmware (`config.h`, `config_gw.h`) chứa credentials thực đang được track bởi Git.
