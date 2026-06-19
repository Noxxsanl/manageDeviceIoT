"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditLogEntry } from "@/package/schema/api";

type Props = {
  logs: AuditLogEntry[];
  isAdmin?: boolean;
  selectedIds?: Set<number>;
  onToggle?: (id: number) => void;
  onToggleAll?: (ids: number[]) => void;
};

const EVENT_STYLES: Record<string, string> = {
  GATEWAY_AUTH_FAIL:    "bg-rose-500/15 text-rose-300 border border-rose-500/20",
  SENSOR_AUTH_FAIL:     "bg-rose-500/15 text-rose-300 border border-rose-500/20",
  REPLAY_ATTACK:        "bg-orange-500/15 text-orange-300 border border-orange-500/20",
  PRIVILEGE_ESCALATION: "bg-purple-500/15 text-purple-300 border border-purple-500/20",
  DEVICE_BLOCKED:       "bg-rose-500/15 text-rose-300 border border-rose-500/20",
  DEVICE_DELETE:        "bg-rose-500/15 text-rose-300 border border-rose-500/20",
  DATA_RECV:            "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  DEVICE_REGISTER:      "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  DEVICE_STATUS_CHANGE: "bg-sky-500/15 text-sky-300 border border-sky-500/20",
};

const DEFAULT_EVENT_STYLE = "bg-slate-700/40 text-slate-300 border border-slate-700";

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function JsonDetails({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!details) return <span className="text-slate-600">—</span>;

  const preview = Object.keys(details).slice(0, 2).join(", ");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {open ? "Ẩn" : `{${preview}…}`}
      </button>
      {open && (
        <pre className="mt-2 max-w-xs overflow-x-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditLogTable({ logs, isAdmin, selectedIds, onToggle, onToggleAll }: Props) {
  if (logs.length === 0) {
    return (
      <div className="rounded-4xl border border-slate-800 bg-slate-950/95 px-6 py-12 text-center text-slate-500">
        Không có sự kiện nào.
      </div>
    );
  }

  const allSelected = logs.length > 0 && logs.every((l) => selectedIds?.has(l.id));
  const someSelected = !allSelected && logs.some((l) => selectedIds?.has(l.id));

  return (
    <div className="overflow-hidden rounded-4xl border border-slate-800 bg-slate-950/95 shadow-lg shadow-slate-950/20">
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-left text-sm">
          <thead className="bg-slate-900/90 text-slate-400">
            <tr>
              {isAdmin && (
                <th className="w-10 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={() => onToggleAll?.(logs.map((l) => l.id))}
                    className="h-4 w-4 cursor-pointer accent-sky-500"
                    title="Chọn tất cả trên trang này"
                  />
                </th>
              )}
              <th className="px-4 py-4 font-medium">Thời gian</th>
              <th className="px-4 py-4 font-medium">Event Type</th>
              <th className="px-4 py-4 font-medium">Device ID</th>
              <th className="px-4 py-4 font-medium">IP Address</th>
              <th className="px-4 py-4 font-medium">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const checked = selectedIds?.has(log.id) ?? false;
              return (
                <tr
                  key={log.id}
                  className={`border-b border-slate-800/60 transition hover:bg-slate-900/60 ${
                    checked ? "bg-sky-950/30" : ""
                  }`}
                >
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle?.(log.id)}
                        className="h-4 w-4 cursor-pointer accent-sky-500"
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                    {formatTime(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        EVENT_STYLES[log.event_type] ?? DEFAULT_EVENT_STYLE
                      }`}
                    >
                      {log.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {log.device_identifier ? (
                      <span title={log.device_name ?? undefined}>
                        {log.device_identifier}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {log.device_ip ? (
                      log.device_ip
                    ) : log.ip_address ? (
                      <span className="text-slate-500" title="IP của client (không phải thiết bị)">
                        {log.ip_address}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <JsonDetails details={log.details} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
