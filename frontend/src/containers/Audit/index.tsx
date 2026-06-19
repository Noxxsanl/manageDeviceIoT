"use client";

import { useState, useMemo } from "react";
import { RefreshCw, Search, X, Trash2, XCircle } from "lucide-react";
import { useAuditLog, type AuditLogFilters } from "@/package/features/useAuditLog";
import { usePermissions } from "@/package/features/usePermissions";
import AuditLogTable from "@/components/compound/audit/AuditLogTable";
import api, { FetchError } from "@/package/services/api";

const EVENT_TYPES = [
  "AUTH_SUCCESS",
  "AUTH_FAIL",
  "GATEWAY_AUTH_FAIL",
  "SENSOR_AUTH_FAIL",
  "DATA_RECV",
  "DEVICE_REGISTER",
  "DEVICE_BLOCKED",
];

const PAGE_SIZES = [10, 25, 50];

type Toast = { msg: string; ok: boolean } | null;

export default function Audit() {
  const { canDeleteAuditLog } = usePermissions();

  const [eventType, setEventType] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [toast, setToast] = useState<Toast>(null);

  const filters: AuditLogFilters = useMemo(
    () => ({
      event_type: eventType || undefined,
      device_id: deviceId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    }),
    [eventType, deviceId, fromDate, toDate]
  );

  const { logs, isLoading, isError, refresh } = useAuditLog(filters);
  const [isDeleting, setIsDeleting] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleDeleteDataRecv() {
    if (!canDeleteAuditLog) {
      showToast("Không có quyền truy cập.", false);
      return;
    }
    if (!window.confirm("Xóa toàn bộ log DATA_RECV? Hành động này không thể hoàn tác.")) return;
    setIsDeleting(true);
    try {
      await api.delete("/api/audit-log/data-recv");
      refresh();
      showToast("Đã xóa toàn bộ log DATA_RECV.");
    } catch (err: unknown) {
      if (err instanceof FetchError && err.status === 403) {
        showToast("Không có quyền truy cập.", false);
      } else {
        showToast("Xóa thất bại. Vui lòng thử lại.", false);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageLogs = logs.slice((safePage - 1) * pageSize, safePage * pageSize);

  function clearFilters() {
    setEventType("");
    setDeviceId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const hasFilters = !!(eventType || deviceId || fromDate || toDate);

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Security</p>
          <h1 className="text-4xl font-semibold text-white">Audit Log</h1>
          <p className="mt-2 text-slate-400">
            Nhật ký bảo mật và sự kiện hệ thống. Tự động làm mới mỗi 30 giây.
          </p>
        </div>
        <div className="flex gap-2">
          {canDeleteAuditLog && (
            <button
              onClick={handleDeleteDataRecv}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-3xl bg-rose-900/40 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-800/60 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Đang xóa…" : "Xóa log DATA_RECV"}
            </button>
          )}
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 rounded-3xl bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Event type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => { setEventType(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Tất cả</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Device ID */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Device (số ID)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="number"
                min={1}
                placeholder="VD: 3"
                value={deviceId}
                onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* From date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Từ ngày
            </label>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none scheme-dark"
            />
          </div>

          {/* To date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Đến ngày
            </label>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none scheme-dark"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3">
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
            >
              <X size={12} />
              Xoá bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {isError ? (
            <span className="text-rose-400">Lỗi kết nối backend</span>
          ) : (
            <>
              {logs.length} sự kiện
              {hasFilters ? " (đã lọc)" : ""}
            </>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span>/ trang</span>
        </div>
      </div>

      {/* Table */}
      <AuditLogTable logs={pageLogs} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Trang {safePage} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trước
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const start = Math.max(1, safePage - 3);
              const pg = start + i;
              if (pg > totalPages) return null;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    pg === safePage
                      ? "border-sky-500 bg-sky-500/20 text-sky-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl transition ${
            toast.ok
              ? "bg-emerald-500 text-slate-950"
              : "bg-rose-500 text-white"
          }`}
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
