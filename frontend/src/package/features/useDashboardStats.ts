import useSWR from "swr";
import type { DashboardStats } from "@/package/schema/api";
import api from "@/package/services/api";

const fetcher = (url: string) => api.get<DashboardStats>(url).then((r) => r.data);

export function useDashboardStats() {
  const { data, error, isLoading } = useSWR<DashboardStats>(
    "/api/dashboard/stats",
    fetcher,
    { refreshInterval: 10000 }
  );

  return {
    stats: data ?? null,
    isLoading,
    isError: !!error,
  };
}
