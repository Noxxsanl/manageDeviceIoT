import DeviceTable from "@/components/device/DeviceTable";
import { devices } from "@/mock/devices";

export default function DevicesPage() {
  const onlineCount = devices.filter((device) => device.status === "online").length;
  const alertCount = devices.filter((device) => device.securityStatus !== "Normal").length;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Devices</p>
          <h1 className="text-4xl font-semibold text-white">Fleet registry</h1>
          <p className="mt-2 text-slate-400">Manage device status, token visibility and security posture in a single table.</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          Add Device
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Online devices</p>
          <p className="mt-3 text-4xl font-semibold text-white">{onlineCount}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Security alerts</p>
          <p className="mt-3 text-4xl font-semibold text-white">{alertCount}</p>
        </div>
      </div>

      <DeviceTable devices={devices} />
    </div>
  );
}
