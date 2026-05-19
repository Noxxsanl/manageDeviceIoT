import Link from "next/link";
import { notFound } from "next/navigation";
import { devices } from "@/mock/devices";
import { logs } from "@/mock/logs";
import DeviceActivityChart from "@/components/device/DeviceActivityChart";
import DeviceDetailHeader from "@/components/device/DeviceDetailHeader";
import DeviceMetrics from "@/components/device/DeviceMetrics";
import DeviceSecurityPanel from "@/components/device/DeviceSecurityPanel";

type DeviceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeviceDetailPage({ params }: DeviceDetailPageProps) {
  const { id } = await params;
  const device = devices.find((item) => item.id === id);

  if (!device) {
    notFound();
  }

  const deviceLogs = logs.filter((log) => log.deviceId === device.deviceId).slice(0, 5);

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Link href="/devices" className="text-sm text-slate-400 hover:text-slate-100">
            {"<- Back to Devices"}
          </Link>
          <h1 className="text-4xl font-semibold text-white">{device.name}</h1>
          <p className="text-slate-400">
            Detailed operational and security view for the selected device.
          </p>
        </div>
        <div className="rounded-3xl bg-slate-900/90 px-4 py-3 text-sm text-slate-300">
          Device #{device.deviceId}
        </div>
      </div>

      {device.isUnderAttack ? (
        <div className="mb-6 rounded-[2rem] border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-sm text-rose-200">
          <p className="font-semibold text-rose-100">Attack warning detected</p>
          <p className="mt-2 text-slate-200">
            Immediate review recommended for security threats and authentication anomalies.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <DeviceDetailHeader device={device} />
          <DeviceMetrics metrics={device.metrics} />
          <DeviceActivityChart />
        </div>
        <div className="space-y-5">
          <DeviceSecurityPanel device={device} />
          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recent device logs</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Activity snapshot</h3>
              </div>
            </div>
            <div className="space-y-4 text-sm text-slate-300">
              {deviceLogs.map((log) => (
                <div key={log.id} className="rounded-3xl bg-slate-900/90 p-4">
                  <p className="font-semibold text-white">{log.event}</p>
                  <p className="mt-1 text-slate-400">{log.message}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">{log.timestamp}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
