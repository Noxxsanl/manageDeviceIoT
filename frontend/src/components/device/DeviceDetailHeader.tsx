import type { Device } from "@/types/device";

type DeviceDetailHeaderProps = {
  device: Device;
};

export default function DeviceDetailHeader({ device }: DeviceDetailHeaderProps) {
  return (
    <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/30">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Device Overview</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">{device.name}</h2>
          <p className="mt-2 text-sm text-slate-400">{device.deviceId}</p>
        </div>
        <div className="inline-flex items-center gap-3 rounded-3xl bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">{device.status}</span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">{device.role}</span>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Last Seen</p>
          <p className="mt-2 text-lg font-semibold text-white">{device.lastSeen}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Firmware</p>
          <p className="mt-2 text-lg font-semibold text-white">{device.firmwareVersion}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Gateway</p>
          <p className="mt-2 text-lg font-semibold text-white">{device.gateway}</p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Security Status</p>
          <p className="mt-2 text-lg font-semibold text-white">{device.securityStatus}</p>
        </div>
      </div>
    </div>
  );
}
