"use client";

import { useState } from "react";
import { Plus, Trash2, KeyRound, ShieldCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/package/features/useAuth";
import { useUsers } from "@/package/features/useUsers";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import type { ApiUser } from "@/package/schema/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
  viewer: "Xem",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-sky-500/15 text-sky-300",
  operator: "bg-violet-500/15 text-violet-300",
  viewer: "bg-slate-700/60 text-slate-300",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PasswordModalProps = {
  user: ApiUser;
  onClose: () => void;
  onSave: (password: string) => Promise<void>;
};

function PasswordModal({ user, onClose, onSave }: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setLoading(true);
    try {
      await onSave(password);
      onClose();
    } catch {
      setError("Lỗi khi đổi mật khẩu. Thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-white">Đổi mật khẩu</h2>
        <p className="mb-5 text-sm text-slate-400">
          Tài khoản: <span className="font-mono text-slate-200">{user.username}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Mật khẩu mới
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              placeholder="Ít nhất 6 ký tự"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Xác nhận mật khẩu
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
              placeholder="Nhập lại mật khẩu"
            />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-sky-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
            >
              {loading ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type CreateFormProps = {
  onCreate: (username: string, password: string, role: "operator" | "viewer") => Promise<void>;
};

function CreateUserForm({ onCreate }: CreateFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"operator" | "viewer">("operator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!username || !password) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }
    if (username.length < 3) {
      setError("Tên đăng nhập tối thiểu 3 ký tự.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    setLoading(true);
    try {
      await onCreate(username, password, role);
      setUsername("");
      setPassword("");
      setRole("operator");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const status = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (status === "USERNAME_TAKEN") {
        setError("Tên đăng nhập đã tồn tại.");
      } else {
        setError("Tạo tài khoản thất bại. Thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/95 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-emerald-400" />
        <h2 className="text-sm font-semibold text-slate-200">Tạo tài khoản mới</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              placeholder="operator01"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              placeholder="Ít nhất 6 ký tự"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Vai trò
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "operator" | "viewer")}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="operator">Vận hành</option>
              <option value="viewer">Xem</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">Tài khoản đã tạo thành công.</p>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {loading ? "Đang tạo…" : "Tạo tài khoản"}
        </button>
      </form>
    </div>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const { users, isLoading, isError, createUser, changePassword, deleteUser } = useUsers();
  const [pwTarget, setPwTarget] = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-rose-400" />
          <h2 className="text-xl font-semibold text-white">Không có quyền truy cập</h2>
          <p className="mt-2 text-slate-400">Chỉ admin mới có thể xem trang này.</p>
        </div>
      </div>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await deleteUser(deleteTarget.id);
    } finally {
      setActionLoading(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Admin</p>
        <h1 className="text-4xl font-semibold text-white">Quản lý tài khoản</h1>
        <p className="mt-2 text-slate-400">
          Tạo, phân quyền và quản lý tài khoản dashboard.
        </p>
      </div>

      {/* Create form */}
      <div className="mb-6">
        <CreateUserForm onCreate={createUser} />
      </div>

      {/* Users table */}
      <div className="overflow-hidden rounded-4xl border border-slate-800 bg-slate-950/95 shadow-lg shadow-slate-950/20">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <span className="text-sm text-slate-400">{users.length} tài khoản</span>
          {isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Đang tải…
            </span>
          )}
          {isError && (
            <span className="text-xs text-rose-400">Lỗi kết nối backend</span>
          )}
        </div>

        {!isError && users.length === 0 && !isLoading ? (
          <div className="px-6 py-12 text-center text-slate-500">Chưa có tài khoản nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="bg-slate-900/90 text-slate-400">
                <tr>
                  <th className="px-4 py-4 font-medium">Tên đăng nhập</th>
                  <th className="px-4 py-4 font-medium">Vai trò</th>
                  <th className="px-4 py-4 font-medium">Ngày tạo</th>
                  <th className="px-4 py-4 font-medium">Đăng nhập gần nhất</th>
                  <th className="px-4 py-4 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-800/60 transition hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-4 font-medium text-white">
                      {u.username}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">
                          Bạn
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ROLE_STYLES[u.role] ?? ""
                        }`}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">
                      {formatDate(u.last_login)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPwTarget(u)}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-700/50 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Đổi mật khẩu
                        </button>
                        {u.role !== "admin" && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(u)}
                            className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                          >
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

      {/* Password modal */}
      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSave={(pw) => changePassword(pwTarget.id, pw)}
        />
      )}

      {/* Delete confirm */}
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
