import type { Device } from "@/types/device";

const statusClasses: Record<Device["status"], string> = {
  online: "bg-emerald-500/10 text-emerald-500",
  offline: "bg-rose-500/10 text-rose-500",
};

type DeviceCardProps = {
  device: Device;
};

export default function DeviceCard({ device }: DeviceCardProps) {
  return (
    <article className="rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-700/80 dark:bg-slate-900/90">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-slate-950 dark:text-white">{device.name}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{device.deviceId}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusClasses[device.status]}`}>{device.status}</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/80">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Temperature</p>
          <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{device.temperature.toFixed(1)}°C</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/80">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Humidity</p>
          <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{device.humidity}%</p>
        </div>
      </div>
      <div className="mt-6 border-t border-slate-200/80 pt-4 text-sm text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
        <p className="font-medium text-slate-700 dark:text-slate-200">Last seen</p>
        <p className="mt-1">{device.lastSeen}</p>
      </div>
    </article>
  );
}
