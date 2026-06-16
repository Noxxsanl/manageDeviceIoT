# RBAC (Role-Based Access Control) đã triển khai trong hệ thống

> Tài liệu này mô tả **chi tiết, đối chiếu trực tiếp với code** cơ chế phân quyền đang chạy trong dự án `managerDeviceIoT-RBAC`. Tham chiếu file dùng đường dẫn tương đối từ gốc repo.

## 1. Hai lớp kiểm soát truy cập trong hệ thống

Đề bài cho phép chọn RBAC hoặc ABAC để "kiểm soát thiết bị được phép truy cập". Dự án này triển khai **đồng thời hai cơ chế độc lập**, áp cho hai nhóm chủ thể khác nhau:

| Lớp | Chủ thể | Cơ chế | Mục đích |
|---|---|---|---|
| **(A) RBAC người dùng** | Người dùng Dashboard (admin / operator / viewer) | JWT + bảng vai trò cố định, gác bằng middleware `requireRole` | Ai được đăng ký, khoá, xoá thiết bị; ai được quản lý tài khoản |
| **(B) Kiểm soát truy cập thiết bị** | Thiết bị IoT (sensor / gateway) | HMAC-SHA256 + thuộc tính `device_type`, `status` trong DB | Thiết bị nào được phép gửi dữ liệu vào hệ thống |

Hai lớp này **không dùng chung middleware**: (A) bảo vệ các route quản trị (`/api/devices`, `/api/users`, …) bằng `verifyJWT` + `requireRole`; (B) bảo vệ route nhận dữ liệu cảm biến (`/api/device/data`) bằng `validateDevice` (HMAC), hoàn toàn không liên quan JWT. Phần dưới đi sâu vào lớp (A) — đúng nghĩa "RBAC" theo yêu cầu đề bài — và nói rõ lớp (B) đóng vai trò bổ trợ kiểu ABAC (dựa trên thuộc tính `device_type`/`status`) ở cuối tài liệu.

## 2. Mô hình vai trò (Role Model)

