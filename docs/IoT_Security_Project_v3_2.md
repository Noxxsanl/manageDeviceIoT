**BÀI TẬP LỚN  ·  AN TOÀN HỆ THỐNG NHÚNG VÀ IoT**

**Hệ Thống Quản Lý Thiết Bị IoT**

**& Phân Quyền Truy Cập**

*Phiên bản tài liệu: v3.2 – Kiến trúc thống nhất Gateway + Xác thực 2 cấp*

|**Thông tin chung**|**Giá trị**|
| :- | :- |
|**Tên đề tài**|Hệ thống quản lý thiết bị IoT và phân quyền truy cập|
|**Phần cứng Edge**|2 con ESP32 DOIT DevKit V1 – Sensor Node & Gateway Node|
|**Backend**|Node.js + Express + MQTT (Mosquitto)|
|**Database**|MySQL 8.0|
|**Frontend**|Next.js 14 + Tailwind CSS|
|**Cơ chế bảo mật**|HMAC-SHA256 + JWT + RBAC/ABAC + TLS|


# **MỤC LỤC**
`  `0.  Phân Tích Đề Tài & Yêu Cầu Hệ Thống

`  `1.  Tổng Quan – Luồng Hoạt Động & Kiến Trúc

`  `2.  Thiết Kế Cơ Sở Dữ Liệu MySQL & Sơ Đồ Quan Hệ

`  `3.  Kế Hoạch Triển Khai Hardware (ESP32)

`  `4.  Kế Hoạch Triển Khai Backend Server

`  `5.  Quy Trình Đăng Ký & Xác Thực Thiết Bị (Chi Tiết)

`  `6.  Kế Hoạch Triển Khai Frontend Dashboard

`  `7.  Cơ Chế Bảo Mật & Phân Quyền

`  `8.  Threat Model & Kịch Bản Tấn Công

`  `9.  Thứ Tự Triển Khai & Phân Chia Công Việc

`  `10.  Checklist Hoàn Thành



`  `**0. PHÂN TÍCH ĐỀ TÀI & YÊU CẦU HỆ THỐNG**

## **0.1. Đọc Hiểu Đề Bài**
Đề tài yêu cầu xây dựng một hệ thống IoT hoàn chỉnh gồm 3 thành phần bắt buộc (IoT Node, Gateway, Server & Database) kết nối qua MQTT hoặc HTTP, có Dashboard giám sát thời gian thực, và phải đáp ứng các yêu cầu kỹ thuật cụ thể sau:

|**Thành phần / Yêu cầu**|**Yêu cầu cụ thể**|
| :- | :- |
|**IoT Node (ESP32)**|Thu thập dữ liệu từ ít nhất 1 cảm biến (DHT22: nhiệt độ + độ ẩm). Gửi dữ liệu định kỳ về Gateway, định dạng JSON, có timestamp và device\_id. Sử dụng ESP32.|
|**Xác thực thiết bị**|Nhận dữ liệu từ IoT Node qua MQTT local, xác thực HMAC Sensor, ký HMAC của Gateway, chuyển tiếp lên Backend qua HTTPS. Triển khai trên ESP32.|
|**Kiểm soát truy cập**|Chỉ thiết bị hợp lệ được gửi dữ liệu. Có thể mở rộng với RBAC (phân vai trò sensor/gateway) hoặc ABAC (theo thuộc tính) để tăng cường bảo mật.|
|**Giám sát & Dashboard**|Hiển thị dữ liệu thời gian thực. Có biểu đồ nhiệt độ và độ ẩm (tối thiểu). Có chức năng xem dữ liệu mới nhất. Hiển thị trạng thái online/offline thiết bị.|
|**Yêu cầu kỹ thuật**||

## **0.2. Phân Tích Yêu Cầu Kỹ Thuật (Functional Requirements)**
### **FR1 – Quản lý thiết bị**
- Tạo mới thiết bị: sinh Device ID duy nhất + Secret Key ngẫu nhiên
- Xem danh sách thiết bị: tên, loại, trạng thái, lần cuối kết nối
- Chỉnh sửa thông tin: tên, vị trí, role
- Khoá / Mở khoá / Xoá thiết bị từ Dashboard
- Thu hồi quyền truy cập ngay lập tức (real-time block)
### **FR2 – Xác thực thiết bị**
- Thiết bị phải gửi: device\_id + timestamp + HMAC token + data
- Backend xác minh HMAC token của Gateway (cấp 1) và Sensor (cấp 2) trước khi lưu dữ liệu
- Tự động từ chối và ghi log khi xác thực thất bại
- Tự động block thiết bị sau N lần thất bại liên tiếp
### **FR3 – Gửi và lưu dữ liệu cảm biến**
- ESP32 đọc cảm biến (nhiệt độ, độ ẩm) định kỳ
- Dữ liệu được lưu vào MySQL với timestamp
- Dashboard hiển thị dữ liệu gần nhất và lịch sử theo biểu đồ
### **FR4 – Dashboard**
- Login admin bằng username/password
- Xem danh sách thiết bị với trạng thái online/offline
- Thêm thiết bị mới, hiển thị credentials đúng 1 lần
- Khoá/Mở khoá thiết bị bằng 1 click
- Xem nhật ký bảo mật (audit log)
## **0.3. Yêu Cầu Phi Chức Năng (Non-Functional Requirements)**

|**Loại yêu cầu**|**Yêu cầu**|**Cách đáp ứng**|
| :- | :- | :- |
|**Bảo mật**|Chống giả mạo, replay attack, brute force|HMAC + timestamp window + rate limit|
|**Tính toàn vẹn**|Dữ liệu không bị sửa đổi trên đường truyền|HMAC bảo vệ toàn bộ payload|
|**Tính sẵn sàng**|Server hoạt động ổn định, ESP32 tự reconnect|Retry logic, heartbeat, watchdog|
|**Khả năng mở rộng**|Thêm thiết bị không cần sửa code server|Thiết kế DB linh hoạt, API chuẩn REST|
|**Khả năng giám sát**|Biết ngay khi thiết bị offline hoặc bị tấn công|Heartbeat timeout + audit log + alert|
|**Triển khai được**|Chạy được trong môi trường lab|Docker Compose hoặc trực tiếp trên máy|

## **0.4. Phạm Vi Hệ Thống & Các Ràng Buộc**
*ℹ  Những gì HỆ THỐNG phải làm – trong phạm vi bài tập lớn*

- Hệ thống gồm ít nhất 2 thiết bị ESP32: 1 Sensor Node + 1 Gateway (bắt buộc, mọi trường hợp)
- Toàn bộ phải tự xây dựng từ firmware đến backend đến frontend
- Phải có cơ chế xác thực thiết bị thực sự hoạt động (không phải giả lập)
- Phải demo được các tình huống tấn công và cách hệ thống phản ứng

*⚠  Những gì KHÔNG yêu cầu: giao tiếp Internet thực (LAN/localhost là đủ), thiết bị thực tế phức tạp, scale lớn*



`  `**1. TỔNG QUAN – LUỒNG HOẠT ĐỘNG & KIẾN TRÚC**

## **1.1. Luồng Hoạt Động Tổng Quát**
Hệ thống có 3 luồng chính. Mọi trường hợp triển khai (test hay thực tế) đều bắt buộc sử dụng Gateway – Sensor Node không kết nối trực tiếp lên Backend. Thứ tự diễn ra:

### **Luồng 1 – Đăng Ký Thiết Bị (một lần duy nhất)**
`  `┌─────────────┐    ①Tạo thiết bị     ┌─────────────┐

`  `│   ADMIN     │ ─────────────────────► │   BACKEND   │

`  `│  Dashboard  │                        │   Server    │

`  `│  (Next.js)  │ ◄───────────────────── │ (Node.js)   │

`  `└─────────────┘  ②Trả device\_id        └──────┬──────┘

`         `│             + secret\_key              │

