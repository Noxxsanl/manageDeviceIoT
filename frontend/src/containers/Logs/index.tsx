import LogTable from "@/components/compound/log/LogTable";

export default function Logs() {
  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Logs</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Security &amp; event feed</h1>
          <p className="mt-1 text-sm text-gray-500">
            View the latest device events, warnings and security notifications in real time.
          </p>
        </div>
        <button className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
          Filter Logs
        </button>
      </div>

      <LogTable logs={[]} />
    </div>
  );
}
