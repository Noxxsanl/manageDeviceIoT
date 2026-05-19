"use client";

import { notifications } from "@/mock/notifications";
import StatsCard from "@/components/dashboard/StatsCard";
import { useDevices } from "@/contexts/DevicesContext";
import { useAddDevice } from "@/contexts/AddDeviceContext";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user } = useAuth();
  const { openModal } = useAddDevice();
  const { devices } = useDevices();

  const onlineDevices = devices.filter((device) => device.status === "online").length;
  const offlineDevices = devices.filter((device) => device.status === "offline").length;
  const alertDevices = devices.filter((device) => device.isUnderAttack || device.securityStatus !== "Normal").length;
  const averageBattery = devices.length
    ? Math.round(devices.reduce((sum, device) => sum + device.metrics.battery, 0) / devices.length)
    : 0;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-6 flex flex-col gap-3">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Dashboard</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-white">
              Welcome back, {user?.username ?? "admin"}
            </h1>
            <p className="max-w-3xl text-slate-400">
              IoT device management, alerts and security monitoring.
            </p>
          </div>
          <button
            onClick={openModal}
            className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
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
        <div className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Health overview</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Device resiliency</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { label: "Average battery", value: `${averageBattery}%` },
              { label: "Devices online", value: onlineDevices },
              { label: "Devices offline", value: offlineDevices },
              { label: "Alerted devices", value: alertDevices },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-3xl bg-slate-900/90 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-6">
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

        <div className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Activity</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recent events</h3>
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            {[
              { name: "Parking Gate Beacon", event: "Attack detected and mitigation policies triggered." },
              { name: "Warehouse Sensor", event: "Offline status detected after loss of signal." },
              { name: "Server Rack Monitor", event: "Stable connection and telemetry flow continues." },
            ].map(({ name, event }) => (
              <div key={name} className="rounded-3xl bg-slate-900/90 p-4">
                <p className="font-semibold text-white">{name}</p>
                <p className="mt-2 text-slate-400">{event}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
