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
    (d) => d.isUnderAttack || d.securityStatus !== "Normal"
  ).length;

  const totalGateway  = stats?.total_gateway  ?? 0;
  const totalSensor   = stats?.total_sensor   ?? 0;
  const gatewayOnline = stats?.gateway_online ?? 0;
  const sensorOnline  = stats?.sensor_online  ?? 0;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">

      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Welcome back, {user?.username ?? "admin"}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            IoT device management, alerts and security monitoring.
          </p>
        </div>
        {canCreateDevice && (
          <button onClick={openModal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            + Add Device
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 xl:grid-cols-4">
        <StatsCard title="Total Gateway"  value={isLoading ? "—" : totalGateway}
          subtitle="Gateway nodes registered in the system."
          accent="bg-blue-50 text-blue-600" iconBg="bg-blue-50"
          icon={<Server className="h-4 w-4 text-blue-600" />} />
        <StatsCard title="Total Sensor"   value={isLoading ? "—" : totalSensor}
          subtitle="Sensor nodes registered in the system."
          accent="bg-violet-50 text-violet-600" iconBg="bg-violet-50"
          icon={<Cpu className="h-4 w-4 text-violet-600" />} />
        <StatsCard title="Gateway Online" value={isLoading ? "—" : gatewayOnline}
          subtitle="Gateways connected and reporting in the last 60s."
          accent="bg-emerald-50 text-emerald-600" iconBg="bg-emerald-50"
          icon={<Wifi className="h-4 w-4 text-emerald-600" />} />
        <StatsCard title="Sensor Online"  value={isLoading ? "—" : sensorOnline}
          subtitle="Sensors connected and reporting in the last 60s."
          accent="bg-amber-50 text-amber-600" iconBg="bg-amber-50"
          icon={<Radio className="h-4 w-4 text-amber-600" />} />
      </div>

      {/* Detail cards */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">

        {/* Device resiliency */}
        <div className="rounded-xl border border-[#E5EAF0] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Health overview</p>
          <h2 className="mt-1.5 text-base font-semibold text-gray-900">Device resiliency</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { label: "Total Gateway",  value: isLoading ? "—" : totalGateway },
              { label: "Gateway online", value: isLoading ? "—" : gatewayOnline },
              { label: "Total Sensor",   value: isLoading ? "—" : totalSensor },
              { label: "Sensor online",  value: isLoading ? "—" : sensorOnline },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-400">{label}</p>
                <p className="mt-1.5 text-xl font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Security preview */}
        <div className="rounded-xl border border-[#E5EAF0] bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Security preview</p>
              <h3 className="mt-1.5 text-base font-semibold text-gray-900">Recent threat alerts</h3>
            </div>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Live</span>
          </div>
          <div className="mt-4">
            {alertDevices > 0 ? (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">{alertDevices} thiết bị đang bị tấn công</p>
                <p className="mt-1 text-red-500">Kiểm tra trang Devices để biết chi tiết.</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No active threat alerts.</p>
            )}
          </div>
        </div>

        {/* Recent events */}
        <div className="rounded-xl border border-[#E5EAF0] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Activity</p>
          <h3 className="mt-1.5 text-base font-semibold text-gray-900">Recent events</h3>
          <div className="mt-4">
            <p className="text-sm text-gray-400">No recent events to display.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
