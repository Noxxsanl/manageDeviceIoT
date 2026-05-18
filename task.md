
## Tên đề tài: Hệ thống quản lý thiết bị IoT và phân quyền truy cập
### Mục tiêu: 
Xây dựng hệ thống IoT có chức năng quản lý danh tính thiết bị, xác thực thiết bị khi kết nối và kiểm soát quyền truy cập cơ bản, đảm bảo chỉ các thiết bị hợp lệ mới được phép gửi dữ liệu và truy cập tài nguyên của hệthống.
### Yêu cầu hệ thống
Xây dựng hệ thống gồm: IoT Device – Server – Database– Dashboard
Thiết bị IoT có Device ID duy nhất
Server hỗ trợ:
- Đăng ký thiết bị
- Xác thực thiết bị khi gửi dữ liệu
- Kiểm soát thiết bị được phép truy cập
Dashboard hiển thị: danh sách thiết bị + trạng thái thiết bị (online/offline)
- Có thể triển khai
### Yêu cầu bảo mật
Mỗi thiết bị có Device ID + token/secret key
Tùy chọn: Có thể triển khai Hệ thống theo cơ chế điều
khiển truy nhập dựa trên RBAC (Role-Based Access
Control) hoặc ABAC (Attribute-Based Access Control).
Khi gửi dữ liệu phải kèm: device_id + token + data
Server phải: kiểm tra thiết bị hợp lệ trước khi xử lý và từ
chối thiết bị không đăng ký hoặc sai token
Chống các hành vi: giả mạo thiết bị + truy cập trái phép API
### Threat Model & Security
Sinh viên bắt buộc xác định các tấn công có thể thực hiện
Phân tích: cơ chế xác thực device_id + token hoạt động
thế nào, điểm yếu nếu token bị lộ.



chia thành 15 task
