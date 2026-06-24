# RBAC — Luồng từ Database đến Backend đến Frontend

> Tài liệu này đi theo đúng một request vòng đời: từ lúc role được lưu trong DB, qua quá trình đăng nhập, qua middleware backend, đến lúc frontend quyết định render gì. Mọi đoạn code được đối chiếu trực tiếp với file thực tế trong repo.

---

## Tổng quan luồng

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                                 │
│  users.role  ENUM('admin','operator','viewer')                            │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │  SELECT id, username, password_hash, role
                         │  WHERE username = ?
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND — Login  (POST /api/auth/login)                                  │
│  bcrypt.compare(password, hash)                                           │
│  jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: "8h" })       │
│  res.cookie("token", token, { httpOnly: true, sameSite: "strict" })      │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │  Cookie: token=<JWT>  (HttpOnly)
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND — Middleware Chain  (mọi route được bảo vệ)                     │
│                                                                           │
│  verifyJWT  →  req.user = { id, username, role }                         │
│       │                                                                   │
│       └──▶  requireRole("admin","operator")  →  403 nếu không đủ quyền  │
└────────────────────────┬─────────────────────────────────────────────────┘
                         │  Response JSON  (200 / 403 / 401)
                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                                 │
│  AuthProvider  ←  GET /api/auth/me  →  user.role lưu vào React Context  │
│  usePermissions()  →  canCreateDevice, canDeleteDevice, isAdmin, …       │
│  Pages  →  ẩn/hiện nút dựa trên permission flags                         │
│  middleware.ts  →  redirect /login nếu không có cookie                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Lớp 1 — Database

### Định nghĩa role

[`database/migrations/001_schema.sql`](../database/migrations/001_schema.sql):

```sql
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','operator','viewer') NOT NULL DEFAULT 'viewer',
  last_login    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Role được ràng buộc bằng **`ENUM` ngay ở tầng DB** — không phải VARCHAR tự do. Nếu backend cố ghi một giá trị nằm ngoài 3 giá trị này, MySQL sẽ báo lỗi trước khi lưu vào disk.

**Ba vai trò theo thứ tự quyền giảm dần:**

| Role | Ý nghĩa |
|------|---------|
| `admin` | Toàn quyền: quản lý user, toàn bộ vòng đời thiết bị, xóa audit log |
| `operator` | Vận hành: đăng ký và kích hoạt/khóa thiết bị; không được xóa thiết bị, không quản lý user |
| `viewer` | Chỉ đọc: xem dashboard, danh sách thiết bị, dữ liệu cảm biến; không có quyền ghi ở đâu |

### Admin seed

Admin mặc định được tạo một lần duy nhất lúc backend khởi động lần đầu, từ biến môi trường `ADMIN_USERNAME` / `ADMIN_PASSWORD`. API `POST /api/users` **chặn cứng** không cho tạo thêm user có `role = "admin"` — chỉ `operator` hoặc `viewer` mới được tạo qua API.

---

## Lớp 2 — Backend: Đăng nhập và phát hành JWT

### Luồng đăng nhập — `POST /api/auth/login`

[`backend/src/routes/auth.ts`](../backend/src/routes/auth.ts):

```
Browser gửi { username, password }
        │
        ▼
SELECT id, username, password_hash, role
FROM users WHERE username = ?
        │
        ├─ User không tồn tại → bcrypt.compare(password, dummyHash) → false
        │   (chạy bcrypt dù không cần, để response time không đổi → chống timing attack dò username)
        │
        └─ User tồn tại → bcrypt.compare(password, user.password_hash)
                │
                ├─ sai → 401 INVALID_CREDENTIALS
                │
                └─ đúng → jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: "8h" })
                           res.cookie("token", token, { httpOnly: true, sameSite: "strict" })
                           res.json({ user: { id, username, role } })
```

**Điểm quan trọng:**

- `role` được **đọc từ DB** và **đóng dấu vào JWT** — client không thể tự chọn role của mình.
- Cookie được set với `httpOnly: true` → JavaScript phía trình duyệt không đọc được `document.cookie` → giảm rủi ro XSS đánh cắp token.
- `sameSite: "strict"` → trình duyệt không gửi cookie này trong request cross-site → giảm rủi ro CSRF.
- JWT chứa `{ id, username, role }` — không cần query DB ở mỗi request tiếp theo (đánh đổi: nếu admin đổi role của user trong lúc JWT còn hạn 8h, JWT cũ vẫn mang role cũ đến khi hết hạn).

---

## Lớp 3 — Backend: Middleware kiểm tra quyền

### `verifyJWT` — Xác thực danh tính

[`backend/src/middleware/verifyJWT.ts`](../backend/src/middleware/verifyJWT.ts):

```
Request đến
     │
     ▼
parseCookie(req.headers.cookie, "token")
     │
     ├─ Không có cookie → 401 NO_TOKEN
     │
     └─ Có token → jwt.verify(token, JWT_SECRET)
                    │
                    ├─ Sai chữ ký / hết hạn → 401 INVALID_TOKEN
                    │
                    └─ Hợp lệ → req.user = { id, username, role }
                                 next()
