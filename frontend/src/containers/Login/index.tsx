"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/package/features/useAuth";
import { FetchError } from "@/package/services/api";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
    } catch (err) {
      const status = err instanceof FetchError ? err.status : 0;
      if (status === 401) {
        setError("Sai tên đăng nhập hoặc mật khẩu.");
      } else if (status === 429) {
        setError("Quá nhiều lần thử. Vui lòng đợi và thử lại.");
      } else {
        setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/40 sm:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500 text-lg font-semibold text-white shadow-xl shadow-sky-950/30">
              IoT
            </div>
            <p className="mt-6 text-sm uppercase tracking-[0.3em] text-slate-500">
              Quản trị hệ thống
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Đăng nhập</h1>
            <p className="mt-2 text-sm text-slate-400">
              Truy cập vào Dashboard quản lý thiết bị IoT.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-200">
                Tên đăng nhập
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                placeholder="admin"
                aria-invalid={Boolean(error)}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">
                Mật khẩu
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                placeholder="••••••••"
                aria-invalid={Boolean(error)}
                required
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/20"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
