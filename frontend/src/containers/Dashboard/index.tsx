"use client";

import { Server, Cpu, Wifi, Radio } from "lucide-react";
import StatsCard from "@/components/compound/dashboard/StatsCard";
import { useDevices } from "@/providers/DevicesContext";
import { useAddDevice } from "@/providers/AddDeviceContext";
import { useAuth } from "@/package/features/useAuth";
import { usePermissions } from "@/package/features/usePermissions";
import { useDashboardStats } from "@/package/features/useDashboardStats";

export default function Dashboard() {
  const { user } = useAuth();
  const { canCreateDevice } = usePermissions();
  const { openModal } = useAddDevice();
  const { devices } = useDevices();
  const { stats, isLoading } = useDashboardStats();

  const alertDevices = devices.filter(
    (device) => device.isUnderAttack || device.securityStatus !== "Normal"
  ).length;

  const totalGateway = stats?.total_gateway ?? 0;
  const totalSensor = stats?.total_sensor ?? 0;
  const gatewayOnline = stats?.gateway_online ?? 0;
  const sensorOnline = stats?.sensor_online ?? 0;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-white">
              Welcome back, {user?.username ?? "admin"}
            </h1>
            <p className="max-w-3xl text-slate-400">
              IoT device management, alerts and security monitoring.
            </p>
          </div>
          {canCreateDevice && (
            <button
              onClick={openModal}
              className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Add Device
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <StatsCard
          title="Total Gateway"
          value={isLoading ? "—" : totalGateway}
          subtitle="Gateway nodes registered in the system."
          accent="bg-sky-500/10 text-sky-300"
          icon={<Server className="h-5 w-5" />}
        />
        <StatsCard
          title="Total Sensor"
          value={isLoading ? "—" : totalSensor}
          subtitle="Sensor nodes registered in the system."
          accent="bg-violet-500/10 text-violet-300"
          icon={<Cpu className="h-5 w-5" />}
        />
        <StatsCard
          title="Gateway Online"
          value={isLoading ? "—" : gatewayOnline}
          subtitle="Gateways connected and reporting in the last 60s."
          accent="bg-emerald-500/10 text-emerald-300"
          icon={<Wifi className="h-5 w-5" />}
        />
        <StatsCard
          title="Sensor Online"
          value={isLoading ? "—" : sensorOnline}
          subtitle="Sensors connected and reporting in the last 60s."
          accent="bg-amber-500/10 text-amber-300"
          icon={<Radio className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Health overview</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Device resiliency</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { label: "Total Gateway", value: isLoading ? "—" : totalGateway },
              { label: "Gateway online", value: isLoading ? "—" : gatewayOnline },
              { label: "Total Sensor", value: isLoading ? "—" : totalSensor },
              { label: "Sensor online", value: isLoading ? "—" : sensorOnline },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-3xl bg-slate-900/90 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Security preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Recent threat alerts</h3>
            </div>
            <span className="rounded-2xl bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
              Live
            </span>
          </div>
          <div className="mt-6">
            {alertDevices > 0 ? (
              <div className="rounded-3xl bg-rose-500/10 p-4 text-sm text-rose-300">
                <p className="font-semibold">{alertDevices} device(s) under threat</p>
                <p className="mt-1 text-rose-400/70">Check the Devices page for details.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active threat alerts.</p>
            )}
          </div>
        </div>

        <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Activity</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recent events</h3>
          <div className="mt-6">
            <p className="text-sm text-slate-500">No recent events to display.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
