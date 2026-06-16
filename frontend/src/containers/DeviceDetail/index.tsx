"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Server,
  Cpu,
  Lock,
  Unlock,
  Trash2,
  MapPin,
  Hash,
  Activity,
  RefreshCw,
} from "lucide-react";
import DeviceStatusBadge from "@/components/compound/device/DeviceStatusBadge";
import OnlineIndicator from "@/components/compound/device/OnlineIndicator";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import SensorChart from "@/components/compound/device/SensorChart";
import { useDeviceDetail } from "@/package/features/useDeviceDetail";
import { useSensorData } from "@/package/features/useSensorData";
import type { ApiDeviceStatus } from "@/package/schema/api";

type PendingAction = "lock" | "unlock" | "delete" | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type InfoCardProps = {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
};

function InfoCard({ label, icon, children }: InfoCardProps) {
  return (
    <div className="rounded-3xl bg-slate-900/90 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-white">{children}</span>
      </div>
    </div>
  );
}

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { device, isLoading, isError, updateStatus, deleteDevice } = useDeviceDetail(id);
  const isSensor = device?.device_type === "sensor";
  const { sensorData, isLoading: chartLoading } = useSensorData(isSensor ? id : null);

  const [pending, setPending] = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleConfirm = async () => {
    if (!pending || !device) return;
    setActionLoading(true);
    try {
      if (pending === "delete") {
        await deleteDevice();
        router.push("/devices");
        return;
      }
      const newStatus: ApiDeviceStatus = pending === "lock" ? "blocked" : "active";
      await updateStatus(newStatus);
    } finally {
      setActionLoading(false);
      setPending(null);
    }
  };

  const recentData = [...sensorData]
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    .slice(0, 20);

  const linkedGateway = recentData[0]?.gateway_id;

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading device…
        </div>
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="text-center">
          <p className="text-rose-400">Failed to load device.</p>
          <Link
            href="/devices"
            className="mt-4 inline-block text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back to Devices
          </Link>
        </div>
      </div>
    );
  }

  const dialogProps =
    pending === "delete"
      ? {
          title: "Delete device",
          description: `Permanently delete "${device.device_name}"? This cannot be undone.`,
          confirmLabel: "Delete",
          danger: true,
        }
      : pending === "lock"
      ? {
          title: "Block device",
          description: `Block "${device.device_name}"? It will be denied access until unblocked.`,
          confirmLabel: "Block",
          danger: true,
        }
      : {
          title: "Unblock device",
          description: `Unblock "${device.device_name}"? It will resume normal access.`,
          confirmLabel: "Unblock",
          danger: false,
        };

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link href="/devices" className="text-sm text-slate-400 hover:text-slate-100">
            ← Back to Devices
          </Link>
          <div className="flex items-center gap-3">
            {isSensor ? (
              <Cpu className="h-6 w-6 text-violet-400" />
            ) : (
              <Server className="h-6 w-6 text-sky-400" />
            )}
            <h1 className="text-4xl font-semibold text-white">{device.device_name}</h1>
          </div>
          <p className="font-mono text-sm text-slate-400">{device.device_id}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {device.status === "blocked" ? (
            <button
              type="button"
              onClick={() => setPending("unlock")}
              className="inline-flex items-center gap-2 rounded-3xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <Unlock className="h-4 w-4" />
              Unblock
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPending("lock")}
              className="inline-flex items-center gap-2 rounded-3xl bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              <Lock className="h-4 w-4" />
              Block
            </button>
          )}
          <button
            type="button"
            onClick={() => setPending("delete")}
            className="inline-flex items-center gap-2 rounded-3xl bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div className="mb-5 rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
        <p className="mb-4 text-sm uppercase tracking-[0.24em] text-slate-500">Device Info</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            label="Type"
            icon={
              isSensor ? (
                <Cpu className="h-4 w-4 text-violet-400" />
              ) : (
                <Server className="h-4 w-4 text-sky-400" />
              )
            }
          >
            <span className="capitalize">{device.device_type}</span>
          </InfoCard>

          <InfoCard label="Status">
            <DeviceStatusBadge status={device.status} />
          </InfoCard>

          <InfoCard label="Connection">
            <OnlineIndicator lastSeen={device.last_seen} />
          </InfoCard>

          <InfoCard label="Last Seen">
            {formatLastSeen(device.last_seen)}
          </InfoCard>

          {device.location ? (
            <InfoCard label="Location" icon={<MapPin className="h-4 w-4 text-slate-400" />}>
              {device.location}
            </InfoCard>
          ) : null}

          {isSensor && linkedGateway != null ? (
            <InfoCard label="Linked Gateway" icon={<Server className="h-4 w-4 text-sky-400" />}>
              <span className="font-mono text-xs">{String(linkedGateway)}</span>
            </InfoCard>
          ) : null}

          <InfoCard label="Fail Count" icon={<Activity className="h-4 w-4 text-slate-400" />}>
            <span className={device.fail_count > 0 ? "text-amber-300" : "text-white"}>
              {device.fail_count}
            </span>
          </InfoCard>

          <InfoCard label="Device ID" icon={<Hash className="h-4 w-4 text-slate-400" />}>
            <span className="font-mono text-xs">{device.device_id}</span>
          </InfoCard>
        </div>
      </div>

      {/* Sensor-only: chart + recent data table */}
      {isSensor && (
        <>
          <SensorChart data={sensorData} isLoading={chartLoading} />

          <div className="mt-5 rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
            <p className="mb-4 text-sm uppercase tracking-[0.24em] text-slate-500">
              Recent Data
            </p>

            {recentData.length === 0 ? (
              <p className="text-sm text-slate-500">No sensor data received yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      <th className="pb-3 pr-6 font-medium">Time</th>
                      <th className="pb-3 pr-6 font-medium">Temperature (°C)</th>
                      <th className="pb-3 pr-6 font-medium">Humidity (%)</th>
                      <th className="pb-3 font-medium">Gateway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentData.map((record) => (
                      <tr key={record.id} className="border-t border-slate-800/60">
                        <td className="py-3 pr-6 text-slate-400">
                          {formatDateTime(record.received_at)}
                        </td>
                        <td className="py-3 pr-6 font-semibold text-orange-300">
                          {record.payload?.temperature !== undefined ? (
                            `${record.payload.temperature}°C`
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-6 font-semibold text-sky-300">
                          {record.payload?.humidity !== undefined ? (
                            `${record.payload.humidity}%`
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 font-mono text-xs text-slate-400">
                          {String(record.gateway_id)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        title={dialogProps.title}
        description={dialogProps.description}
        confirmLabel={actionLoading ? "Processing…" : dialogProps.confirmLabel}
        danger={dialogProps.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />
    </div>
  );
}
