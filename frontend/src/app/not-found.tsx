import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-900/95 p-8 text-center shadow-2xl shadow-slate-950/40 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-500/30">
          <svg
            className="h-7 w-7 text-sky-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>

        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-slate-500">
          Lỗi 404
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Không tìm thấy trang
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.
        </p>

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