`         `│                                 ③ Lưu vào DB

`         `│ ④ Admin điền credentials             │

`         `▼    vào firmware                ┌──────▼──────┐

`  `┌─────────────┐                         │    MySQL    │

`  `│   ESP32     │                         │  Database   │

`  `│  (firmware) │                         └─────────────┘

`  `└─────────────┘

- Admin mở Dashboard → vào trang /devices/new
- Điền tên thiết bị, chọn loại (sensor/gateway), vị trí
- Backend tự động sinh: Device ID (ESP32-SN-XXXXXXXX) + Secret Key (64 hex chars)
- Dashboard hiển thị credentials → Admin copy → điền vào file config.h của firmware
- Nạp firmware vào ESP32 bằng Arduino IDE

### **Luồng 2 – Kết Nối, Xác Thực & Gửi Dữ Liệu Qua Gateway (mọi trường hợp)**
`  `┌─────────────┐   ①MQTT local    ┌─────────────┐   ③MQTT Publish ┌─────────────┐

`  `│   ESP32     │ ────────────────► │   ESP32     │ ─────────────► │   BACKEND   │

`  `│ Sensor Node │  {sn\_id,         │   Gateway   │  {gw\_id,       │   Server    │

`  `│             │   sn\_timestamp,  │             │   gw\_timestamp,│             │

`  `│ ①Tính HMAC  │   sn\_hmac,       │ ②Xác thực   │   gw\_hmac,     │ ④Xác thực  │

`  `│   (SN key)  │   data}          │   HMAC(SN)  │   sensor\_      │   GW & SN  │

`  `└─────────────┘                  └─────────────┘   payload}     │             │

`                                                                   `│ ⑤Lưu data  │

`  `◄────────── ⑥ Response (200 OK / 401 / 403) ─────────────────── │   sn+gw\_id  │

`                                                                   `└─────────────┘



`  `Nhiều Sensor Node ──► 1 Gateway ──► 1 Backend Server (mọi trường hợp triển khai)

- Sensor Node tính HMAC: token = HMAC-SHA256(SN\_SECRET, sn\_id:sn\_timestamp), sau đó publish lên MQTT topic: local/sensors/[SN\_ID]/data
- Gateway subscribe MQTT topic local/sensors/+/data (wildcard) để nhận dữ liệu từ mọi Sensor Node
- Gateway xác thực HMAC của Sensor Node bằng danh sách sensor credentials được cấu hình sẵn (hoặc truy vấn Backend lần đầu). Nếu HMAC sai → bỏ qua, ghi log
- Nếu Sensor hợp lệ: Gateway tính HMAC của chính mình: HMAC(GW\_SECRET, gw\_id:gw\_timestamp) rồi đóng gói toàn bộ payload gốc của Sensor
- Gateway **MQTT publish** lên topic `gateway/<GW_DEVICE_ID>/data`: { gateway\_id, gw\_timestamp, gw\_hmac, gateway\_ip, sensor\_payload: { sensor\_id, sn\_timestamp, sn\_hmac, sensor\_ip, data: {temp, hum} } }. Backend subscribe `gateway/+/data` qua `mqttDataService.ts`.
- Backend xác thực HMAC của Gateway trước (cấp 1): tra cứu GW secret\_key → tính lại HMAC → timingSafeEqual(). Sai → 401, ghi audit\_log GATEWAY\_AUTH\_FAIL
- Backend xác thực HMAC của Sensor Node tiếp theo (cấp 2): tra cứu SN secret\_key → tính lại HMAC → timingSafeEqual(). Sai → 401, ghi audit\_log SENSOR\_AUTH\_FAIL
- Nếu cả hai hợp lệ: INSERT sensor\_data (kèm gateway\_id), UPDATE last\_seen cho cả SN và GW, fail\_count về 0 → trả 200 OK
- Nếu xác thực thất bại: ghi audit\_log AUTH\_FAIL, tăng fail\_count → 401; tự block thiết bị nếu fail\_count ≥ 5 lần liên tiếp

### **Luồng 3 – Dashboard Giám Sát Real-Time**
`  `┌─────────────┐   WebSocket / SWR polling   ┌─────────────┐

`  `│  DASHBOARD  │ ◄─────────────────────────── │   BACKEND   │

`  `│  (Next.js)  │   { devices: [...],          │   Server    │

`  `│             │     online: [id1, id2],      │             │

`  `│  Hiển thị:  │     latestData: {...} }      │  Heartbeat  │

`  `│  - Danh sách│                              │  monitor    │

`  `│  - Online / │ ─────────────────────────── ► │             │

`  `│    Offline  │   POST /api/devices/:id      │  Cập nhật   │

`  `│  - Lock /   │        /status               │  status DB  │

`  `│    Unlock   │   (khoá/mở khoá thiết bị)    │             │

`  `└─────────────┘                              └─────────────┘

- Dashboard dùng SWR poll API mỗi 10 giây; hiển thị riêng danh sách Gateway và danh sách Sensor với trạng thái online/offline của từng loại
- Thiết bị (Gateway hoặc Sensor) được coi là Online nếu last\_seen < 60 giây trước
- Admin khoá Gateway → server từ chối mọi request từ gateway đó (kể cả data của sensor gửi qua nó); Admin khoá Sensor → gateway tiếp tục hoạt động nhưng không forward data của sensor bị khoá

## **1.2. Kiến Trúc Hệ Thống Tổng Thể**
`                    `╔══════════════════════════════════════════╗

`                    `║          CLOUD / LOCAL SERVER            ║

`  `┌──────────┐      ║  ┌──────────┐   ┌──────────────────┐   ║

`  `│  ESP32   │      ║  │ MOSQUITTO│   │  NODE.JS BACKEND │   ║

`  `│ Gateway  │─MQTT►║  │  BROKER  │──►│  - REST API      │   ║

`  `│  Node    │      ║  │  :1883   │   │  - MQTT Handler  │   ║

`  `└────▲─────┘      ║  │  :8883   │   │  - HMAC Service  │   ║

`       `│MQTT local  ║  └──────────┘   │  - WebSocket     │   ║

`  `┌────┴─────┐      ║                 └────────┬─────────┘   ║

