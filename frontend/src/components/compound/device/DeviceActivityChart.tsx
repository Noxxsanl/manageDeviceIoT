export default function DeviceActivityChart() {
  return (
    <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Activity Chart</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Realtime traffic placeholder</h3>
        </div>
        <span className="rounded-2xl bg-slate-900/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
          Simulated data
        </span>
      </div>
      <div className="grid h-72 place-items-center rounded-3xl border border-dashed border-slate-900/20 bg-slate-900/80 text-center text-slate-500">
        <div>
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-400">📈</div>
          <p className="text-sm text-slate-400">Analytics placeholder for device activity.</p>
        </div>
      </div>
    </div>
  );
}
