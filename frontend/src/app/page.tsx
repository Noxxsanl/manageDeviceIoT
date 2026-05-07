import DeviceGrid from "@/components/DeviceGrid";
import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import Topbar from "@/components/Topbar";
import { mockDevices } from "@/data/mockDevices";

export default function Home() {
  const totalDevices = mockDevices.length;
  const onlineDevices = mockDevices.filter((device) => device.status === "online").length;
  const offlineDevices = totalDevices - onlineDevices;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-400 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <Sidebar />
          <main className="flex-1">
            <Topbar />
            <div className="grid gap-5 sm:grid-cols-3">
              <StatCard
                title="Total Devices"
                value={totalDevices}
                description="All managed IoT devices in the network."
                accentClass="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <StatCard
                title="Online Devices"
                value={onlineDevices}
                description="Devices currently reporting active connection."
                accentClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              />
              <StatCard
                title="Offline Devices"
                value={offlineDevices}
                description="Devices that have lost connection recently."
                accentClass="bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
              />
            </div>
            <section className="mt-8">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Device status grid</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Live device overview</h2>
                </div>
                <div className="inline-flex items-center justify-center rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Mock data only
                </div>
              </div>
              <DeviceGrid devices={mockDevices} />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
