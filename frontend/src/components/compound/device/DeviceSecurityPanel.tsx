import type { Device } from "@/package/schema/device";

type DeviceSecurityPanelProps = {
  device: Device;
};

export default function DeviceSecurityPanel({ device }: DeviceSecurityPanelProps) {
  return (
    <div className="rounded-[2rem] border border-slate-900/10 bg-rose-950/95 p-6 shadow-lg shadow-rose-950/10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-rose-300">Security Panel</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Threat detection</h3>
        </div>
        {device.isUnderAttack ? (
          <span className="rounded-2xl bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
            Active alert
          </span>
        ) : (
          <span className="rounded-2xl bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            No threats
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl bg-slate-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Token Status</p>
          <p className="mt-3 text-lg font-semibold text-white">{device.token ? "Active" : "Unavailable"}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Failed Attempts</p>
          <p className="mt-3 text-lg font-semibold text-white">{device.isUnderAttack ? "7" : "1"}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Last Event</p>
          <p className="mt-3 text-lg font-semibold text-white">{device.isUnderAttack ? "Attack signature detected" : "System nominal"}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Alert Level</p>
          <p className="mt-3 text-lg font-semibold text-white">{device.securityStatus}</p>
        </div>
      </div>
    </div>
  );
}