`  `│  ESP32   │      ║  (Sensors gửi MQTT       │              ║

`  `│ Sensor 1 │      ║                     ┌────▼────────┐    ║

`  `└──────────┘      ║                     │   MYSQL 8   │    ║

`  `┌──────────┐      ║                     │  - devices  │    ║

`  `│  ESP32   │      ║                     │  - sensor   │    ║

`  `│ Sensor 2 │      ║                     │  - audit    │    ║

`  `└──────────┘      ║                     └─────────────┘    ║

`                    `╚══════════════╤═══════════════════════════╝

`                                   `│ REST API / WebSocket

`                    `┌──────────────▼──────────────┐

`                    `│      NEXT.JS DASHBOARD       │

`                    `│   - Device List & Status     │

`                    `│   - Register Device          │

`                    `│   - Lock / Unlock / Delete   │

`                    `│   - Audit Log Viewer         │

`                    `└─────────────────────────────┘

## **1.3. Kiến Trúc & Công Nghệ Sử Dụng**

|**Lớp**|**Thành phần**|**Công nghệ**|**Lý do chọn**|
| :- | :- | :- | :- |
|**Edge Device**|Sensor Node|ESP32 + Arduino C++|WiFi tích hợp, HMAC built-in (mbedTLS), giá ~$5|
|**Edge Device**|Gateway Node|ESP32 + Arduino C++|Đồng nhất phần cứng, dễ quản lý và so sánh|
|**Message Broker**|MQTT Broker|Mosquitto 2.x|Nhẹ, open source, hỗ trợ TLS, chuẩn IoT|
|**Backend**|REST API Server|Node.js 20 + Express 4|Async I/O phù hợp IoT, npm ecosystem phong phú|
|**Database**|Relational DB|MySQL 8.0|Phổ biến, JSON column support, ổn định|
|**Frontend**|Web Dashboard|Next.js 16 + Tailwind CSS|SSR/CSR linh hoạt, App Router, UI nhanh đẹp|
|**Real-time**|Live Updates|SWR polling (10s interval) — WebSocket chưa triển khai|Cập nhật trạng thái thiết bị không cần reload|
|**Bảo mật**|Auth & Crypto|HMAC-SHA256 + JWT + bcrypt|Xác thực thiết bị + admin, đủ chuẩn cho lab|

## **1.4. Chi Tiết Các Package Cần Cài**
### **Backend (Node.js)**

|**Package**|**Version**|**Mục đích**|
| :- | :- | :- |
|express|4\.x|HTTP server, routing, middleware|
|mysql2|3\.x|MySQL driver – hỗ trợ async/await, prepared statements|
|jsonwebtoken|9\.x|Cấp và xác minh JWT cho admin session|
|bcrypt|5\.x|Hash mật khẩu admin (cost factor 12)|
|crypto (built-in)|Node built-in|HMAC-SHA256, timingSafeEqual|
|mqtt|5\.x|MQTT client – kết nối Mosquitto, subscribe topics|
|helmet|7\.x|HTTP security headers (XSS, CSRF, clickjacking protection)|
|express-rate-limit|7\.x|Rate limiting – chống brute force|
|ws|8\.x|WebSocket server – đẩy cập nhật real-time cho dashboard|
|dotenv|16\.x|Load biến môi trường từ .env|
|uuid|9\.x|Sinh UUID cho device ID và DB records|
|cors|2\.x|Cross-Origin Resource Sharing cho Next.js frontend|

### **Frontend (Next.js)**

|**Package**|**Version**|**Mục đích**|
| :- | :- | :- |
|next|14\.x|React framework với App Router, SSR/CSR|
|tailwindcss|3\.x|Utility-first CSS framework|
|swr|2\.x|Data fetching với auto-refresh (polling mỗi 10s)|
|axios|1\.x|HTTP client, interceptor tự thêm JWT|
|recharts|2\.x|Biểu đồ nhiệt độ/độ ẩm theo thời gian|
|lucide-react|0\.x|Icon library (Wifi, Lock, Plus, ...)|
|socket.io-client|4\.x|Nhận cập nhật real-time từ backend|

### **Hardware & Firmware (ESP32)**

|**Thư viện Arduino**|**Mục đích**|
| :- | :- |
|WiFi.h (built-in ESP32)|Kết nối WiFi, quản lý trạng thái kết nối|
|HTTPClient.h (built-in)|Gửi HTTP POST lên backend server|
|PubSubClient|MQTT client – publish/subscribe messages|
|ArduinoJson|Tạo và parse JSON payload|
|mbedtls/md.h (built-in)|HMAC-SHA256 tích hợp sẵn trong ESP-IDF|
|time.h (built-in)|Đồng bộ thời gian NTP, lấy Unix timestamp|
|DHT sensor library|Đọc dữ liệu từ cảm biến DHT22 (temp/humidity)|



`  `**2. THIẾT KẾ CƠ SỞ DỮ LIỆU MYSQL & SƠ ĐỒ QUAN HỆ**

## **2.1. Danh Sách Bảng & Mục Đích**

|**Tên bảng**|**Kiểu dữ liệu chính**|**Mục đích**|
| :- | :- | :- |
|**users**|id, username, password, role|Lưu tài khoản admin/operator/viewer đăng nhập Dashboard|
|**devices**|device\_id, secret\_key, status, role|Registry của toàn bộ thiết bị IoT đã đăng ký|
|**sensor\_data**|device\_id, gateway\_id, payload JSON, received\_at|Lưu dữ liệu cảm biến từ Sensor Node, kèm gateway\_id để biết dữ liệu đến qua Gateway nào|
|**device\_tokens**|device\_id, token\_hash, expires\_at|Quản lý JWT session token của thiết bị (revocation list)|
|**audit\_log**|event\_type, device\_id, ip, details|Nhật ký toàn bộ sự kiện bảo mật – bắt buộc cho báo cáo|

## **2.2. Sơ Đồ Quan Hệ Thực Thể (ERD)**
*ℹ  Sơ đồ thể hiện quan hệ giữa các bảng trong MySQL*

`  `┌───────────────────┐         ┌───────────────────────────────────┐

`  `│       users       │         │             devices               │

`  `├───────────────────┤         ├───────────────────────────────────┤

`  `│ PK  id (CHAR 36)  │ 1     N │ PK  id          (CHAR 36)        │

`  `│     username      │◄────────│     device\_id   (VARCHAR 64) UQ  │

`  `│     password      │created  │     device\_name (VARCHAR 100)    │

`  `│     role          │  \_by    │     device\_type (ENUM)           │

`  `│     created\_at    │         │     secret\_key  (VARCHAR 255)    │

`  `│     last\_login    │         │     status      (ENUM)           │

`  `└───────────────────┘         │     location    (VARCHAR 100)    │

`                                `│     fail\_count  (INT)            │

`                                `│     last\_seen   (DATETIME)       │

`                                `│ FK  created\_by → users.id        │

`                                `└──────────────┬────────────────────┘

`                                               `│

`                   `┌───────────────────────────┼─────────────────────┐

`                   `│ 1:N                       │ 1:N                 │ 1:N

`                   `▼                           ▼                     ▼

`  `┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐

`  `│     sensor\_data      │  │    device\_tokens     │  │     audit\_log        │

`  `├──────────────────────┤  ├──────────────────────┤  ├──────────────────────┤

`  `│PK id (BIGINT AI)     │  │PK id (BIGINT AI)     │  │PK id (BIGINT AI)     │

`  `│FK device\_id ─────────│  │FK device\_id ─────────│  │   event\_type         │

`  `│   payload (JSON)     │  │   token\_hash         │  │FK device\_id ─────────│

`  `│   received\_at        │  │   expires\_at         │  │   ip\_address         │

`  `└──────────────────────┘  │   revoked (BOOL)     │  │   user\_agent         │

`                            `└──────────────────────┘  │   details (JSON)     │

`                                                      `│   created\_at         │

`                                                      `└──────────────────────┘

## **2.3. Quan Hệ Giữa Các Bảng**

|**Quan hệ**|**Kiểu**|**Ý nghĩa**|
| :- | :- | :- |
|users → devices|1 : N  (created\_by)|1 admin có thể tạo nhiều thiết bị. Khi xóa user không xóa thiết bị (SET NULL)|
|devices → sensor\_data|1 : N|1 thiết bị có nhiều bản ghi dữ liệu. Xóa thiết bị → xóa cascade toàn bộ data|
|devices → device\_tokens|1 : N|1 thiết bị có thể có nhiều session token (lịch sử). Xóa thiết bị → xóa cascade|
|devices → audit\_log|1 : N  (nullable)|Mọi sự kiện liên quan thiết bị đều được ghi. device\_id có thể NULL nếu IP lạ|

## **2.4. Chiến Lược Index & Tối Ưu**

|**Bảng**|**Index**|**Lý do**|
| :- | :- | :- |
|devices|INDEX(device\_id)|Tra cứu theo device\_id là thao tác thường xuyên nhất (mỗi request)|
|devices|INDEX(status)|Filter thiết bị active/blocked khi xác thực|
|sensor\_data|INDEX(device\_id, received\_at DESC)|Composite index cho query "data của device X gần nhất"|
|audit\_log|INDEX(event\_type, created\_at DESC)|Dashboard filter log theo loại sự kiện và thời gian|
|audit\_log|INDEX(device\_id, created\_at DESC)|Xem lịch sử sự kiện của 1 thiết bị cụ thể|

## **2.5. Các Giá Trị ENUM Quan Trọng**

|**Bảng.Cột**|**Các giá trị**|**Giải thích**|
| :- | :- | :- |
|users.role|admin | operator | viewer|admin: full access; operator: đọc+điều khiển; viewer: chỉ đọc|
|devices.device\_type|sensor | gateway|Xác định loại thiết bị, ảnh hưởng đến RBAC|
|devices.status|inactive | active | blocked|inactive: chưa kết nối lần đầu; active: hoạt động; blocked: bị khoá|
|audit\_log.event\_type|AUTH\_SUCCESS | AUTH\_FAIL | AUTH\_BLOCKED | DATA\_RECV | DEVICE\_REGISTER | DEVICE\_BLOCKED | TOKEN\_REVOKED|Phân loại sự kiện để filter và alert|



`  `**3. KẾ HOẠCH TRIỂN KHAI HARDWARE (ESP32)**

## **3.1. Danh Sách Linh Kiện Cần Chuẩn Bị**

|**Linh kiện**|**Số lượng**|**Đơn giá (~)**|**Ghi chú**|
| :- | :-: | :-: | :- |
|ESP32 DevKit v1 (38-pin)|2|~100,000 đ|1 cho Sensor Node, 1 cho Gateway Node|
|Cảm biến DHT22|1|~40,000 đ|Đo nhiệt độ (-40~80°C) và độ ẩm (0~100%)|
|Điện trở 10KΩ|1|~500 đ|Pull-up cho chân DATA của DHT22|
|LED đỏ|2|~500 đ|Báo hiệu trạng thái (gửi OK, lỗi)|
|LED xanh lá|2|~500 đ|Báo WiFi connected|
|Điện trở 220Ω|4|~500 đ|Hạn dòng cho LED|
|Breadboard mini|2|~20,000 đ|Lắp mạch thử nghiệm không cần hàn|
|Dây jumper F-M|1 bộ|~15,000 đ|Đấu nối linh kiện|
|Cáp USB micro/type-C|2|~20,000 đ|Nạp code và cấp nguồn ESP32|

## **3.2. Sơ Đồ Đấu Dây ESP32 Sensor Node**
Kết nối cảm biến DHT22 với ESP32:

`                    `┌─────────────────┐

`   `DHT22            │    ESP32        │

`  `┌──────┐          │  DevKit v1      │

`  `│ VCC  │──────────│ 3.3V           │

`  `│      │          │                │

`  `│ DATA │────┬─────│ GPIO 4         │

`  `│      │    │     │                │

`  `│      │   10KΩ   │ 3.3V ──┤       │  (resistor lên 3.3V)

`  `│      │    │     │                │

`  `│ GND  │────┴─────│ GND            │

`  `└──────┘          │                │

`                    `│ GPIO 2 ─── 220Ω ─── LED đỏ ─── GND  │

`                    `│ GPIO 0 ─── 220Ω ─── LED xanh ─ GND  │

`                    `└─────────────────┘



`  `Chú thích:

`  `- VCC DHT22: 3.3V (KHÔNG dùng 5V – có thể cháy ESP32)

`  `- Điện trở 10KΩ: pull-up từ DATA lên 3.3V (bắt buộc)

`  `- LED đỏ (GPIO 2): nháy khi gửi data thành công

`  `- LED xanh (GPIO 0): sáng liên tục khi WiFi connected

## **3.3. Sơ Đồ Đấu Dây ESP32 Gateway Node**
Gateway không cần cảm biến bên ngoài, chỉ cần ESP32 và LED:

`                    `┌─────────────────┐

`                    `│    ESP32        │

`                    `│  DevKit v1      │

`                    `│  (Gateway)      │

`                    `│                │

`                    `│ GPIO 2 ─── 220Ω ─── LED đỏ   ─── GND │

`                    `│           (nháy khi forward thành công)│

`                    `│                │

`                    `│ GPIO 0 ─── 220Ω ─── LED xanh ─── GND │

`                    `│           (sáng khi MQTT connected)    │

`                    `│                │

`                    `│ [Không cần     │

`                    `│  linh kiện     │

`                    `│  bên ngoài]    │

`                    `└─────────────────┘



`  `Gateway hoạt động hoàn toàn bằng WiFi và MQTT:

`  `- Subscribe MQTT topic local/sensors/+/data

`  `- Forward từng message lên Cloud Backend qua HTTP

## **3.4. Cài Đặt Arduino IDE & ESP32 Board**

|**#**|**Bước**|**Chi tiết thực hiện**|
| :-: | :- | :- |
|**1**|Tải Arduino IDE 2.x|Truy cập https://www.arduino.cc/en/software → tải bản 2.x cho Windows/Mac/Linux|
|**2**|Thêm ESP32 Board URL|File → Preferences → Additional Boards Manager URLs → dán: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package\_esp32\_index.json|
|**3**|Cài ESP32 Board|Tools → Board Manager → tìm 'esp32 by Espressif Systems' → Install v2.x.x (chờ ~5 phút)|
|**4**|Cài thư viện DHT22|Tools → Manage Libraries → tìm 'DHT sensor library by Adafruit' → Install (chọn Install All khi hỏi dependencies)|
|**5**|Cài ArduinoJson|Tools → Manage Libraries → tìm 'ArduinoJson by Benoit Blanchon' → Install v7.x|
|**6**|Cài PubSubClient|Tools → Manage Libraries → tìm 'PubSubClient by Nick O'Leary' → Install|
|**7**|Chọn Board|Tools → Board → ESP32 Arduino → ESP32 Dev Module|
|**8**|Cấu hình Upload|Upload Speed: 921600 | Flash Size: 4MB(1MB APP) | Partition: Default|
|**9**|Test nạp code|Kết nối USB → Tools → Port → chọn COM(X) → File → Examples → Basics → Blink → Upload. LED trên board phải nhấp nháy.|

## **3.5. Cấu Trúc Firmware Cần Xây Dựng**
### **Sensor Node – Các module cần viết:**

|**Module / File**|**Việc cần làm**|
| :- | :- |
|config.h|Khai báo DEVICE\_ID, SECRET\_KEY, WIFI credentials, SERVER\_URL, GPIO pins, SEND\_INTERVAL (đặt 5000ms – gửi mỗi 5 giây, đáp ứng yêu cầu 1–10 giây)|
|hmac.ino (hoặc hmac.cpp)|Hàm computeHMAC(key, message) dùng mbedtls\_md\_hmac. Trả về hex string 64 ký tự|
|wifi\_manager.ino|Kết nối WiFi, tự động reconnect, báo LED khi connected/disconnected|
|ntp\_sync.ino|Đồng bộ NTP với pool.ntp.org, configTime(7\*3600, 0, ...), hàm getCurrentTimestamp()|
|sensor\_reader.ino|Khởi tạo DHT22, hàm readSensor() trả về struct {float temp, float humidity}|
|http\_sender.ino|Hàm sendData(temp, hum): build JSON payload → POST → xử lý response code|
|main.ino (setup + loop)|Khởi tạo tất cả module, vòng lặp: đọc sensor → gửi data → delay(SEND\_INTERVAL)|

### **Gateway Node – Các module cần viết:**

|**Module / File**|**Việc cần làm**|
| :- | :- |
|config\_gw.h|GW\_DEVICE\_ID, GW\_SECRET\_KEY, MQTT host/port/credentials, cloud server URL|
|mqtt\_client.ino|Kết nối MQTT broker, subscribe topic local/sensors/+/data, callback xử lý message nhận|
|forwarder.ino|Nhận payload từ sensor → xác thực HMAC Sensor (dùng sensor credentials đã cấu hình) → nếu hợp lệ: ký HMAC GW → đóng gói {gw\_id, gw\_hmac, sensor\_payload} → POST lên Backend|
|main\_gw.ino|Setup WiFi + NTP + MQTT, vòng lặp: mqttClient.loop() (không delay – cần xử lý liên tục)|



`  `**4. KẾ HOẠCH TRIỂN KHAI BACKEND SERVER**

## **4.1. Cấu Trúc Thư Mục Backend**
`  `iot-backend/

`  `├── src/

`  `│   ├── config/

`  `│   │   ├── db.js           # MySQL connection pool (mysql2/promise)

`  `│   │   ├── mqtt.js         # Kết nối Mosquitto broker

`  `│   │   └── env.js          # Validate biến môi trường khi khởi động

`  `│   │

`  `│   ├── middleware/

`  `│   │   ├── validateDevice.js   # HMAC verification middleware

`  `│   │   ├── verifyJWT.js        # JWT auth cho admin API

`  `│   │   ├── rbac.js             # Role check middleware

`  `│   │   └── rateLimiter.js      # Rate limiting per endpoint

`  `│   │

`  `│   ├── routes/

`  `│   │   ├── auth.js         # POST /api/auth/login (admin)

`  `│   │   ├── devices.js      # CRUD /api/devices (admin)

`  `│   │   ├── deviceAuth.js   # POST /api/device/auth (ESP32)

`  `│   │   ├── data.js         # POST /api/device/data (ESP32)

`  `│   │   └── dashboard.js    # GET /api/dashboard/\* (Next.js)

`  `│   │

`  `│   ├── services/

`  `│   │   ├── hmacService.js      # Core HMAC logic

`  `│   │   ├── deviceStatus.js     # Heartbeat & online/offline

`  `│   │   ├── mqttHandler.js      # Subscribe & process MQTT

`  `│   │   └── auditLogger.js      # Ghi audit log

`  `│   │

`  `│   └── app.js              # Khởi tạo Express, mount routes

`  `│

`  `├── .env                    # Biến môi trường (KHÔNG commit git)

`  `├── .env.example            # Template cho .env

`  `└── package.json

## **4.2. Danh Sách API Endpoints Cần Xây Dựng**

|**Method**|**Endpoint**|**Auth cần**|**Mô tả công việc cần làm**|
| :- | :- | :- | :- |
|**POST**|/api/auth/login|Không|Nhận username/password → bcrypt compare → trả JWT|
|**POST**|/api/devices/register|JWT admin|Sinh device\_id + secret\_key → lưu MySQL → trả credentials|
|**GET**|/api/devices|JWT admin|Lấy danh sách devices từ MySQL, kèm online status|
|**GET**|/api/devices/:id|JWT admin|Chi tiết 1 thiết bị + dữ liệu gần nhất|
|**PATCH**|/api/devices/:id/status|JWT admin|Đổi status (active/blocked) → cập nhật MySQL ngay lập tức|
|**DELETE**|/api/devices/:id|JWT admin|Xoá thiết bị và toàn bộ dữ liệu liên quan (cascade)|
|**POST**|/api/device/data|HMAC token|Nhận data từ Gateway (kèm sensor payload), xác thực HMAC 2 cấp (Gateway + Sensor), lưu sensor\_data|
|**GET**|/api/devices/:id/data|JWT admin|Lịch sử dữ liệu cảm biến, có phân trang; kèm gateway\_id cho từng record|
|**GET**|/api/dashboard/stats|JWT admin|Tổng số Gateway, tổng số Sensor, online count (riêng cho GW và SN), dữ liệu gần nhất|
|**GET**|/api/audit-log|JWT admin|Nhật ký bảo mật, filter theo event\_type và device|

## **4.3. Các Việc Cần Làm Khi Xây Dựng Backend**

|**#**|**Công việc**|**Chi tiết**|
| :-: | :- | :- |
|**1**|Thiết lập project|npm init, cài dependencies, tạo cấu trúc thư mục, .gitignore|
|**2**|Kết nối MySQL|Viết src/config/db.js với connection pool, test kết nối khi khởi động|
|**3**|Viết HMAC service|Hàm verifyGatewayHMAC() và verifyDeviceHMAC(): lookup DB → check timestamp → tính HMAC → timingSafeEqual → cập nhật fail\_count cho từng thiết bị|
|**4**|Middleware xác thực|validateDevice.js xác thực 2 cấp: (1) Gateway HMAC, (2) Sensor HMAC; trả 401/403 với error code rõ ràng (GATEWAY\_AUTH\_FAIL / SENSOR\_AUTH\_FAIL); ghi audit\_log|
|**5**|Route đăng ký thiết bị|POST /api/devices/register: sinh UUID, random secret, INSERT MySQL, trả credentials|
|**6**|Route nhận data|POST /api/device/data: xác thực HMAC Gateway (cấp 1) → xác thực HMAC Sensor (cấp 2) → kiểm RBAC → INSERT sensor\_data (kèm gateway\_id) → cập nhật last\_seen cho cả GW và SN|
|**7**|Cấu hình MQTT|Kết nối Mosquitto, subscribe devices/#, xử lý message trong mqttHandler.js|
|**8**|Admin auth|Route login: bcrypt.compare → ký JWT → set httpOnly cookie|
|**9**|Dashboard API|GET /stats, GET /devices (kèm online status tính từ last\_seen), GET /audit-log|
|**10**|Security hardening|Thêm helmet, rate limiter, input validation, CORS config đúng origin|
|**11**|Test toàn bộ API|Dùng Postman collection, test từng endpoint, đặc biệt test các trường hợp lỗi|



`  `**5. QUY TRÌNH ĐĂNG KÝ & XÁC THỰC THIẾT BỊ (CHI TIẾT)**

## **5.1. Quy Trình Đăng Ký Thiết Bị Mới – Từng Bước**
Luồng hoàn chỉnh từ khi Admin quyết định thêm thiết bị đến khi ESP32 gửi được dữ liệu:

|**Bước**|**Ai làm**|**Hành động cụ thể**|**Kết quả & Kiểm tra**|
| :-: | :- | :- | :- |
|**1**|Admin|Đăng nhập Dashboard, vào menu Devices → click nút 'Thêm thiết bị'|Form đăng ký xuất hiện|
|**2**|Admin|Điền: Tên thiết bị (VD: 'Sensor Phòng Lab 1'), Loại (sensor), Vị trí (Room 101)|Form hợp lệ, nút Submit active|
|**3**|Admin|Click Submit → POST /api/devices/register|Request gửi lên backend|
|**4**|Backend|Sinh Device ID: ESP32-SN-[8 hex ngẫu nhiên] = ESP32-SN-A1B2C3D4|ID unique, không trùng với device nào|
|**5**|Backend|Sinh Secret Key: crypto.randomBytes(32).toString('hex') = 64 ký tự hex|Key có độ entropy 256-bit|
|**6**|Backend|INSERT INTO devices: status='inactive', lưu plain secret\_key (hoặc mã hóa AES trong production)|Record trong MySQL, fail\_count=0|
|**7**|Backend|Ghi audit\_log với event\_type='DEVICE\_REGISTER'|Log có thể xem trong trang Audit|
|**8**|Dashboard|Hiển thị Modal: 'Lưu credentials – Chỉ hiện 1 lần!'  Nội dung: Device ID + Secret Key + nút Copy|Admin thấy credentials đầy đủ|
|**9**|Admin|Copy Device ID và Secret Key vào clipboard → lưu an toàn (notepad, password manager)|Credentials được lưu trước khi đóng modal|
|**10**|Admin|Click 'Tôi đã lưu – Đóng' → Dashboard không còn hiển thị Secret Key nữa|Modal đóng, thiết bị xuất hiện trong list với status='inactive'|
|**11**|Admin / Dev|Mở file config.h trong project firmware ESP32, điền đúng DEVICE\_ID và SECRET\_KEY|File config.h được cập nhật|
|**12**|Admin / Dev|Compile firmware trong Arduino IDE (Ctrl+R) → kiểm tra không có lỗi|Compile thành công, file .bin được tạo|
|**13**|Admin / Dev|Kết nối ESP32 qua USB → chọn đúng COM port → Upload (Ctrl+U)|'Done uploading' xuất hiện|
|**14**|ESP32 tự động|Khởi động: kết nối WiFi → đồng bộ NTP → gửi data lần đầu|Serial Monitor hiện [HTTP] Response 200|
|**15**|Backend tự động|Nhận data lần đầu từ device → cập nhật status='active', last\_seen=NOW()|Dashboard đổi status → Active, icon Online|

## **5.2. Quy Trình Xác Thực 2 Cấp – Sensor → Gateway → Backend**

|**Bước**|**Xử lý tại**|**Thao tác**|**Nếu thất bại → xử lý**|
| :-: | :- | :- | :- |
|**1**|ESP32|[Sensor→GW] Sensor Node gọi time() lấy NTP timestamp; Gateway cũng sync NTP riêng|Nếu NTP chưa sync → dừng, chờ sync|
|**2**|ESP32|[Sensor] Tính message = SN\_DEVICE\_ID + ':' + sn\_timestamp|–|
|**3**|ESP32|[Sensor] Tính sn\_hmac = HMAC-SHA256(SN\_SECRET\_KEY, message) → hex 64 ký tự|–|
|**4**|ESP32|[Sensor] Build payload: {sensor\_id, sn\_timestamp, sn\_hmac, data:{temperature, humidity}} → MQTT Publish lên topic local/sensors/[SN\_ID]/data|–|
|**5**|ESP32|[Gateway] Subscribe nhận MQTT message; xác thực sn\_hmac bằng SN credentials cấu hình sẵn; nếu hợp lệ: tính gw\_hmac = HMAC-SHA256(GW\_SECRET, gw\_id:gw\_timestamp)|HMAC Sensor sai → Gateway ghi log, bỏ qua message; không forward lên Backend|
|**6**|Server|[Gateway→Backend] Gateway POST /api/device/data: {gateway\_id, gw\_timestamp, gw\_hmac, sensor\_payload:{sensor\_id, sn\_timestamp, sn\_hmac, data}}; Backend parse JSON, kiểm tra đủ fields cả 2 cấp|Thiếu field → 400 Bad Request|
|**7**|Server|[Backend] Xác thực Gateway (cấp 1): SELECT \* FROM devices WHERE device\_id=gateway\_id AND status='active' AND device\_type='gateway'; tính lại HMAC(GW\_secret, gw\_id:gw\_timestamp) → timingSafeEqual()|Gateway không tồn tại / bị block / HMAC sai → 401 GATEWAY\_AUTH\_FAIL; ghi audit\_log; tăng GW fail\_count|
|**8**|Server|[Backend] Xác thực Sensor (cấp 2): SELECT \* FROM devices WHERE device\_id=sensor\_id AND status='active' AND device\_type='sensor'; tính lại HMAC(SN\_secret, sn\_id:sn\_timestamp) → timingSafeEqual()|Sensor không tồn tại / bị block / HMAC sai → 401 SENSOR\_AUTH\_FAIL; ghi audit\_log; tăng SN fail\_count|
|**9**|Server|[Backend] Kiểm tra timestamp window: |NOW() - sn\_timestamp| ≤ 300 giây và |NOW() - gw\_timestamp| ≤ 300 giây|–|
|**10**|Server|[Backend] Kiểm tra RBAC: device\_type của gateway\_id phải là 'gateway'; device\_type của sensor\_id phải là 'sensor'|DB error → 500 Internal (không expose chi tiết lỗi); ghi audit\_log|
|**11**|Server|[Backend] INSERT sensor\_data: {sensor\_id, gateway\_id, payload JSON, received\_at}; UPDATE devices.last\_seen=NOW() cho cả SN và GW; reset fail\_count=0 cho cả hai|DB error → 500 Internal (không expose chi tiết lỗi)|
|**12**|Server|INSERT sensor\_data (kèm gateway\_id), UPDATE last\_seen=NOW() cho cả SN và GW, fail\_count=0 cho cả hai|DB error → 500 (không expose chi tiết)|
|**13**|Server|INSERT audit\_log: event\_type='DATA\_RECV', sensor\_id, gateway\_id, ip, gw\_timestamp|–|
|**14**|Server|Trả về 200 {success: true, sensor\_id, gateway\_id, received\_at: ISO string} → Gateway nhận OK; LED nháy; SN nhận tín hiệu qua MQTT ack (tuỳ chọn)|–|
|**15**|ESP32|Nhận 200 → nháy LED → delay(SEND\_INTERVAL) → lặp lại từ bước 1|Nhận 4xx/5xx → LED đỏ sáng, ghi Serial log, thử lại|



`  `**6. KẾ HOẠCH TRIỂN KHAI FRONTEND DASHBOARD**

## **6.1. Cấu Trúc Trang Cần Xây Dựng**

|**Trang (Route)**|**Quyền truy cập**|**Các việc cần làm**|
| :- | :- | :- |
|**/login**|Public|Form username/password → POST /api/auth/login → lưu JWT → redirect về /|
|**/ (Dashboard)**|JWT required|Cards: tổng Gateway, tổng Sensor, đang online (Gateway + Sensor riêng), total data points. Biểu đồ dữ liệu gần nhất theo từng Sensor.|
|**/devices**|JWT required|Bảng danh sách tất cả thiết bị (Gateway + Sensor): Device ID, Tên, Loại (gateway/sensor), Gateway liên kết, Status badge, Online icon, nút Lock/Unlock/Delete|
|**/devices/new**|admin / operator|Form đăng ký → gọi API → hiển thị Modal credentials → đóng → redirect /devices|
|**/devices/[id]**|JWT required|Chi tiết: thông tin thiết bị, loại (gateway/sensor), nếu là sensor: hiển thị Gateway đang gửi qua; biểu đồ temperature/humidity; bảng dữ liệu gần nhất kèm gateway\_id|
|**/audit**|admin|Bảng nhật ký bảo mật, filter theo event\_type, device\_id, thời gian, highlight AUTH\_FAIL đỏ|
|**/users**|admin only|Quản lý tài khoản Dashboard (tạo mới operator/viewer, đổi mật khẩu)|

## **6.2. Các Component Dùng Chung Cần Xây Dựng**

|**Component**|**Mô tả**|
| :- | :- |
|Sidebar.tsx|Navigation: Dashboard / Devices / Audit / Users. Hiển thị username và role. Nút logout.|
|DeviceStatusBadge.tsx|Badge màu: active=xanh, inactive=xám, blocked=đỏ. Dùng ở nhiều nơi.|
|OnlineIndicator.tsx|Tính online từ last\_seen: < 60s = Online (xanh chớp), khác = Offline (xám).|
|SensorChart.tsx|Recharts LineChart: 2 đường temperature và humidity theo received\_at; có thể filter theo gateway\_id để xem data của từng luồng.|
|RegisterModal.tsx|Modal hiển thị device\_id + secret\_key với nút Copy. Cảnh báo 'Chỉ hiển thị 1 lần'.|
|ConfirmDialog.tsx|Xác nhận trước khi xoá hoặc khoá thiết bị. Tránh thao tác nhầm.|
|AuditLogTable.tsx|Bảng sự kiện: màu đỏ cho AUTH\_FAIL/BLOCKED, xanh cho SUCCESS, vàng cho REGISTER.|
|StatsCard.tsx|Card thống kê với icon và số. Dùng ở trang Dashboard.|



`  `**7. CƠ CHẾ BẢO MẬT & PHÂN QUYỀN**

## **7.1. Giải Thích Cơ Chế HMAC-SHA256**
`  `ESP32 tính:                       Server tính:

`  `─────────────────────────────     ─────────────────────────────────

`  `message = device\_id:timestamp     message = device\_id:timestamp

`                                         `(dùng timestamp từ request)

`  `token   = HMAC-SHA256(            expected = HMAC-SHA256(

`              `SECRET\_KEY,                         secret\_key\_in\_DB,

`              `message)                            message)

`                `│                                      │

`                `└──────────── so sánh ────────────────┘

`                         `timingSafeEqual()

`                              `│

`                    `VALID nếu giống nhau

`                    `VÀ |now - timestamp| < 300s

*ℹ  Tại sao an toàn: SHA-256 là one-way – không thể tính ngược SECRET\_KEY từ token. Mỗi request có timestamp khác → token khác → không thể dùng lại.*

## **7.2. RBAC – Phân Quyền Theo Vai Trò**

|**Role**|**Đối tượng**|**Đăng ký device**|**Xem data**|**Khoá device**|**Publish data**|
| :- | :- | :-: | :-: | :-: | :-: |
|**admin**|Con người|✅|✅|✅|–|
|**operator**|Con người|✅|✅|✅|–|
|**viewer**|Con người|❌|✅|❌|–|
|**sensor (device)**|ESP32|–|–|–|✅ (data only)|
|**gateway (device)**|ESP32|–|–|–|✅ (forward data)|

## **7.3. ABAC – Kiểm Soát Theo Thuộc Tính (Tùy Chọn Nâng Cao)**
ABAC bổ sung thêm lớp kiểm soát chi tiết dựa trên thuộc tính của thiết bị:

- Thuộc tính: location (building-A), owner\_id, clearance\_level, device\_type
- Chính sách mẫu: 'Thiết bị ở Building-A chỉ được publish trong giờ hành chính (8-18h)'
- Chính sách mẫu: 'Chỉ thiết bị của user X mới được xem dữ liệu của thiết bị Y'
- Lưu thuộc tính trong cột location và có thể mở rộng thêm cột attributes JSON

## **7.4. Các Lớp Bảo Mật Cần Triển Khai**

|**Lớp bảo vệ**|**Cơ chế cụ thể**|**Triển khai như thế nào**|
| :- | :- | :- |
|**Xác thực thiết bị**|HMAC-SHA256 + timestamp|hmacService.js: verifyDeviceHMAC()|
|**Chống replay attack**|Cửa sổ 300 giây|Math.abs(now - timestamp) > 300 → reject|
|**Chống timing attack**|timingSafeEqual()|crypto.timingSafeEqual() thay vì ==|
|**Rate limiting**|10 req/phút auth endpoint|express-rate-limit middleware|
|**Auto-block**|Block sau 5 fail liên tiếp|UPDATE devices SET status='blocked' WHERE fail\_count>=5|
|**SQL Injection**|Parameterized queries|mysql2 prepared statements: db.execute(sql, [params])|
|**XSS / Security Headers**|Helmet.js|app.use(helmet()) trong Express|
|**Admin session**|JWT trong httpOnly cookie|res.cookie('token', jwt, {httpOnly:true, secure:true})|
|**Password storage**|bcrypt cost=12|bcrypt.hash(password, 12) khi tạo user|



`  `**8. THREAT MODEL & KỊCH BẢN TẤN CÔNG**

## **8.1. Bảng Phân Tích Mối Đe Dọa (STRIDE)**

|**Loại (STRIDE)**|**Mối đe dọa cụ thể**|**Mức độ rủi ro**|**Cơ chế phòng thủ đã có**|
| :- | :- | :- | :- |
|**Spoofing**|Kẻ tấn công giả mạo device\_id hợp lệ để gửi dữ liệu giả|**CAO**|HMAC-SHA256 – không có secret\_key không thể tạo token|
|**Tampering**|Sửa payload (data) trên đường truyền giữa ESP32 và server|**CAO**|HMAC bảo vệ toàn bộ message, TLS mã hóa traffic|
|**Repudiation**|Thiết bị gửi dữ liệu nhưng sau đó phủ nhận|**TRUNG BÌNH**|Audit log với timestamp, device\_id, IP không thể sửa|
|**Info Disclosure**|Lộ secret\_key qua mạng, log, hay repo git|**RẤT CAO**|TLS/HTTPS, không log key, .gitignore config.h|
|**Denial of Service**|Flood request đến server làm quá tải|**TRUNG BÌNH**|Rate limiting, connection pool limit, auto-block IP|
|**Elevation of Privilege**|Sensor node cố gửi lệnh điều khiển như gateway|**CAO**|RBAC kiểm tra device\_type trước mỗi action|

## **8.2. Chi Tiết Kịch Bản Tấn Công – Có Thể Demo Trong Lab**

|**Tên tấn công**|**Cách thực hiện demo**|**Kết quả mong đợi (hệ thống phản ứng)**|
| :- | :- | :- |
|**1. Device Spoofing**|Dùng curl gửi request với device\_id hợp lệ nhưng hmac\_token='fake123'|Server trả 401, audit\_log ghi AUTH\_FAIL, fail\_count tăng 1|
|**2. Replay Attack**|Ghi lại request hợp lệ, gửi lại sau 10 phút (timestamp cũ)|Server trả 401 'Timestamp out of window', không lưu data|
|**3. Brute Force Block**|Script vòng lặp gửi 6 request liên tiếp với token sai|Lần 5: device status='blocked', lần 6+: 403 Device inactive|
|**4. Unregistered Device**|Gửi request với device\_id chưa đăng ký trong DB|Server trả 403 'Device not found'|
|**5. Privilege Escalation**|Sensor node gửi request đến endpoint dành cho gateway|Server trả 403 'Insufficient permissions' do RBAC|
|**6. SQL Injection**|device\_id = "ESP32' OR 1=1--" trong JSON body|Parameterized query ngăn chặn, request bị từ chối 400|
|**7. Token Leakage Analysis**|Phân tích trong báo cáo: nếu lộ secret\_key thì hậu quả gì|Không demo thực tế – phân tích viết trong báo cáo + giải pháp key rotation|

## **8.3. Phân Tích Điểm Yếu Khi Secret Key Bị Lộ**
⛔  Đây là câu hỏi bắt buộc trong đề bài – cần phân tích kỹ trong báo cáo

|**Tình huống lộ key**|**Hậu quả & Biện pháp khắc phục**|
| :- | :- |
|**Flash dump ESP32 (vật lý)**|Hậu quả: Đọc được SECRET\_KEY từ flash memory, tạo token hợp lệ vô thời hạn. Khắc phục: Bật ESP32 Secure Boot + NVS Encryption, lưu key trong eFuse thay vì SPIFFS|
|**Commit lên GitHub public**|Hậu quả: config.h có SECRET\_KEY bị index công khai. Khắc phục: Thêm config.h vào .gitignore, dùng biến môi trường, scan với git-secrets|
|**Log server in key ra**|Hậu quả: Key xuất hiện trong log file. Khắc phục: Code review bắt buộc, không bao giờ log credentials|
|**Database bị breach**|Hậu quả: Nếu lưu plain text: toàn bộ key bị lộ. Khắc phục: Mã hóa AES-256-GCM trước khi lưu, master key trong env var|
|**Giải pháp tổng quát**|Key Rotation: Admin có thể kích hoạt từ Dashboard → server sinh key mới → gửi qua kênh bảo mật → old key bị revoke sau 24h. Thiết bị cần cơ chế nhận key mới qua OTA update.|



`  `**9. THỨ TỰ TRIỂN KHAI & PHÂN CHIA CÔNG VIỆC**

## **9.1. Lộ Trình Triển Khai Theo Ngày**

|**Giai đoạn**|**Thời gian**|**Công việc cụ thể**|
| :- | :- | :- |
|**Phase 0 Chuẩn bị**|Day 1 (4-6h)|Cài Node.js, MySQL 8, Mosquitto, Arduino IDE. Tạo project backend, tạo DB schema, test kết nối MySQL|
|**Phase 1 Database**|Day 1–2 (2-3h)|Chạy SQL migration tạo 5 bảng. Tạo user admin. Verify với SHOW TABLES và SELECT|
|**Phase 2 Backend Core**|Day 2–4 (8-12h)|Viết HMAC service, middleware validateDevice, route đăng ký thiết bị, route nhận data, admin auth. Test bằng Postman|
|**Phase 3 Hardware**|Day 3–5 (6-10h)|Đấu mạch Sensor Node, cài thư viện Arduino, viết firmware (hmac, wifi, ntp, dht, http\_send). Đăng ký device\_id, nạp firmware, test Serial Monitor|
|**Phase 4 Gateway**|Day 4–5 (4-6h)|Viết firmware Gateway (mqtt\_client + hmac\_verifier + forwarder). Cấu hình Mosquitto. Test toàn bộ luồng Sensor→Gateway (xác thực SN)→Backend (xác thực GW+SN)|
|**Phase 5 Frontend**|Day 4–7 (10-15h)|Khởi tạo Next.js, xây Login, Device List, Register Modal, Device Detail, Audit Log. Kết nối API backend|
|**Phase 6 Integration**|Day 7–8 (4-6h)|Test toàn hệ thống end-to-end. Kiểm tra từng flow, fix bug. Chạy demo attack scenarios|
|**Phase 7 Báo cáo**|Day 8–10 (4-8h)|Viết báo cáo, chụp ảnh/quay video demo, phân tích threat model, chuẩn bị slide thuyết trình|

## **9.2. Thứ Tự Ưu Tiên Nếu Thời Gian Hạn Chế**
*ℹ  Nếu chỉ có 1 tuần: ưu tiên làm đúng thứ tự sau, không skip bước nào*

1. Database schema → Bắt buộc phải xong trước khi viết bất kỳ code nào
1. Backend HMAC service + route /api/device/data → Đây là core security, test kỹ với Postman
1. ESP32 Sensor Node firmware → Test kết nối, gửi data thành công
1. Backend admin API + route đăng ký thiết bị
1. Frontend cơ bản: Login + Device List (chỉ cần hiện danh sách là đủ demo)
1. ESP32 Gateway – Bắt buộc (không thể bỏ qua: toàn bộ Sensor phải gửi qua Gateway)
1. Frontend nâng cao: Charts, Audit Log, Register Modal

## **9.3. Các Điểm Kiểm Tra (Checkpoint) Quan Trọng**

|**Checkpoint**|**Lệnh / Thao tác kiểm tra**|**Kết quả đúng**|
| :- | :- | :- |
|MySQL kết nối được|node -e "require('./src/config/db').query('SELECT 1')"|In ra [[1]] không báo lỗi|
|HMAC tính đúng|So sánh kết quả từ Node.js với Python script cùng input|2 kết quả hex giống nhau 100%|
|API từ chối token sai|Postman POST /api/device/data với hmac\_token='fake'|401 { error: 'Invalid HMAC token' }|
|ESP32 gửi data thành công|Serial Monitor của ESP32|[HTTP] Response 200: {"success":true}|
|Dashboard hiển thị thiết bị|Truy cập http://localhost:3000/devices|Thấy ESP32 đã đăng ký với status active|
|Online/Offline cập nhật|Rút USB ESP32, chờ 90 giây|Icon WiFi đổi sang màu xám (Offline)|
|Lock device hoạt động|Click Lock trên Dashboard, đợi ESP32 gửi request tiếp theo|Serial Monitor ESP32: [HTTP] Response 403|
|Attack demo thành công|Chạy script brute force 6 lần|Lần 5+ bị 403, audit\_log ghi đủ events|



`  `**10. CHECKLIST HOÀN THÀNH DỰ ÁN**

## **10.1. Checklist Kỹ Thuật – Theo Thành Phần**

|**✓**|**Hạng mục**|**Tiêu chí Done**|
| :-: | :- | :- |
|[ ]|[DB] Tạo MySQL schema đủ 5 bảng|SHOW TABLES → 5 bảng|
|[ ]|[DB] Tạo user admin trong bảng users|SELECT \* FROM users → thấy admin|
|[ ]|[Backend] HMAC service xác thực đúng/sai token|Postman test 2 case: 200 và 401|
|[ ]|[Backend] Auto-block sau 5 lần fail|fail\_count=5 → status='blocked'|
|[ ]|[Backend] Replay attack bị từ chối|Timestamp cũ 10 phút → 401|
|[ ]|[Backend] RBAC kiểm tra role thiết bị|Wrong role → 403|
|[ ]|[Backend] Audit log ghi đủ sự kiện|SELECT \* FROM audit\_log → có đủ event types|
|[ ]|[HW] ESP32 Sensor Node kết nối WiFi + NTP|Serial: [WiFi] OK + [NTP] OK|
|[ ]|[HW] ESP32 gửi data với HMAC, server trả 200|Serial: [HTTP] Response 200|
|[ ]|[HW] ESP32 Gateway forward data qua MQTT|Serial Gateway: [GW→Cloud] 200|
|[ ]|[SYS] Hệ thống hoạt động liên tục ≥ 10 phút (yêu cầu kỹ thuật bắt buộc)|Chạy demo liên tục 10+ phút, Serial Monitor không báo lỗi, dữ liệu vào DB đều đặn|
|[ ]|[SYS] Luồng end-to-end hoàn chỉnh: IoT Node → Gateway → Server → DB → Dashboard|Gửi 1 payload từ ESP32, kiểm tra DB có bản ghi, Dashboard hiển thị đúng|
|[ ]|[FE] Dashboard login admin được|Redirect về / sau login|
|[ ]|[FE] Danh sách thiết bị hiển thị đúng|Thấy ESP32 đã đăng ký với đúng status|
|[ ]|[FE] Online/Offline cập nhật tự động|Rút ESP32, icon đổi trong ≤ 90 giây|
|[ ]|[FE] Dashboard có biểu đồ nhiệt độ VÀ độ ẩm (yêu cầu tối thiểu của đề)|SensorChart.tsx có 2 đường: nhiệt độ (°C) và độ ẩm (%) trên cùng trục thời gian|
|[ ]|[FE] Đăng ký thiết bị mới qua Dashboard|Modal hiện credentials, sau đó không thấy nữa|
|[ ]|[FE] Nút Lock/Unlock hoạt động real-time|Lock → ESP32 bị 403; Unlock → ESP32 gửi được|
|[ ]|[FE] Audit log hiển thị đủ sự kiện|Thấy AUTH\_FAIL, DATA\_RECV, DEVICE\_REGISTER|

## **10.2. Checklist Báo Cáo – Yêu Cầu Môn Học**

|**✓**|**Nội dung báo cáo cần có**|**Ghi chú**|
| :-: | :- | :- |
|[ ]|Mô tả kiến trúc hệ thống (sơ đồ, bảng công nghệ)|Chương 1 tài liệu này|
|[ ]|Thiết kế DB với ERD đầy đủ|Chương 2 tài liệu này|
|[ ]|Giải thích cơ chế HMAC hoạt động như thế nào|Chương 7.1|
|[ ]|Phân tích điểm yếu khi token bị lộ (bắt buộc theo đề)|Chương 8.3|
|[ ]|Threat Model theo STRIDE (7 loại)|Chương 8.1|
|[ ]|Demo video: đăng ký thiết bị → gửi data → xem dashboard|Quay màn hình + Serial Monitor|
|[ ]|Demo video: attack scenarios (ít nhất 3 loại)|Spoofing, Replay, Brute Force|
|[ ]|Source code có comment giải thích logic bảo mật|Đặc biệt trong hmacService.js|
|[ ]|Hướng dẫn triển khai (README hoặc phụ lục)|Tham khảo Chương 9|



**Tài liệu v3.2 – Kiến trúc thống nhất: Gateway bắt buộc, xác thực 2 cấp (GW + Sensor)**

*ESP32 (Sensor + Gateway)  ·  MySQL 8.0  ·  Node.js  ·  Next.js + Tailwind CSS*
