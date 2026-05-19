import type { LogEntry } from "@/types/log";

type LogTableProps = {
  logs: LogEntry[];
};

const levelStyles: Record<LogEntry["level"], string> = {
  INFO: "bg-sky-500/10 text-sky-300",
  WARNING: "bg-amber-500/10 text-amber-300",
  ERROR: "bg-rose-500/10 text-rose-300",
  SECURITY: "bg-violet-500/10 text-violet-300",
};

export default function LogTable({ logs }: LogTableProps) {
  return (
    <div className="overflow-hidden rounded-4xl border border-slate-900/10 bg-slate-950/95 shadow-lg shadow-slate-950/20">
      <div className="border-b border-slate-900/10 px-6 py-4 text-sm text-slate-400">System events log</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/90 text-slate-400">
            <tr>
              <th className="px-4 py-4">Time</th>
              <th className="px-4 py-4">Device ID</th>
              <th className="px-4 py-4">Event</th>
              <th className="px-4 py-4">Level</th>
              <th className="px-4 py-4">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-900/10 hover:bg-slate-900/80">
                <td className="px-4 py-4 text-slate-300">{log.timestamp}</td>
                <td className="px-4 py-4 text-slate-300">{log.deviceId}</td>
                <td className="px-4 py-4 text-slate-300">{log.event}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${levelStyles[log.level]}`}>
                    {log.level}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-400">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
