import useSWR from "swr";
import type { ApiDevice, ApiDeviceStatus } from "@/types/api";
import api from "@/lib/api";

const fetcher = (url: string) => api.get<ApiDevice[]>(url).then((r) => r.data);

export function useDeviceList() {
  const { data, error, isLoading, mutate } = useSWR<ApiDevice[]>(
    "/api/devices",
    fetcher,
    { refreshInterval: 10000 }
  );

  const updateStatus = async (id: number, status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    mutate();
  };

  const deleteDevice = async (id: number) => {
    await api.delete(`/api/devices/${id}`);
    mutate();
  };

  return {
    devices: data ?? [],
    isLoading,
    isError: !!error,
    updateStatus,
    deleteDevice,
  };
}
