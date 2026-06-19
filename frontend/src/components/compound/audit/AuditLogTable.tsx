"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";
import type { AuditLogEntry } from "@/package/schema/api";

type Props = {
  logs: AuditLogEntry[];
  isAdmin?: boolean;
  selectedIds?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
};

const EVENT_STYLES: Record<string, string> = {
  GATEWAY_AUTH_FAIL:    "bg-red-50 text-red-700 ring-1 ring-red-200",
  SENSOR_AUTH_FAIL:     "bg-red-50 text-red-700 ring-1 ring-red-200",
  REPLAY_ATTACK:        "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  PRIVILEGE_ESCALATION: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  DEVICE_BLOCKED:       "bg-red-50 text-red-700 ring-1 ring-red-200",
  DEVICE_DELETE:        "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  DATA_RECV:            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  DEVICE_REGISTER:      "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  DEVICE_STATUS_CHANGE: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

const DEFAULT_EVENT_STYLE = "bg-gray-100 text-gray-600 ring-1 ring-gray-200";

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${time} ${date}`;
}

function JsonDetails({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!details) return <span className="text-gray-300">—</span>;

  const keys = Object.keys(details);
  const preview = keys.slice(0, 2).join(", ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="font-mono">{open ? "Ẩn" : `{${preview}…}`}</span>
      </button>
      {open && (
        <pre className="mt-2 max-w-xs overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-700">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogTable({ logs, isAdmin, selectedIds, onToggle, onToggleAll }: Props) {
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileSearch className="mb-3 h-10 w-10 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">Không có sự kiện nào</p>
        <p className="mt-1 text-xs text-gray-300">Thử điều chỉnh bộ lọc để tìm kết quả khác</p>
      </div>
    );
  }

  const allSelected  = logs.length > 0 && logs.every((l) => selectedIds?.has(l.id));
  const someSelected = !allSelected && logs.some((l) => selectedIds?.has(l.id));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {isAdmin && (
              <th className="w-10 px-5 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onToggleAll?.(logs.map((l) => l.id))}
                  className="h-4 w-4 cursor-pointer rounded accent-blue-600"
                  title="Chọn tất cả trên trang này"
                />
              </th>
            )}
            <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Thời gian</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Event Type</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Device ID</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">IP Address</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Chi tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => {
            const checked = selectedIds?.has(log.id) ?? false;
            return (
              <tr
                key={log.id}
                className={`transition hover:bg-gray-50/60 ${checked ? "bg-blue-50/60" : ""}`}
              >
                {isAdmin && (
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle?.(log.id)}
                      className="h-4 w-4 cursor-pointer rounded accent-blue-600"
                    />
                  </td>
                )}
                <td className="whitespace-nowrap px-5 py-2.5">
                  <span className="font-mono text-xs text-gray-500">{formatTime(log.created_at)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${EVENT_STYLES[log.event_type] ?? DEFAULT_EVENT_STYLE}`}>
                    {log.event_type}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {log.device_identifier ? (
                    <span className="font-mono text-xs text-gray-700" title={log.device_name ?? undefined}>
                      {log.device_identifier}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {log.device_ip ? (
                    <span className="font-mono text-xs text-gray-500">{log.device_ip}</span>
                  ) : log.ip_address ? (
                    <span className="font-mono text-xs text-gray-400" title="IP của client">{log.ip_address}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <JsonDetails details={log.details} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
