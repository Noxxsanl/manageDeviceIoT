import useSWR from "swr";
import type { AuditLogEntry } from "@/types/api";
import api from "@/lib/axios";

export type AuditLogFilters = {
  event_type?: string;
  device_id?: string;
  from?: string;
  to?: string;
};

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const q = params.toString();
  return q ? `/api/audit-log?${q}` : "/api/audit-log";
}

const fetcher = (url: string) =>
  api.get<{ audit_log: AuditLogEntry[] }>(url).then((r) => r.data.audit_log);

export function useAuditLog(filters: AuditLogFilters = {}) {
  const key = buildQuery(filters);
  const { data, error, isLoading, mutate } = useSWR<AuditLogEntry[]>(
    key,
    fetcher,
    { refreshInterval: 30000 }
  );

  return {
    logs: data ?? [],
    isLoading,
    isError: !!error,
    refresh: mutate,
  };
}
