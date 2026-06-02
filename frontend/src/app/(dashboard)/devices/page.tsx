"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server,
  Cpu,
  Lock,
  Unlock,
  Trash2,
  RefreshCw,
  Plus,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useDeviceList } from "@/hooks/useDeviceList";
import DeviceStatusBadge from "@/components/device/DeviceStatusBadge";
import OnlineIndicator from "@/components/device/OnlineIndicator";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { AddDeviceModal } from "@/components/device/AddDeviceModal";
import type { ApiDevice, ApiDeviceStatus } from "@/types/api";

type Tab = "gateway" | "sensor";

type PendingAction =
  | { type: "delete"; device: ApiDevice }
  | { type: "lock"; device: ApiDevice }
  | { type: "unlock"; device: ApiDevice }
  | null;

type Toast = { msg: string; ok: boolean } | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DevicesPage() {
  const { devices, isLoading, isError, updateStatus, deleteDevice } = useDeviceList();
  const [activeTab, setActiveTab] = useState<Tab>("gateway");
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const gateways = devices.filter((d) => d.device_type === "gateway");
  const sensors = devices.filter((d) => d.device_type === "sensor");
  const tableDevices = activeTab === "gateway" ? gateways : sensors;

  const handleConfirm = async () => {
    if (!pending) return;
    setActionLoading(true);
    try {
      if (pending.type === "delete") {
        await deleteDevice(pending.device.id);
        showToast(`"${pending.device.device_name}" deleted successfully.`);
      } else {
        const newStatus: ApiDeviceStatus =
          pending.type === "lock" ? "blocked" : "active";
        await updateStatus(pending.device.id, newStatus);
        showToast(
          `Device ${pending.type === "lock" ? "blocked" : "unblocked"} successfully.`
        );
      }
    } catch {
      showToast("Action failed. Please try again.", false);
    } finally {
      setActionLoading(false);
      setPending(null);
    }
  };

  const confirmDialog =
    pending?.type === "delete"
      ? {
          title: "Delete device",
          description: `Are you sure you want to permanently delete "${pending.device.device_name}"? This cannot be undone.`,
          confirmLabel: "Delete",
          danger: true,
        }
      : pending?.type === "lock"
      ? {
          title: "Block device",
          description: `Block "${pending?.device.device_name}"? It will be denied access until unlocked.`,
          confirmLabel: "Block",
          danger: true,
        }
      : {
          title: "Unblock device",
          description: `Unblock "${pending?.device.device_name}"? It will resume normal access.`,
          confirmLabel: "Unblock",
          danger: false,
        };

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Devices</p>
          <h1 className="text-4xl font-semibold text-white">Fleet registry</h1>
          <p className="mt-2 text-slate-400">
            Manage device status, access control and security posture.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" />
          Add Device
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-sky-400" />
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Gateways</p>
          </div>
          <p className="mt-3 text-4xl font-semibold text-white">{gateways.length}</p>
          <p className="mt-1 text-sm text-slate-500">
            {gateways.filter((d) => d.status === "active").length} active
          </p>
        </div>
        <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-violet-400" />
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Sensors</p>
          </div>
          <p className="mt-3 text-4xl font-semibold text-white">{sensors.length}</p>
          <p className="mt-1 text-sm text-slate-500">
            {sensors.filter((d) => d.status === "active").length} active
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setActiveTab("gateway")}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "gateway"
              ? "bg-sky-500/20 text-sky-300"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <Server className="h-4 w-4" />
          Gateway
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {gateways.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("sensor")}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "sensor"
              ? "bg-violet-500/20 text-violet-300"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <Cpu className="h-4 w-4" />
          Sensor
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {sensors.length}
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-4xl border border-slate-800 bg-slate-950/95 shadow-lg shadow-slate-950/20">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 text-sm text-slate-400">
          <span>
            {tableDevices.length} {activeTab}
            {tableDevices.length !== 1 ? "s" : ""} registered
          </span>
          {isLoading && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </span>
          )}
          {isError && (
            <span className="text-rose-400">Failed to load — check backend connection</span>
          )}
        </div>

        {!isError && tableDevices.length === 0 && !isLoading ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No {activeTab}s registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="bg-slate-900/90 text-slate-400">
                <tr>
                  <th className="px-4 py-4 font-medium">Device ID</th>
                  <th className="px-4 py-4 font-medium">Name</th>
                  <th className="px-4 py-4 font-medium">Type</th>
                  <th className="px-4 py-4 font-medium">Location</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Connection</th>
                  <th className="px-4 py-4 font-medium">Last Seen</th>
                  <th className="px-4 py-4 font-medium">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {tableDevices.map((device) => (
                  <tr
                    key={device.id}
                    className="border-b border-slate-800/60 transition hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-4 font-mono text-xs text-slate-300">
                      {device.device_id}
                    </td>
                    <td className="px-4 py-4 font-medium text-white">{device.device_name}</td>
                    <td className="px-4 py-4 capitalize text-slate-400">{device.device_type}</td>
                    <td className="px-4 py-4 text-slate-400">
                      {device.location || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <DeviceStatusBadge status={device.status} />
                    </td>
                    <td className="px-4 py-4">
                      <OnlineIndicator lastSeen={device.last_seen} />
                    </td>
                    <td className="px-4 py-4 text-slate-400">
                      {formatLastSeen(device.last_seen)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/devices/${device.id}`}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-700/50 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Link>
                        {device.status === "blocked" ? (
                          <button
                            type="button"
                            onClick={() => setPending({ type: "unlock", device })}
                            className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Unlock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPending({ type: "lock", device })}
                            className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Lock
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPending({ type: "delete", device })}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={actionLoading ? "Processing…" : confirmDialog.confirmLabel}
        cancelLabel="Huỷ"
        danger={confirmDialog.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />

      <AddDeviceModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => showToast("Device registered successfully.")}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl transition ${
            toast.ok
              ? "bg-emerald-500 text-slate-950"
              : "bg-rose-500 text-white"
          }`}
        >
          {toast.ok ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
