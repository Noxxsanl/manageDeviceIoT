# HTTP Status Code đang dùng trong dự án

Tổng hợp toàn bộ status code mà backend (Express) trả về và cách frontend xử lý
chúng. Rút ra từ việc đọc toàn bộ `backend/src/**` (routes + middleware) và
`frontend/src/**` (api client, container Login).

## 1. Bảng tổng hợp theo mã

| Status | Ý nghĩa | Khi nào trả về | File |
|---|---|---|---|
| **200 OK** | Thành công | Tất cả `GET`, và `POST /api/device/data` khi nhận dữ liệu hợp lệ | hầu hết route handlers |
| **201 Created** | Tạo resource mới thành công | `POST /api/devices/register` (tạo device), `POST /api/users` (tạo user) | [devices.ts:61](backend/src/routes/devices.ts#L61), [users.ts:53](backend/src/routes/users.ts#L53) |
| **400 Bad Request** | Body/query không hợp lệ (thiếu field, sai kiểu, sai format) | xem mục 2 | nhiều route |
| **401 Unauthorized** | Chưa đăng nhập / token sai / HMAC thiết bị sai | xem mục 2 | `verifyJWT`, `auth.ts`, `validateDevice` |
| **403 Forbidden** | Đã xác thực nhưng không đủ quyền, hoặc thiết bị bị chặn/sai loại | xem mục 2 | `rbac.ts`, `data.routes.ts`, `users.ts` |
| **404 Not Found** | Không tìm thấy resource theo id, hoặc route không tồn tại | xem mục 2 | `devices.ts`, `users.ts`, `app.ts` (fallback) |
| **409 Conflict** | Trùng dữ liệu (username đã tồn tại) | `POST /api/users` | [users.ts:43](backend/src/routes/users.ts#L43) |
| **429 Too Many Requests** | Vượt rate limit | `express-rate-limit` (mặc định set status 429) | [app.ts](backend/src/app.ts#L30) |
| **500 Internal Server Error** | Lỗi không bắt được (exception ném ra trong handler) | error-handling middleware cuối cùng | [app.ts:70](backend/src/app.ts#L70) |

## 2. Chi tiết theo từng mã lỗi (error code trong response body)

Response lỗi đều có dạng `{ error: "MA_LOI", ... }` (trừ 404 fallback và 500
dùng `{ status: "error", message }`).

### 400 — Bad Request
| `error` | Route | Lý do |
|---|---|---|
| `MISSING_FIELDS` | `POST /api/auth/login` | thiếu `username`/`password` |
| `MISSING_FIELDS` | `POST /api/devices/register` | thiếu `device_name`/`device_type` |
| `INVALID_DEVICE_TYPE` | `POST /api/devices/register` | `device_type` không phải `sensor`/`gateway` |
| `INVALID_STATUS` | `PATCH /api/devices/:id/status` | `status` không thuộc `active/blocked/inactive` |
| `MISSING_FIELDS` | `POST /api/users` | thiếu `username`/`password`/`role` |
| `INVALID_ROLE` | `POST /api/users` | `role` không phải `operator`/`viewer` |
| `INVALID_USERNAME` | `POST /api/users` | username < 3 hoặc > 32 ký tự |
| `PASSWORD_TOO_SHORT` | `POST /api/users`, `PATCH /api/users/:id/password` | password < 6 ký tự |
| `INVALID_ID` | `PATCH /api/users/:id/password`, `DELETE /api/users/:id` | id không phải số dương |
| `CANNOT_DELETE_SELF` | `DELETE /api/users/:id` | admin tự xoá chính mình |
| `INVALID_DEVICE_ID` / `INVALID_FROM_DATE` / `INVALID_TO_DATE` | `GET /api/audit-log` | query filter sai |
| `MISSING_PAYLOAD_DATA` | `POST /api/device/data` | thiếu object `data` |
| `MISSING_GATEWAY_FIELDS` / `MISSING_SENSOR_FIELDS` | `POST /api/device/data` (middleware `validateDevice`) | thiếu `gateway_id/gw_timestamp/gw_hmac` hoặc `sensor_id/sn_timestamp/sn_hmac` |

### 401 — Unauthorized
| `error` | Route | Lý do |
|---|---|---|
| `NO_TOKEN` | mọi route có `verifyJWT` | thiếu cookie `token` |
| `INVALID_TOKEN` | mọi route có `verifyJWT` | JWT verify thất bại (sai/hết hạn) |
| `INVALID_CREDENTIALS` | `POST /api/auth/login` | sai username/password |
| `GATEWAY_AUTH_FAIL` | `POST /api/device/data` | HMAC gateway sai (kèm tăng `fail_count`, có thể tự block thiết bị) |
| `SENSOR_AUTH_FAIL` | `POST /api/device/data` | HMAC sensor sai (kèm tăng `fail_count`, có thể tự block thiết bị) |

### 403 — Forbidden
| `error` | Route | Lý do |
|---|---|---|
| `FORBIDDEN` | mọi route có `requireRole(...)` | role hiện tại không nằm trong danh sách cho phép |
| `INVALID_DEVICE_TYPE` | `POST /api/device/data` | `gateway_id`/`sensor_id` trỏ sai loại thiết bị |
| `DEVICE_BLOCKED` | `POST /api/device/data` | gateway hoặc sensor đang `status = blocked` |
| `DEVICE_NOT_ACTIVE` | `POST /api/device/data` | gateway hoặc sensor chưa `active` |
| `CANNOT_DELETE_ADMIN` | `DELETE /api/users/:id` | không cho xoá user role `admin` |

### 404 — Not Found
| `error` | Route | Lý do |
|---|---|---|
| `DEVICE_NOT_FOUND` | `GET /api/devices/:id`, `GET /api/devices/:id/data`, `PATCH /api/devices/:id/status`, `DELETE /api/devices/:id` | không tìm thấy device theo `id` |
| `NOT_FOUND` | `PATCH /api/users/:id/password`, `DELETE /api/users/:id` | không tìm thấy user theo `id` |
| *(fallback, không có field `error`)* | mọi path không khớp route nào | middleware 404 cuối cùng trong [app.ts](backend/src/app.ts#L63) — trả `{ status: "error", message: "Route not found" }` |

### 409 — Conflict
| `error` | Route | Lý do |
|---|---|---|
| `USERNAME_TAKEN` | `POST /api/users` | username đã tồn tại |

### 429 — Too Many Requests
Sinh ra bởi `express-rate-limit`, không có field `error`, body là
`{ error: "TOO_MANY_REQUESTS", detail: "..." }` (custom `message` cấu hình
trong [app.ts](backend/src/app.ts#L30)):

| Limiter | Áp dụng cho | Giới hạn |
|---|---|---|
| `authLimiter` | `POST /api/auth/login` | 10 request / 15 phút / IP |
| `deviceDataLimiter` | `POST /api/device/data` | 60 request / phút / IP |
| `apiLimiter` | mọi route `/api/*` khác (trừ `/api/device/data`) | 100 request / 15 phút / IP |

### 500 — Internal Server Error
Middleware lỗi cuối cùng trong [app.ts:69-75](backend/src/app.ts#L69-L75):
bắt mọi exception chưa được xử lý, trả `{ status: "error", message }`. Nếu
`res.statusCode` đã được set khác 200 trước khi lỗi xảy ra thì giữ nguyên mã
đó, ngược lại mặc định 500.

## 3. Frontend xử lý status code thế nào

- [`frontend/src/shared/api/client.ts`](frontend/src/shared/api/client.ts) (hoặc `frontend/src/features/auth/api/auth.api.ts`):
  mọi response không `ok` được ném thành `FetchError(status, data)`.
  Riêng **401** (trừ khi gọi `/api/auth/login` hoặc `/api/auth/me`) sẽ tự
  redirect về `/login` ngay tại lớp fetch, không cần component tự xử lý.
- [`frontend/src/features/auth/pages/LoginPage.tsx`](frontend/src/features/auth/pages/LoginPage.tsx):
  bắt riêng `401` → "Sai tên đăng nhập hoặc mật khẩu.", `429` → "Quá nhiều lần
  thử. Vui lòng đợi và thử lại.", còn lại → lỗi kết nối chung.
- [`frontend/src/features/users/pages/UsersPage.tsx`](frontend/src/features/users/pages/UsersPage.tsx):
  bắt riêng error code `USERNAME_TAKEN` (409) để hiển thị thông báo tương ứng.

## 4. Quy ước chung trong dự án

- Lỗi nghiệp vụ luôn trả `{ error: "SCREAMING_SNAKE_CASE" }`, có thể kèm
  `detail`/`reason` để debug.
- Không có lớp `AppError`/exception class tập trung — mỗi handler tự gọi
  `res.status(...).json(...)` rồi `return`.
- Không dùng các mã 1xx, 3xx, hay 5xx khác ngoài 500 (không có 502/503...).
- `405 Method Not Allowed` không được dùng riêng — method sai trên route đã
  định nghĩa sẽ rơi vào middleware 404 chung do Express không khai báo
  handler cho method đó.
