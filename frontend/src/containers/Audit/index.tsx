"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw, Search, X, Trash2, XCircle, CheckCircle,
  ShieldAlert, ChevronLeft, ChevronRight, Filter, Cpu, Server,
} from "lucide-react";
import { useAuditLog, type AuditLogFilters } from "@/package/features/useAuditLog";
import { usePermissions } from "@/package/features/usePermissions";
import AuditLogTable from "@/components/compound/audit/AuditLogTable";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import api, { FetchError } from "@/package/services/api";

/* ─── constants ──────────────────────────────────────────── */

const EVENT_TYPES_BY_ROLE: Record<string, string[]> = {
  admin: [
    "GATEWAY_AUTH_FAIL",
    "SENSOR_AUTH_FAIL",
    "REPLAY_ATTACK",
    "PRIVILEGE_ESCALATION",
    "DATA_RECV",
    "DEVICE_REGISTER",
    "DEVICE_BLOCKED",
    "DEVICE_STATUS_CHANGE",
    "DEVICE_DELETE",
  ],
  operator: [
    "GATEWAY_AUTH_FAIL",
    "SENSOR_AUTH_FAIL",
    "REPLAY_ATTACK",
    "PRIVILEGE_ESCALATION",
    "DATA_RECV",
    "DEVICE_REGISTER",
    "DEVICE_BLOCKED",
    "DEVICE_STATUS_CHANGE",
  ],
  viewer: [
    "DATA_RECV",
    "DEVICE_REGISTER",
    "DEVICE_BLOCKED",
    "DEVICE_STATUS_CHANGE",
  ],
};

const EVENT_LABELS: Record<string, string> = {
  GATEWAY_AUTH_FAIL:    "Gateway Auth Fail",
  SENSOR_AUTH_FAIL:     "Sensor Auth Fail",
  REPLAY_ATTACK:        "Replay Attack",
  PRIVILEGE_ESCALATION: "Privilege Escalation",
  DATA_RECV:            "Data Received",
  DEVICE_REGISTER:      "Device Register",
  DEVICE_BLOCKED:       "Device Blocked",
  DEVICE_STATUS_CHANGE: "Status Change",
  DEVICE_DELETE:        "Device Delete",
};

const PAGE_SIZES = [10, 25, 50, 100];

type Toast = { msg: string; ok: boolean } | null;
type ConfirmAction = "selected" | "byType" | null;

/* ─── Component ──────────────────────────────────────────── */