```

Middleware tự parse cookie thủ công (không dùng `cookie-parser`) để hạn chế dependency. Sau khi `verifyJWT` chạy xong, `req.user.role` là **nguồn sự thật duy nhất** về vai trò của người gọi trong suốt request — không truy vấn lại DB.

### `requireRole` — Kiểm tra vai trò

[`backend/src/middleware/rbac.ts`](../backend/src/middleware/rbac.ts):

```ts
export function requireRole(...roles: string[]) {
  return (req, res, next) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  };
}
```

`requireRole` là **factory function** — nhận danh sách role được phép, trả về middleware. Nó **phải đứng sau** `verifyJWT` trong chuỗi middleware vì cần `req.user` đã có sẵn.

**Cách khai báo trên route:**

```ts
// Chỉ admin và operator mới đăng ký được thiết bị
router.post("/register", verifyJWT, requireRole("admin", "operator"), handler);

// Chỉ admin mới xóa được thiết bị
router.delete("/:id", verifyJWT, requireRole("admin"), handler);

// Mọi người đã đăng nhập đều xem được (không cần requireRole)
router.get("/", verifyJWT, handler);
```

---

## Lớp 4 — Backend: Ma trận quyền từng route

| Route | Middleware | Ai được phép |
|-------|------------|-------------|
| `POST /api/auth/login` | — (public) | Tất cả |
| `GET /api/auth/me` | `verifyJWT` | admin, operator, viewer |
| `POST /api/devices/register` | `verifyJWT` + `requireRole("admin","operator")` | admin, operator |
| `GET /api/devices` | `verifyJWT` | admin, operator, viewer |
| `GET /api/devices/:id` | `verifyJWT` | admin, operator, viewer |
| `GET /api/devices/:id/data` | `verifyJWT` | admin, operator, viewer |
| `PATCH /api/devices/:id/status` | `verifyJWT` + `requireRole("admin","operator")` | admin, operator |
| `DELETE /api/devices/:id` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** |
| `GET /api/users` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** |
| `POST /api/users` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** |
| `PATCH /api/users/:id/password` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** |
| `DELETE /api/users/:id` | `verifyJWT` + `requireRole("admin")` | **chỉ admin** |
| `GET /api/audit-log` | `verifyJWT` | admin, operator, viewer *(nội dung lọc theo role)* |
| `GET /api/dashboard/stats` | `verifyJWT` | admin, operator, viewer |

**Lưu ý đặc biệt — Audit Log lọc nội dung theo role:**

`GET /api/audit-log` không dùng `requireRole` để chặn, thay vào đó lọc `event_type` trả về dựa trên `req.user.role`:

| Role | Event types được xem |
|------|----------------------|
| `admin` | Tất cả 10 loại |
| `operator` | 9 loại (trừ `DEVICE_DELETE`) |
| `viewer` | 4 loại: `DATA_RECV`, `DEVICE_REGISTER`, `DEVICE_BLOCKED`, `DEVICE_STATUS_CHANGE` |

→ Viewer không thể xem `GATEWAY_AUTH_FAIL`, `SENSOR_AUTH_FAIL`, `REPLAY_ATTACK`, `PRIVILEGE_ESCALATION`.

**Bảo vệ leo thang đặc quyền:**

- `POST /api/users` chặn cứng `role` chỉ nhận `["operator", "viewer"]` — không có đường API nào tạo thêm admin mới.
- Admin không tự xóa được chính mình (`CANNOT_DELETE_SELF`).
- Không ai xóa được tài khoản admin khác (`CANNOT_DELETE_ADMIN`) — đảm bảo hệ thống luôn có ít nhất một admin.

---

## Lớp 5 — Frontend: Nhận và lưu role

### `AuthProvider` — Nguồn sự thật ở phía client

Khi app khởi động (hoặc refresh trang), `AuthProvider` gọi `GET /api/auth/me` để hỏi backend:

```
App mount
    │
    ▼
GET /api/auth/me  (cookie tự động đính kèm)
    │
    ├─ 401 → user = null  (chưa đăng nhập / token hết hạn)
    │
    └─ 200 → user = { id, username, role }  → lưu vào React Context
