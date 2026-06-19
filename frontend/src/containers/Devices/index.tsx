"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server, Cpu, Lock, Unlock, Power, Trash2,
  RefreshCw, Plus, Eye, CheckCircle, XCircle, Search,
} from "lucide-react";
import { useDeviceList } from "@/package/features/useDeviceList";
import { usePermissions } from "@/package/features/usePermissions";
import DeviceStatusBadge from "@/components/compound/device/DeviceStatusBadge";
import OnlineIndicator from "@/components/compound/device/OnlineIndicator";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import { AddDeviceModal } from "@/components/compound/device/AddDeviceModal";
import { FetchError } from "@/package/services/api";
import type { ApiDevice, ApiDeviceStatus } from "@/package/schema/api";

type Tab = "gateway" | "sensor";

type PendingAction =
  | { type: "delete"; device: ApiDevice }
  | { type: "lock"; device: ApiDevice }
  | { type: "unlock"; device: ApiDevice }
  | { type: "activate"; device: ApiDevice }
  | null;

type Toast = { msg: string; ok: boolean } | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Chưa kết nối";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Devices() {
  const { devices, isLoading, isError, updateStatus, deleteDevice } = useDeviceList();
  const { canCreateDevice, canUpdateDeviceStatus, canDeleteDevice } = usePermissions();

  const [activeTab, setActiveTab]   = useState<Tab>("gateway");
  const [pending, setPending]       = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalOpen, setAddModalOpen]   = useState(false);
  const [toast, setToast]           = useState<Toast>(null);
  const [search, setSearch]         = useState("");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const gateways = devices.filter((d) => d.device_type === "gateway");
  const sensors  = devices.filter((d) => d.device_type === "sensor");

  const sourceList = activeTab === "gateway" ? gateways : sensors;
  const tableDevices = search.trim()
    ? sourceList.filter(
        (d) =>
          d.device_name.toLowerCase().includes(search.toLowerCase()) ||
          d.device_id.toLowerCase().includes(search.toLowerCase()),
      )
    : sourceList;

  const handleConfirm = async () => {
    if (!pending) return;
    if (pending.type === "delete" && !canDeleteDevice) {
      showToast("Không có quyền truy cập.", false); setPending(null); return;
    }
    if ((pending.type === "lock" || pending.type === "unlock" || pending.type === "activate") && !canUpdateDeviceStatus) {
      showToast("Không có quyền truy cập.", false); setPending(null); return;
    }
    setActionLoading(true);
    try {
      if (pending.type === "delete") {
        await deleteDevice(pending.device.id);
        showToast(`Đã xóa "${pending.device.device_name}".`);
      } else {
        const newStatus: ApiDeviceStatus = pending.type === "lock" ? "blocked" : "active";
        await updateStatus(pending.device.id, newStatus);
        showToast(`Thiết bị đã được ${pending.type === "lock" ? "khóa" : pending.type === "activate" ? "kích hoạt" : "mở khóa"}.`);
      }
    } catch (err: unknown) {
      showToast(err instanceof FetchError && err.status === 403 ? "Không có quyền truy cập." : "Thao tác thất bại.", false);
    } finally {
      setActionLoading(false); setPending(null);
    }
  };

  const confirmDialog =
    pending?.type === "delete"  ? { title: "Xóa thiết bị",    description: `Xóa vĩnh viễn "${pending.device.device_name}"? Không thể hoàn tác.`, confirmLabel: "Xóa",         danger: true  } :
    pending?.type === "lock"    ? { title: "Khóa thiết bị",   description: `Khóa "${pending?.device.device_name}"? Thiết bị sẽ bị từ chối kết nối.`, confirmLabel: "Khóa",    danger: true  } :
    pending?.type === "activate"? { title: "Kích hoạt",        description: `Kích hoạt "${pending?.device.device_name}"?`,                            confirmLabel: "Kích hoạt", danger: false } :
                                  { title: "Mở khóa thiết bị", description: `Mở khóa "${pending?.device.device_name}"?`,                             confirmLabel: "Mở khóa",  danger: false };

  const activeGateways = gateways.filter((d) => d.status === "active").length;
  const activeSensors  = sensors.filter((d) => d.status === "active").length;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Devices</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Fleet registry</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý trạng thái, quyền truy cập và bảo mật thiết bị.
          </p>
        </div>
        {canCreateDevice && (
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Thêm thiết bị
          </button>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Gateway card — clickable → switches tab */}
        <button
          type="button"
          onClick={() => setActiveTab("gateway")}
          className={`rounded-xl border bg-white p-4 text-left transition
            ${activeTab === "gateway" ? "border-blue-200 ring-2 ring-blue-500/20" : "border-[#E5EAF0]"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                <Server className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Gateways</p>
                <p className="text-3xl font-bold text-gray-900">{gateways.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-600">{activeGateways}</p>
              <p className="text-xs text-gray-400">active</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: gateways.length ? `${(activeGateways / gateways.length) * 100}%` : "0%" }}
            />
          </div>
        </button>

        {/* Sensor card */}
        <button
          type="button"
          onClick={() => setActiveTab("sensor")}
          className={`rounded-xl border bg-white p-4 text-left transition
            ${activeTab === "sensor" ? "border-violet-200 ring-2 ring-violet-500/20" : "border-[#E5EAF0]"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50">
                <Cpu className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sensors</p>
                <p className="text-3xl font-bold text-gray-900">{sensors.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-600">{activeSensors}</p>
              <p className="text-xs text-gray-400">active</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: sensors.length ? `${(activeSensors / sensors.length) * 100}%` : "0%" }}
            />
          </div>
        </button>
      </div>

      {/* ── Table card ── */}
      <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
          {/* Tabs */}
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
            {(["gateway", "sensor"] as const).map((tab) => {
              const isGw = tab === "gateway";
              const count = isGw ? gateways.length : sensors.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setSearch(""); }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition
                    ${activeTab === tab
                      ? isGw ? "bg-white text-blue-600 " : "bg-white text-violet-600 "
                      : "text-gray-500 hover:text-gray-700"
                    }`}
                >
                  {isGw ? <Server className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
                  {isGw ? "Gateway" : "Sensor"}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                    ${activeTab === tab
                      ? isGw ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                      : "bg-gray-200 text-gray-500"
                    }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm tên hoặc Device ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>

          {/* right info */}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            {isLoading && <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>}
            {isError   && <span className="text-red-500">Không có quyền truy cập</span>}
            {!isLoading && !isError && (
              <span>
                <span className="font-semibold text-gray-700">{tableDevices.length}</span> thiết bị
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {!isError && tableDevices.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {activeTab === "gateway"
              ? <Server className="mb-3 h-10 w-10 text-gray-200" />
              : <Cpu className="mb-3 h-10 w-10 text-gray-200" />
            }
            <p className="text-sm font-medium text-gray-400">
              {search ? "Không tìm thấy thiết bị phù hợp" : `Chưa có ${activeTab} nào`}
            </p>
            {!search && canCreateDevice && (
              <button
                onClick={() => setAddModalOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
              >
                <Plus size={13} /> Thêm thiết bị đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thiết bị</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Trạng thái</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Kết nối</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Vị trí</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Hoạt động</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableDevices.map((device) => (
                  <tr key={device.id} className="transition hover:bg-gray-50/60">

                    {/* Device name + ID */}
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{device.device_name}</p>
                        <p className="mt-0.5 font-mono text-xs text-gray-400">{device.device_id}</p>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-4">
                      <DeviceStatusBadge status={device.status} />
                    </td>

                    {/* Online indicator */}
                    <td className="px-4 py-4">
                      <OnlineIndicator lastSeen={device.last_seen} />
                    </td>

                    {/* Location */}
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {device.location || <span className="text-gray-300">—</span>}
                    </td>

                    {/* Last seen */}
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {formatLastSeen(device.last_seen)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/devices/${device.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Chi tiết
                        </Link>

                        {canUpdateDeviceStatus && (
                          device.status === "inactive" ? (
                            <button type="button" onClick={() => setPending({ type: "activate", device })}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
                              <Power className="h-3.5 w-3.5" /> Kích hoạt
                            </button>
                          ) : device.status === "blocked" ? (
                            <button type="button" onClick={() => setPending({ type: "unlock", device })}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
                              <Unlock className="h-3.5 w-3.5" /> Mở khóa
                            </button>
                          ) : (
                            <button type="button" onClick={() => setPending({ type: "lock", device })}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
                              <Lock className="h-3.5 w-3.5" /> Khóa
                            </button>
                          )
                        )}

                        {canDeleteDevice && (
                          <button type="button" onClick={() => setPending({ type: "delete", device })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100">
                            <Trash2 className="h-3.5 w-3.5" /> Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Dialogs / Modals ── */}
      <ConfirmDialog
        open={!!pending}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={actionLoading ? "Đang xử lý…" : confirmDialog.confirmLabel}
        cancelLabel="Huỷ"
        danger={confirmDialog.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />

      {canCreateDevice && (
        <AddDeviceModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => showToast("Đăng ký thiết bị thành công.")}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl transition
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <XCircle    className="h-4 w-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
