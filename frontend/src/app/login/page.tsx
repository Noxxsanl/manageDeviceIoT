"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AUTH_ROUTES } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  console.log("[render] app/login/page.tsx mounted");

  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username, password, remember);
    } catch (err) {
      setError((err as Error).message);
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
            <p className="mt-6 text-sm uppercase tracking-[0.3em] text-slate-500">Admin access</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Sign in</h1>
            <p className="mt-2 text-sm text-slate-400">Use your admin account to access the IoT Manager dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-200">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                placeholder="admin"
                aria-invalid={Boolean(error)}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                placeholder="123456"
                aria-invalid={Boolean(error)}
                required
              />
            </div>

            <div className="flex items-center justify-between gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500"
                />
                Remember me
              </label>
              <Link href={AUTH_ROUTES.forgotPassword} className="font-medium text-sky-300 transition hover:text-sky-200">
                Forgot password?
              </Link>
            </div>

            {error ? (
              <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/20">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>

            <p className="text-center text-xs text-slate-500">
              Demo: <span className="font-semibold text-slate-300">admin</span> /{" "}
              <span className="font-semibold text-slate-300">123456</span>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