```

Frontend **không tự decode JWT** để lấy role — luôn hỏi backend qua `/api/auth/me`. Đây là thiết kế đúng: backend là nguồn sự thật, frontend không tin vào giá trị tự tính.

### `useAuth` hook

Các component đọc thông tin user từ Context qua `useAuth()`:

```ts
const { user } = useAuth();
// user = { id: 1, username: "admin", role: "admin" } | null
```

---

## Lớp 6 — Frontend: Kiểm tra quyền hiển thị UI

### `usePermissions` hook

[`frontend/src/features/auth/hooks/usePermissions.ts`](../frontend/src/features/auth/hooks/usePermissions.ts):

```ts
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role;

  return {
    isAdmin:              role === "admin",
    isOperator:           role === "operator",
    isViewer:             role === "viewer",

    canCreateDevice:      hasRole(role, "admin", "operator"),
    canUpdateDeviceStatus:hasRole(role, "admin", "operator"),
    canDeleteDevice:      hasRole(role, "admin"),
    canDeleteAuditLog:    hasRole(role, "admin"),
  };
}
```

Hook này **phản chiếu đúng** các rule được khai báo trên backend — cùng role, cùng quyền, chỉ khác mục đích: backend dùng để từ chối request, frontend dùng để ẩn nút tránh gọi API thừa.

### Cách áp dụng trong từng trang

**DevicesPage** — nút hành động ẩn/hiện theo role:

```tsx
const { canCreateDevice, canUpdateDeviceStatus, canDeleteDevice } = usePermissions();

// Nút "Thêm thiết bị" — chỉ admin/operator
{canCreateDevice && <Button onClick={openAddModal}>Thêm thiết bị</Button>}

// Nút "Kích hoạt / Khóa" — chỉ admin/operator
{canUpdateDeviceStatus && <StatusButton device={device} />}

// Nút "Xóa" — chỉ admin
{canDeleteDevice && <DeleteButton device={device} />}
```

**UsersPage** — chặn toàn bộ trang nếu không phải admin:

```tsx
const { isAdmin } = usePermissions();

if (!isAdmin) {
  return <div>Không có quyền truy cập</div>;
}
```

**AuditPage** — ẩn Admin Actions với operator/viewer:

```tsx
const { isAdmin } = usePermissions();

{isAdmin && (
  <AdminActions>
    <DeleteSelectedButton />
    <PurgeByTypeButton />
  </AdminActions>
)}
```

---

## Lớp 7 — Frontend: Route protection với `middleware.ts`

[`frontend/middleware.ts`](../frontend/middleware.ts) chạy ở **Next.js Edge Runtime**, trước khi trang được render:

```
Browser truy cập /dashboard
        │
        ▼
middleware.ts kiểm tra: có cookie "token" không?
        │
        ├─ Không có → redirect /login
        │
        └─ Có → cho phép render trang
                (không verify chữ ký JWT — Edge Runtime không có JWT_SECRET)
```

**Giới hạn quan trọng:** Middleware chỉ kiểm tra sự tồn tại của cookie, không verify chữ ký. Một cookie giả hoặc hết hạn vẫn "qua" middleware. Bảo vệ thật xảy ra ở hai điểm:

1. `AuthProvider` gọi `/api/auth/me` khi app mount → backend trả 401 → frontend redirect về `/login`.
2. Mọi API call đều qua `verifyJWT` ở backend → bị từ chối nếu token không hợp lệ.

Tóm lại: `middleware.ts` chỉ là **UX optimization** (tránh flash trang protected rồi mới redirect), không phải security boundary.

---

## Tóm tắt: Ai kiểm soát gì

| Lớp | Chịu trách nhiệm |
|-----|-----------------|
| **Database** | Ràng buộc giá trị role hợp lệ bằng ENUM; lưu role thực tế |
| **Backend login** | Đọc role từ DB, đóng dấu vào JWT, set HttpOnly cookie |
| **`verifyJWT`** | Xác thực chữ ký JWT, giải nén `req.user` (id, username, role) |
| **`requireRole`** | Từ chối request nếu role không đủ quyền (403) |
| **Route handler** | Logic nghiệp vụ — chỉ chạy khi đã qua cả hai middleware trên |
| **`AuthProvider`** | Lưu `user.role` vào React Context từ `/api/auth/me` |
| **`usePermissions`** | Chuyển role thành boolean flags để component đọc |
| **Pages** | Ẩn/hiện UI element theo flags — **lớp UX, không phải security** |
| **`middleware.ts`** | Redirect `/login` nếu không có cookie — **UX, không phải security** |

> **Quy tắc vàng:** Frontend chỉ ẩn nút — backend mới thực sự từ chối. Không bao giờ tin vào kiểm tra role ở phía client như một rào cản bảo mật.

---

## Hạn chế đã biết

| # | Hạn chế | Hướng khắc phục nếu production |
|---|---------|--------------------------------|
| 1 | **RBAC tĩnh hard-code theo route** — thêm role hoặc đổi quyền phải sửa code | Bảng `permissions` trong DB + middleware đọc động |
| 2 | **Không có resource ownership** — operator quản lý được mọi thiết bị, không giới hạn theo `created_by` | Thêm điều kiện `AND created_by = req.user.id` hoặc ABAC engine |
| 3 | **JWT không bị revoke sớm** — đổi role hoặc xóa user không vô hiệu hóa JWT đang hoạt động | Refresh token + blacklist / token family |
| 4 | **Cookie thiếu cờ `secure`** — nếu deploy HTTPS, cookie có thể bị gửi qua HTTP khi downgrade | Thêm `secure: true` trong môi trường production |
