"use client";

import { notifications } from "@/mock/notifications";
import StatsCard from "@/components/dashboard/StatsCard";
import { useDevices } from "@/contexts/DevicesContext";
import { useAddDevice } from "@/contexts/AddDeviceContext";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  console.log("[render] app/(admin)/dashboard/page.tsx mounted");

  const { user } = useAuth();
  const { openModal } = useAddDevice();
  const { devices } = useDevices();

  const onlineDevices = devices.filter((device) => device.status === "online").length;
  const offlineDevices = devices.filter((device) => device.status === "offline").length;
  const alertDevices = devices.filter((device) => device.isUnderAttack || device.securityStatus !== "Normal").length;
  const averageBattery = Math.round(devices.reduce((sum, device) => sum + device.metrics.battery, 0) / devices.length);

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
      <div className="mb-6 flex flex-col gap-3">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Dashboard</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-white">Welcome back, {user?.username ?? "admin"}</h1>
            <p className="max-w-3xl text-slate-400">Clean SaaS admin panel for IoT device management, alerts and security monitoring.</p>
          </div>
          <button onClick={openModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md">
            Add Device
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <StatsCard
          title="Total devices"
          value={devices.length}
          subtitle="Connected fleet across all gateways."
          accent="bg-sky-500/10 text-sky-300"
          icon={<span className="text-lg">📡</span>}
        />
        <StatsCard
          title="Online devices"
          value={onlineDevices}
          subtitle="Devices currently connected and reporting data."
          accent="bg-emerald-500/10 text-emerald-300"
          icon={<span className="text-lg">✅</span>}
        />
        <StatsCard
          title="Offline devices"
          value={offlineDevices}
          subtitle="Devices that lost connectivity recently."
          accent="bg-slate-400/10 text-slate-200"
          icon={<span className="text-lg">⚠️</span>}
        />
        <StatsCard
          title="Security alerts"
          value={alertDevices}
          subtitle="Devices requiring immediate review."
          accent="bg-rose-500/10 text-rose-300"
          icon={<span className="text-lg">🚨</span>}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Health overview</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Device resiliency</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-900/90 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Average battery</p>
              <p className="mt-3 text-3xl font-semibold text-white">{averageBattery}%</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Devices online</p>
              <p className="mt-3 text-3xl font-semibold text-white">{onlineDevices}</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Devices offline</p>
              <p className="mt-3 text-3xl font-semibold text-white">{offlineDevices}</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Alerted devices</p>
              <p className="mt-3 text-3xl font-semibold text-white">{alertDevices}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Security preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Recent threat alerts</h3>
            </div>
            <span className="rounded-2xl bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
              Live
            </span>
          </div>
          <div className="mt-6 space-y-4">
            {notifications.map((note) => (
              <div key={note.id} className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{note.title}</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{note.time}</span>
                </div>
                <p className="mt-2 text-slate-400">{note.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Activity</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recent events</h3>
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <div className="rounded-3xl bg-slate-900/90 p-4">
              <p className="font-semibold text-white">Parking Gate Beacon</p>
              <p className="mt-2 text-slate-400">Attack detected and mitigation policies triggered.</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-4">
              <p className="font-semibold text-white">Warehouse Sensor</p>
              <p className="mt-2 text-slate-400">Offline status detected after loss of signal.</p>
            </div>
            <div className="rounded-3xl bg-slate-900/90 p-4">
              <p className="font-semibold text-white">Server Rack Monitor</p>
              <p className="mt-2 text-slate-400">Stable connection and telemetry flow continues.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