Định nghĩa tại [database/migrations/001_schema.sql:19](../database/migrations/001_schema.sql#L19):

```sql
role ENUM('admin','operator','viewer') NOT NULL DEFAULT 'viewer'
```

→ Vai trò được ràng buộc **ngay ở tầng database** (ENUM), không phải chuỗi tự do — tránh việc một bản ghi user lọt vào với role rác.

Ba vai trò, theo thứ tự quyền giảm dần:

- **admin** — toàn quyền: quản lý người dùng + toàn bộ vòng đời thiết bị.
- **operator** — vận hành thiết bị: đăng ký thiết bị mới, khoá/mở khoá thiết bị; **không** được quản lý người dùng, **không** được xoá thiết bị.
- **viewer** — chỉ đọc: xem dashboard, danh sách thiết bị, dữ liệu cảm biến, audit log; không có quyền ghi ở đâu cả.

## 3. Cơ chế kỹ thuật: JWT mang role + middleware gác cổng

### 3.1. Phát hành "thẻ vai trò" lúc đăng nhập

[backend/src/routes/auth.ts:39-49](../backend/src/routes/auth.ts#L39-L49):

```ts
const token = jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  process.env.JWT_SECRET!,
  { expiresIn: "8h" }
);

res.cookie("token", token, {
  httpOnly: true,
  maxAge: 8 * 60 * 60 * 1000,
  sameSite: "strict",
});
```

Điểm quan trọng:
- **Role được "đóng dấu" (sign) vào JWT** ngay tại thời điểm đăng nhập, lấy từ giá trị `role` đang lưu trong bảng `users` ở DB — không tin role do client tự gửi lên.
- JWT được đặt trong cookie `HttpOnly` (JavaScript trên trình duyệt không đọc được → giảm rủi ro đánh cắp token qua XSS) và `SameSite=Strict` (trình duyệt không gửi cookie này kèm request cross-site → giảm rủi ro CSRF).
- Hạn dùng 8 giờ, đồng bộ giữa `expiresIn` của JWT và `maxAge` của cookie.
- Mật khẩu so sánh bằng `bcrypt.compare`, và khi username không tồn tại vẫn chạy một lượt `bcrypt.compare` với "dummy hash" để giữ **thời gian phản hồi không đổi**, chống dò username qua timing attack.

### 3.2. Xác thực JWT — `verifyJWT`

[backend/src/middleware/verifyJWT.ts](../backend/src/middleware/verifyJWT.ts):

```ts
const token = parseCookie(req.headers.cookie, "token");
if (!token) { res.status(401).json({ error: "NO_TOKEN" }); return; }
const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
(req as any).user = payload;   // { id, username, role }
next();
```

Middleware này **tự đọc cookie thủ công** (không dùng `cookie-parser`), verify chữ ký JWT bằng `JWT_SECRET`, rồi gắn `req.user`. Mọi route phía sau nó coi `req.user.role` là **nguồn sự thật duy nhất** về vai trò của người gọi trong suốt request — không truy vấn lại DB mỗi lần (đánh đổi: nếu admin đổi role của một user giữa lúc JWT còn hạn 8h, JWT cũ vẫn mang role cũ cho tới khi hết hạn/đăng nhập lại).

### 3.3. Gác quyền theo vai trò — `requireRole`

Toàn bộ logic RBAC thực sự nằm trong **9 dòng** ở [backend/src/middleware/rbac.ts](../backend/src/middleware/rbac.ts):

```ts
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  };
}
```

Đây là một **factory middleware** (higher-order function) nhận danh sách role được phép (`...roles`) và trả về middleware kiểm tra `req.user.role` có nằm trong danh sách đó hay không. Vì nhận `req.user` đã được `verifyJWT` gắn sẵn, `requireRole` luôn phải đứng **sau** `verifyJWT` trong chuỗi middleware của route:

```ts
router.post("/register", verifyJWT, requireRole("admin", "operator"), handler);
```

Thiết kế này cho phép khai báo RBAC **khai báo (declarative), tại chỗ, ngay trên route**, dễ đọc và dễ audit — chỉ cần nhìn dòng định nghĩa route là biết route đó dành cho vai trò nào, không cần tra bảng permission riêng.

## 4. Ma trận phân quyền đầy đủ (đối chiếu từng route)

| Method & Route | Middleware áp dụng | Vai trò được phép | File |
|---|---|---|---|
| `POST /api/auth/login` | — (public) | Ai cũng gọi được | [auth.ts:10](../backend/src/routes/auth.ts#L10) |
| `GET /api/auth/me` | `verifyJWT` | admin, operator, viewer (đã đăng nhập) | [auth.ts:61](../backend/src/routes/auth.ts#L61) |
| `POST /api/devices/register` | `verifyJWT` + `requireRole("admin","operator")` | **admin, operator** | [devices.ts:16-19](../backend/src/routes/devices.ts#L16-L19) |
| `GET /api/devices` | `verifyJWT` | admin, operator, **viewer** | [devices.ts:77](../backend/src/routes/devices.ts#L77) |
| `GET /api/devices/:id` | `verifyJWT` | admin, operator, **viewer** | [devices.ts:142](../backend/src/routes/devices.ts#L142) |
| `GET /api/devices/:id/data` | `verifyJWT` | admin, operator, **viewer** | [devices.ts:100](../backend/src/routes/devices.ts#L100) |
| `PATCH /api/devices/:id/status` (lock/unlock) | `verifyJWT` + `requireRole("admin","operator")` | **admin, operator** | [devices.ts:183-186](../backend/src/routes/devices.ts#L183-L186) |
| `DELETE /api/devices/:id` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** | [devices.ts:223-226](../backend/src/routes/devices.ts#L223-L226) |
| `GET /api/users` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** | [users.ts:10](../backend/src/routes/users.ts#L10) |
| `POST /api/users` (tạo operator/viewer) | `verifyJWT` + `requireRole("admin")` | **chỉ admin** | [users.ts:18](../backend/src/routes/users.ts#L18) |
| `PATCH /api/users/:id/password` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** | [users.ts:59](../backend/src/routes/users.ts#L59) |
| `DELETE /api/users/:id` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** | [users.ts:84](../backend/src/routes/users.ts#L84) |
| `GET /api/audit-log` | `verifyJWT` (không `requireRole`) | admin, operator, **viewer** | [audit.ts:8](../backend/src/routes/audit.ts#L8) |
| `GET /api/dashboard/stats` | `verifyJWT` (không `requireRole`) | admin, operator, **viewer** | [dashboard.ts:8](../backend/src/routes/dashboard.ts#L8) |
| `POST /api/device/data` | `validateDevice` (HMAC, **không dùng JWT/role**) | Không áp dụng — đây là kênh máy-với-máy (M2M) | [data.routes.ts:13](../backend/src/routes/data.routes.ts#L13) |

Nhận xét từ ma trận:

- **viewer** có quyền đọc rộng (devices, audit-log, dashboard) nhưng **không một route ghi nào** chấp nhận viewer — đúng tinh thần "read-only".
- **operator** được trao quyền vận hành thiết bị (đăng ký, khoá/mở) nhưng **không** được đụng vào tài khoản người dùng và **không** được xoá thiết bị (hành động phá hủy dữ liệu nhất) — chỉ admin mới xoá được, kèm cascade xoá `sensor_data` + `device_tokens` liên quan ([devices.ts:243-245](../backend/src/routes/devices.ts#L243-L245)).
- Endpoint tạo user ([users.ts:25](../backend/src/routes/users.ts#L25)) **chặn cứng role được tạo** chỉ còn `["operator", "viewer"]` — API không cho tạo thêm admin mới. Admin "gốc" duy nhất được tạo qua script seed ([backend/src/scripts/seed.ts](../backend/src/scripts/seed.ts)) hoặc đã có sẵn trong migration SQL ([001_schema.sql:95-100](../database/migrations/001_schema.sql#L95-L100)). Đây là một control tốt: không có đường API nào để leo thang thành admin.
- Tự bảo vệ: admin không tự xoá được chính mình (`CANNOT_DELETE_SELF`, [users.ts:92](../backend/src/routes/users.ts#L92)) và không ai xoá được tài khoản có role admin (`CANNOT_DELETE_ADMIN`, [users.ts:103](../backend/src/routes/users.ts#L103)) — chống tình huống hệ thống mất hết admin.

## 5. RBAC ở phía Frontend — chỉ là lớp UX, không phải security boundary

- [frontend/src/containers/Users/index.tsx:239](../frontend/src/containers/Users/index.tsx#L239) chặn render toàn bộ trang Users nếu `currentUser.role !== "admin"` — đây là **phòng vệ ở UI**, hiển thị "Không có quyền truy cập" thay vì gọi API rồi nhận lỗi.
- Ngược lại, [frontend/src/containers/Devices/index.tsx](../frontend/src/containers/Devices/index.tsx) **không hề kiểm tra role**: nút "Add Device", "Lock/Unlock", "Delete" luôn hiển thị cho mọi vai trò, kể cả viewer. Nếu một viewer bấm "Delete", request vẫn được gửi và **chỉ bị backend chặn ở `requireRole("admin")` với HTTP 403** — UI không tự ẩn nút sai quyền.
  → Đây là một điểm cần lưu ý khi viết threat model: **frontend không phải là boundary an toàn**, toàn bộ enforcement thật sự nằm ở backend (`requireRole`). Đúng nguyên tắc, nhưng UX chưa nhất quán (Users ẩn theo role, Devices thì không).
- `frontend/middleware.ts` ([frontend/middleware.ts](../frontend/middleware.ts)) chỉ kiểm tra **có cookie `token` hay không** để quyết định redirect `/login` ↔ `/dashboard`. Middleware này **không verify chữ ký JWT** (Next.js Edge Runtime không có `JWT_SECRET` ở đây), nên một cookie giả/hết hạn vẫn "qua" middleware và chỉ bị backend từ chối (401) khi gọi API thật. `frontend/src/package/services/api.ts` bắt sẵn lỗi 401 toàn cục và tự `window.location.href = "/login"` để xử lý trường hợp này.

## 6. Lớp (B): Kiểm soát truy cập thiết bị — bổ trợ kiểu ABAC

Lớp này không gắn với "vai trò người dùng" mà gắn với **thuộc tính của thiết bị**, nên về bản chất gần ABAC hơn RBAC, nhưng đáp ứng đúng yêu cầu "kiểm soát thiết bị được phép truy cập" của đề bài:

- **Thuộc tính `device_type`** (`sensor` | `gateway`): tại [data.routes.ts:35-43](../backend/src/routes/data.routes.ts#L35-L43), backend bắt buộc id đứng ở vai "gateway" trong request phải có `device_type = 'gateway'` trong DB, và id ở vai "sensor" phải có `device_type = 'sensor'`. Đây chính là dòng comment trong code: `// RBAC: device_type check` — tác giả gốc gọi nó là RBAC vì device_type hoạt động như một "role" gán cho thiết bị, dù cơ chế thực thi là so khớp thuộc tính.
- **Thuộc tính `status`** (`inactive` | `active` | `blocked`): mới đăng ký → `inactive` (chưa có quyền gửi dữ liệu) → cần admin/operator chuyển `active` qua `PATCH /api/devices/:id/status` thì mới được phép gửi dữ liệu ([data.routes.ts:46-61](../backend/src/routes/data.routes.ts#L46-L61)); `blocked` luôn bị từ chối. Đây là một dạng **provisioning gate**: quyền của thiết bị do con người (lớp RBAC ở mục 4) cấp, nhưng được *thực thi* dựa trên thuộc tính lưu trong DB tại thời điểm gửi dữ liệu (ABAC).
- **Tự động hạ quyền (auto-revoke)**: [hmacService.ts](../backend/src/services/hmacService.ts) + [validateDevice.ts](../backend/src/middleware/validateDevice.ts) đếm `fail_count`; sau `BLOCK_THRESHOLD = 5` lần xác thực sai liên tiếp, thiết bị bị set `status = 'blocked'` tự động ([validateDevice.ts:20-25](../backend/src/middleware/validateDevice.ts#L20-L25)) — quyền truy cập bị thu hồi không cần con người can thiệp, giảm thời gian phản ứng với tấn công brute-force secret key.

→ Kết luận: hệ thống không triển khai một engine ABAC tổng quát (không có policy ngôn ngữ kiểu Casbin/OPA), mà **mã hoá cứng (hard-code) một vài thuộc tính thiết bị** (`device_type`, `status`) trực tiếp vào logic route — đủ để thoả yêu cầu đề bài ("tuỳ chọn triển khai RBAC hoặc ABAC") nhưng không có khả năng mở rộng chính sách động (ví dụ: theo IP, theo giờ, theo vị trí địa lý) nếu không sửa code.

## 7. Hạn chế / điểm yếu của thiết kế RBAC hiện tại (để phục vụ phần threat model)

1. **RBAC tĩnh, hard-code theo route**: danh sách role cho phép nằm rải rác trong từng file route (`requireRole("admin","operator")` lặp lại nhiều nơi) — không có bảng permission tập trung trong DB. Muốn thêm vai trò mới hoặc đổi quyền của operator phải sửa code và deploy lại, không cấu hình runtime được.
2. **Không có row-level / resource-ownership scoping**: một operator có quyền khoá/mở **bất kỳ** thiết bị nào trong hệ thống, không bị giới hạn theo `created_by` (cột này tồn tại trong DB — [001_schema.sql:40](../database/migrations/001_schema.sql#L40) — nhưng không được dùng để lọc quyền). Nói cách khác, không có khái niệm "operator chỉ quản lý thiết bị mình đăng ký".
3. **JWT không bị revoke sớm**: đổi role hoặc xoá user không làm mất hiệu lực JWT đã phát hành trước đó — JWT vẫn hợp lệ tới khi hết hạn (8h) vì hệ thống không lưu danh sách token đã cấp/blacklist.
4. **Cookie thiếu cờ `secure`**: `res.cookie("token", ..., { httpOnly: true, sameSite: "strict" })` ở [auth.ts:45-49](../backend/src/routes/auth.ts#L45-L49) không set `secure: true` — nếu deploy qua HTTPS thật, nên bổ sung để cookie không bị gửi qua kênh HTTP trong trường hợp downgrade.
5. **Audit log không lọc theo role**: `GET /api/audit-log` chỉ cần `verifyJWT`, không `requireRole`, nên **viewer cũng xem được toàn bộ audit log** (bao gồm các sự kiện nhạy cảm như `DEVICE_BLOCKED`, `GATEWAY_AUTH_FAIL`...). Tuỳ yêu cầu bảo mật thực tế, có thể cân nhắc giới hạn lại cho admin/operator.
6. **Frontend không đồng bộ ẩn/hiện theo role** (đã nêu ở mục 5) — không phải lỗ hổng bảo mật (backend vẫn chặn) nhưng là UX gây hiểu nhầm quyền cho viewer.

Các điểm 1–6 nên được liệt kê trong phần "Threat Model & Security" của báo cáo như **điểm yếu đã biết, được đánh đổi có chủ đích cho một hệ thống học thuật / demo**, kèm hướng khắc phục nếu triển khai production (permission table động, token revocation/refresh token, ràng buộc ownership, cookie `secure`).