export default function Audit() {
  const { canDeleteAuditLog, isAdmin, isOperator } = usePermissions();
  const role = isAdmin ? "admin" : isOperator ? "operator" : "viewer";
  const EVENT_TYPES = EVENT_TYPES_BY_ROLE[role] ?? EVENT_TYPES_BY_ROLE.viewer;

  /* filter state */
  const [eventType, setEventType]   = useState("");
  const [deviceId, setDeviceId]     = useState("");
  const [fromDate, setFromDate]     = useState("");
  const [toDate, setToDate]         = useState("");
  const [deviceType, setDeviceType] = useState<"" | "sensor" | "gateway">("");

  /* pagination */
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  /* admin actions */
  const [cleanType, setCleanType]   = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  /* ui */
  const [toast, setToast] = useState<Toast>(null);
  const [showFilters, setShowFilters] = useState(true);

  /* derived */
  const filters: AuditLogFilters = useMemo(
    () => ({
      event_type: eventType || undefined,
      device_id: deviceId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    }),
    [eventType, deviceId, fromDate, toDate],
  );

  const { logs: rawLogs, isLoading, isError, refresh } = useAuditLog(filters);

  const logs = useMemo(() => {
    if (!deviceType) return rawLogs;
    const marker = deviceType === "sensor" ? "-SN-" : "-GW-";
    return rawLogs.filter((l) => l.device_identifier?.includes(marker) ?? false);
  }, [rawLogs, deviceType]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageLogs   = logs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = !!(eventType || deviceId || fromDate || toDate || deviceType);
  const activeFilterCount = [eventType, deviceId, fromDate, toDate, deviceType].filter(Boolean).length;

  /* ── helpers ── */

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function clearFilters() {
    setEventType(""); setDeviceId(""); setFromDate(""); setToDate("");
    setDeviceType(""); setPage(1);
  }

  /* ── selection ── */

  function handleToggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleToggleAll(ids: number[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) { ids.forEach((id) => next.delete(id)); }
      else             { ids.forEach((id) => next.add(id)); }
      return next;
    });
  }

  /* ── delete actions ── */

  async function execDeleteSelected() {
    setIsDeleting(true);
    const count = selectedIds.size;
    try {
      await api.delete("/api/audit-log/bulk", { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      refresh();
      showToast(`Đã xóa ${count} log.`);
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403)
        showToast("Không có quyền truy cập.", false);
      else
        showToast("Xóa thất bại. Vui lòng thử lại.", false);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  }

  async function execCleanByType() {
    if (!cleanType) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/audit-log/by-type?event_type=${cleanType}`);
      refresh();
      showToast(`Đã dọn toàn bộ log ${cleanType}.`);
      setCleanType("");
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403)
        showToast("Không có quyền truy cập.", false);
      else
        showToast("Xóa thất bại. Vui lòng thử lại.", false);
    } finally {
      setIsDeleting(false);
      setConfirmAction(null);
    }
  }

  /* ── pagination helper ── */

  function buildPageNumbers(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (safePage > 3) pages.push("…");
    for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p++)
      pages.push(p);
    if (safePage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }

  /* ─── JSX ─────────────────────────────────────────────── */

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full space-y-4">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Security</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Nhật ký bảo mật và sự kiện hệ thống.
            {!isLoading && !isError && (
              <span className="ml-2 font-medium text-gray-700">{logs.length} sự kiện{hasFilters ? " (đã lọc)" : ""}.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition
              ${showFilters ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <Filter className="h-4 w-4" />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Filter card ── */}
      {showFilters && (
        <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bộ lọc</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Event type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => { setEventType(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="">Tất cả loại</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Device ID */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Device ID (số)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="number" min={1} placeholder="VD: 3"
                  value={deviceId}
                  onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              </div>
            </div>

            {/* From date */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Từ ngày</label>
              <input
                type="datetime-local" value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            {/* To date */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Đến ngày</label>
              <input
                type="datetime-local" value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
              />
            </div>
          </div>

          {/* Device type toggle */}
          <div className="border-t border-gray-100 px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-gray-500">Loại thiết bị:</span>
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { value: "",         label: "Tất cả",  icon: null },
                    { value: "gateway",  label: "Gateway", icon: <Server  size={13} /> },
                    { value: "sensor",   label: "Sensor",  icon: <Cpu     size={13} /> },
                  ] as const
                ).map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setDeviceType(value); setPage(1); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition
                      ${deviceType === value
                        ? value === "gateway"
                          ? "bg-blue-600 text-white"
                          : value === "sensor"
                          ? "bg-violet-600 text-white"
                          : "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-200"
                >
                  <X size={12} /> Xoá bộ lọc
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Actions bar ── */}
      {isAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left: label */}
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Admin Actions</span>
              {selectedIds.size > 0 && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-800">
                  {selectedIds.size} đã chọn
                </span>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Bulk delete selected */}
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setConfirmAction("selected")}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa {selectedIds.size} đã chọn
                </button>
              )}

              {selectedIds.size > 0 && (
                <div className="h-5 w-px bg-amber-300" />
              )}

              {/* Clean by event type */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-amber-700">Dọn theo loại:</span>
                <select
                  value={cleanType}
                  onChange={(e) => setCleanType(e.target.value)}
                  className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-sm text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="">-- Chọn loại --</option>
                  {EVENT_TYPES_BY_ROLE.admin.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => cleanType && setConfirmAction("byType")}
                  disabled={!cleanType || isDeleting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? "Đang xóa…" : "Dọn"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table card ── */}
      <div className="overflow-hidden rounded-xl border border-[#E5EAF0] bg-white ">

        {/* Table toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-3">
            {isError ? (
              <span className="text-sm text-red-500">Không có quyền truy cập</span>
            ) : (
              <span className="text-sm text-gray-500">
                {isLoading
                  ? <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</span>
                  : <><span className="font-semibold text-gray-900">{logs.length}</span> sự kiện{hasFilters ? <span className="ml-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">đã lọc</span> : ""}</>
                }
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 focus:outline-none"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>/ trang</span>
          </div>
        </div>

        {/* Table */}
        <AuditLogTable
          logs={pageLogs}
          isAdmin={isAdmin}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
            <span className="text-xs text-gray-400">
              Trang <span className="font-semibold text-gray-700">{safePage}</span> / {totalPages}
              <span className="ml-2 text-gray-300">·</span>
              <span className="ml-2">{logs.length} bản ghi</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>

              {buildPageNumbers().map((item, idx) =>
                item === "…" ? (
                  <span key={`ellipsis-${idx}`} className="flex h-8 w-8 items-center justify-center text-xs text-gray-400">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition
                      ${item === safePage
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirm dialogs ── */}
      <ConfirmDialog
        open={confirmAction === "selected"}
        title="Xóa log đã chọn"
        description={`Bạn chắc chắn muốn xóa ${selectedIds.size} log đã chọn? Hành động này không thể hoàn tác.`}
        confirmLabel={isDeleting ? "Đang xóa…" : `Xóa ${selectedIds.size} log`}
        danger
        onConfirm={execDeleteSelected}
        onCancel={() => !isDeleting && setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "byType"}
        title={`Dọn log "${cleanType}"`}
        description={`Xóa toàn bộ log có loại "${cleanType}" khỏi hệ thống? Hành động này không thể hoàn tác.`}
        confirmLabel={isDeleting ? "Đang xóa…" : "Xóa tất cả"}
        danger
        onConfirm={execCleanByType}
        onCancel={() => !isDeleting && setConfirmAction(null)}
      />

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl transition
            ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.ok
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <XCircle className="h-4 w-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
