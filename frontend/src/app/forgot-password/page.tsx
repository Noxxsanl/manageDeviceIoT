"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AUTH_ROUTES } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(() => {
      setIsSubmitting(false);
      setSuccess(true);
    }, 300);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      {success ? (
        <div className="fixed right-4 top-4 z-50 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 shadow-xl shadow-slate-950/30">
          Password reset link sent
        </div>
      ) : null}

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/40 sm:p-10">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Account recovery</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Forgot password</h1>
            <p className="mt-2 text-sm text-slate-400">Enter your email and we will send a mock reset link.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                placeholder="admin@example.com"
                required
              />
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
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <Link
            href={AUTH_ROUTES.login}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl border border-slate-800 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/70"
          >
            Back to Login
          </Link>
        </section>
      </div>
    </main>
  );
}
