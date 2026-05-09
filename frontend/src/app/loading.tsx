export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="rounded-3xl border border-slate-800/80 bg-slate-900/95 p-8 text-center shadow-xl shadow-slate-950/30">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Loading</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">Preparing page...</h1>
      </div>
    </main>
  );
}
