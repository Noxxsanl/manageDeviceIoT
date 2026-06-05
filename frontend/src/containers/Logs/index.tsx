import LogTable from "@/components/compound/log/LogTable";

export default function Logs() {
  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Logs</p>
          <h1 className="text-4xl font-semibold text-white">Security &amp; event feed</h1>
          <p className="mt-2 text-slate-400">
            View the latest device events, warnings and security notifications in real time.
          </p>
        </div>
        <button className="inline-flex items-center justify-center rounded-3xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
          Filter Logs
        </button>
      </div>

      <LogTable logs={[]} />
    </div>
  );
}
