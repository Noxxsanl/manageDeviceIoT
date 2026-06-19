"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Server, Cpu, Lock, Unlock, Trash2,
  MapPin, Hash, Activity, RefreshCw, ArrowLeft,
  Thermometer, Droplets,
} from "lucide-react";
import OnlineIndicator from "@/components/compound/device/OnlineIndicator";
import DeviceStatusBadge from "@/components/compound/device/DeviceStatusBadge";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import SensorChart from "@/components/compound/device/SensorChart";
import { useDeviceDetail } from "@/package/features/useDeviceDetail";
import { useSensorData } from "@/package/features/useSensorData";
import type { ApiDeviceStatus } from "@/package/schema/api";

type PendingAction = "lock" | "unlock" | "delete" | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Chưa kết nối";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/* ── Info cell used in the device info grid ── */
function InfoCell({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-gray-400">{icon}</span>}
        <span className="text-sm font-semibold text-gray-900">{children}</span>
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

  const [pending, setPending]             = useState<PendingAction>(null);
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

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải thiết bị…
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (isError || !device) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <p className="text-red-500">Không có quyền truy cập hoặc thiết bị không tồn tại.</p>
        <Link href="/devices"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
          Trở về Devices
        </Link>
      </div>
    );
  }

  const dialogProps =
    pending === "delete"
      ? { title: "Xóa thiết bị",    description: `Xóa vĩnh viễn "${device.device_name}"? Không thể hoàn tác.`, confirmLabel: "Xóa",      danger: true  }
      : pending === "lock"
      ? { title: "Khóa thiết bị",   description: `Khóa "${device.device_name}"? Thiết bị sẽ bị từ chối kết nối.`, confirmLabel: "Khóa",  danger: true  }
      : { title: "Mở khóa thiết bị", description: `Mở khóa "${device.device_name}"?`,                             confirmLabel: "Mở khóa", danger: false };


  return (
    <div className="min-h-[calc(100vh-5rem)] w-full space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        {/* Left: back + title */}
        <div className="space-y-3">
          <Link
            href="/devices"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600  transition hover:bg-gray-50 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Trở về Devices
          </Link>

          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSensor ? "bg-violet-50" : "bg-blue-50"}`}>
              {isSensor
                ? <Cpu    className="h-5 w-5 text-violet-600" />
                : <Server className="h-5 w-5 text-blue-600" />
              }
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-gray-900">{device.device_name}</h1>
                <DeviceStatusBadge status={device.status} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-gray-400">{device.device_id}</p>
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {device.status === "blocked" ? (
            <button type="button" onClick={() => setPending("unlock")}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
              <Unlock className="h-4 w-4" />
              Mở khóa
            </button>
          ) : (
            <button type="button" onClick={() => setPending("lock")}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">
              <Lock className="h-4 w-4" />
              Khóa
            </button>
          )}
          <button type="button" onClick={() => setPending("delete")}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100">
            <Trash2 className="h-4 w-4" />
            Xóa
          </button>
        </div>
      </div>

      {/* ── Device info grid ── */}
      <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">
        <div className="border-b border-gray-100 px-5 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Thông tin thiết bị</p>
        </div>
        <div className="grid divide-y divide-gray-100 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Loại"
            icon={isSensor ? <Cpu size={15} className="text-violet-500" /> : <Server size={15} className="text-blue-500" />}>
            <span className="capitalize">{isSensor ? "Sensor" : "Gateway"}</span>
          </InfoCell>

          <InfoCell label="Trạng thái">
            <DeviceStatusBadge status={device.status} />
          </InfoCell>

          <InfoCell label="Kết nối">
            <OnlineIndicator lastSeen={device.last_seen} />
          </InfoCell>

          <InfoCell label="Hoạt động gần nhất">
            {formatLastSeen(device.last_seen)}
          </InfoCell>
        </div>

        {/* Second row */}
        <div className="grid divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          {device.location && (
            <InfoCell label="Vị trí" icon={<MapPin size={15} />}>
              {device.location}
            </InfoCell>
          )}

          {isSensor && linkedGateway != null && (
            <InfoCell label="Gateway liên kết" icon={<Server size={15} className="text-blue-400" />}>
              <span className="font-mono text-xs">{String(linkedGateway)}</span>
            </InfoCell>
          )}

          <InfoCell label="Fail Count" icon={<Activity size={15} />}>
            <span className={device.fail_count > 0 ? "text-amber-600" : "text-gray-900"}>
              {device.fail_count}
            </span>
          </InfoCell>

          <InfoCell label="Device ID" icon={<Hash size={15} />}>
            <span className="font-mono text-xs">{device.device_id}</span>
          </InfoCell>
        </div>
      </div>

      {/* ── Sensor-only: chart + recent data ── */}
      {isSensor && (
        <>
          <SensorChart data={sensorData} isLoading={chartLoading} />

          <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">
            <div className="border-b border-gray-100 px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Dữ liệu gần nhất</p>
            </div>

            {recentData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-8 w-8 text-gray-200" />
                <p className="text-sm text-gray-400">Chưa có dữ liệu cảm biến.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thời gian</th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <span className="flex items-center gap-1.5"><Thermometer size={12} /> Nhiệt độ (°C)</span>
                      </th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <span className="flex items-center gap-1.5"><Droplets size={12} /> Độ ẩm (%)</span>
                      </th>
                      <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Gateway</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentData.map((record) => (
                      <tr key={record.id} className="transition hover:bg-gray-50/60">
                        <td className="px-5 py-2.5 font-mono text-xs text-gray-500">
                          {formatDateTime(record.received_at)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-orange-500">
                          {record.payload?.temperature !== undefined
                            ? `${record.payload.temperature}°C`
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-blue-500">
                          {record.payload?.humidity !== undefined
                            ? `${record.payload.humidity}%`
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
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
        confirmLabel={actionLoading ? "Đang xử lý…" : dialogProps.confirmLabel}
        danger={dialogProps.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />
    </div>
  );
}
