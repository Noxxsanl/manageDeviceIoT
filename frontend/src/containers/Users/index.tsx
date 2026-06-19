"use client";

import { useState } from "react";
import {
  Plus, Trash2, KeyRound, ShieldCheck, RefreshCw,
  Users as UsersIcon, Shield, Wrench, Eye, X, Lock,
} from "lucide-react";
import { useAuth } from "@/package/features/useAuth";
import { useUsers } from "@/package/features/useUsers";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import type { ApiUser } from "@/package/schema/api";

/* ─── constants ──────────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
  viewer: "Xem",
};

const ROLE_DOT: Record<string, string> = {
  admin:    "bg-blue-500",
  operator: "bg-violet-500",
  viewer:   "bg-gray-400",
};

const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  operator: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  viewer:   "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

const AVATAR_BG: Record<string, string> = {
  admin:    "bg-blue-600",
  operator: "bg-violet-600",
  viewer:   "bg-gray-500",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Avatar({ username, role }: { username: string; role: string }) {
  const bg = AVATAR_BG[role] ?? "bg-gray-500";
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg} text-sm font-bold uppercase text-white`}>
      {username[0]}
    </div>
  );
}

/* ─── Password modal ─────────────────────────────────────── */

function PasswordModal({ user, onClose, onSave }: {
  user: ApiUser;
  onClose: () => void;
  onSave: (pw: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Mật khẩu tối thiểu 6 ký tự."); return; }
    if (password !== confirm)  { setError("Mật khẩu xác nhận không khớp."); return; }
    setLoading(true);
    try { await onSave(password); onClose(); }
    catch { setError("Lỗi khi đổi mật khẩu. Thử lại."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-lg">
        {/* header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <Lock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Đổi mật khẩu</p>
              <p className="text-xs text-gray-400 font-mono">{user.username}</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={15} />
          </button>
        </div>
        {/* body */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Mật khẩu mới</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
              placeholder="Ít nhất 6 ký tự"
              className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Xác nhận mật khẩu</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-10 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
              {loading ? "Đang lưu…" : "Lưu mật khẩu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Create user modal ──────────────────────────────────── */

function CreateUserModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (username: string, password: string, role: "operator" | "viewer") => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole]         = useState<"operator" | "viewer">("operator");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  if (!open) return null;

  function reset() {
    setUsername(""); setPassword(""); setRole("operator");
    setError(""); setLoading(false);
  }

  function handleClose() { reset(); onClose(); }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) { setError("Vui lòng điền đầy đủ thông tin."); return; }
    if (username.length < 3)    { setError("Tên đăng nhập tối thiểu 3 ký tự."); return; }
    if (password.length < 6)    { setError("Mật khẩu tối thiểu 6 ký tự."); return; }
    setLoading(true);
    try {
      await onCreate(username, password, role);
      reset(); onClose();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(code === "USERNAME_TAKEN" ? "Tên đăng nhập đã tồn tại." : "Tạo tài khoản thất bại. Thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const roles: { value: "operator" | "viewer"; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    { value: "operator", label: "Vận hành",  desc: "Quản lý thiết bị",  icon: <Wrench size={15} />,  color: "violet" },
    { value: "viewer",   label: "Xem",        desc: "Chỉ đọc dữ liệu",  icon: <Eye size={15} />,     color: "gray"   },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-white shadow-lg">
        {/* header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <UsersIcon className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Thêm thành viên</p>
              <p className="text-xs text-gray-400">Tạo tài khoản truy cập mới</p>
            </div>
          </div>
          <button type="button" onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={15} />
          </button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-6 py-6">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tên đăng nhập
              </label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="VD: operator01"
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Mật khẩu
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Vai trò
              </label>
              <div className="grid grid-cols-2 gap-3">
                {roles.map((r) => (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)}
                    className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition
                      ${role === r.value
                        ? r.color === "violet"
                          ? "border-violet-500 bg-violet-50"
                          : "border-gray-400 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition
                      ${role === r.value
                        ? r.color === "violet" ? "bg-violet-100 text-violet-600" : "bg-gray-200 text-gray-600"
                        : "bg-gray-100 text-gray-400"
                      }`}>
                      {r.icon}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${role === r.value ? (r.color === "violet" ? "text-violet-700" : "text-gray-700") : "text-gray-600"}`}>
                        {r.label}
                      </p>
                      <p className="text-xs text-gray-400">{r.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-3">
            <button type="button" onClick={handleClose}
              className="h-10 rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              Huỷ
            </button>
            <button type="submit" disabled={loading}
              className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
              {loading
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Đang tạo…</>
                : <><Plus size={15} />Tạo tài khoản</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */

export default function Users() {
  const { user: currentUser } = useAuth();
  const { users, isLoading, isError, createUser, changePassword, deleteUser } = useUsers();
  const [pwTarget, setPwTarget]       = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen]   = useState(false);

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h2 className="text-xl font-semibold text-gray-900">Không có quyền truy cập</h2>
          <p className="mt-2 text-gray-500">Chỉ admin mới có thể xem trang này.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try { await deleteUser(deleteTarget.id); }
    finally { setActionLoading(false); setDeleteTarget(null); }
  };

  const adminCount    = users.filter((u) => u.role === "admin").length;
  const operatorCount = users.filter((u) => u.role === "operator").length;
  const viewerCount   = users.filter((u) => u.role === "viewer").length;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">

      {/* ── Page header ── */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Quản lý thành viên</h1>
          <p className="mt-1 text-sm text-gray-500">Tạo, phân quyền và quản lý tài khoản hệ thống.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Thêm thành viên
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Tổng tài khoản", value: users.length, icon: <UsersIcon size={16} />, bg: "bg-blue-50",   text: "text-blue-600" },
          { label: "Quản trị viên",  value: adminCount,    icon: <Shield size={16} />, bg: "bg-blue-50",   text: "text-blue-600" },
          { label: "Vận hành",       value: operatorCount, icon: <Wrench size={16} />, bg: "bg-violet-50", text: "text-violet-600" },
          { label: "Xem",            value: viewerCount,   icon: <Eye size={16} />,    bg: "bg-gray-100",  text: "text-gray-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#E5EAF0] bg-white p-4">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.bg} ${s.text}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
            <p className="mt-0.5 text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Users table ── */}
      <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">

        {/* table toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">{users.length} thành viên</p>
            {isLoading && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <RefreshCw className="h-3 w-3 animate-spin" /> Đang tải…
              </span>
            )}
            {isError && <span className="text-xs text-red-500">Lỗi kết nối</span>}
          </div>
        </div>

        {!isError && users.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UsersIcon className="mb-3 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">Chưa có tài khoản nào</p>
            <button onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition">
              <Plus size={13} /> Thêm thành viên đầu tiên
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thành viên</th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Vai trò</th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Ngày tạo</th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Hoạt động gần nhất</th>
                  <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="transition hover:bg-gray-50/60">

                    {/* member column */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar username={u.username} role={u.role} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{u.username}</p>
                            {u.id === currentUser?.id && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-200">
                                Bạn
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">ID #{u.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* role */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE[u.role] ?? ""}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[u.role] ?? "bg-gray-400"}`} />
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>

                    {/* dates */}
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.last_login)}</td>

                    {/* actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPwTarget(u)}
                          title="Đổi mật khẩu"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                          <KeyRound className="h-3.5 w-3.5" />
                          Mật khẩu
                        </button>
                        {u.role !== "admin" && u.id !== currentUser?.id && (
                          <button type="button" onClick={() => setDeleteTarget(u)}
                            title="Xoá tài khoản"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-100">
                            <Trash2 className="h-3.5 w-3.5" />
                            Xoá
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createUser}
      />

      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSave={(pw) => changePassword(pwTarget.id, pw)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xoá tài khoản"
        description={`Bạn chắc chắn muốn xoá tài khoản "${deleteTarget?.username}"? Hành động này không thể hoàn tác.`}
        confirmLabel={actionLoading ? "Đang xoá…" : "Xoá"}
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => !actionLoading && setDeleteTarget(null)}
      />
    </div>
  );
}
