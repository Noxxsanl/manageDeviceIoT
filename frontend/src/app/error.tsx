"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-900/95 p-8 text-center shadow-2xl shadow-slate-950/40 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-500/30">
          <svg
            className="h-7 w-7 text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-slate-500">
          Đã xảy ra lỗi
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Có gì đó không ổn
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {error.message || "Lỗi không xác định. Vui lòng thử lại hoặc liên hệ quản trị viên."}
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-600">
            Mã lỗi: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Thử lại
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
