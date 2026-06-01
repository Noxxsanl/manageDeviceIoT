import useSWR from "swr";
import type { ApiDeviceDetail, ApiDeviceStatus } from "@/types/api";
import api from "@/lib/api";

const fetcher = (url: string) => api.get<ApiDeviceDetail>(url).then((r) => r.data);

export function useDeviceDetail(id: string | number) {
  const { data, error, isLoading, mutate } = useSWR<ApiDeviceDetail>(
    `/api/devices/${id}`,
    fetcher,
    { refreshInterval: 10000 }
  );

  const updateStatus = async (status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    mutate();
  };

  const deleteDevice = async () => {
    await api.delete(`/api/devices/${id}`);
  };

  return {
    device: data ?? null,
    isLoading,
    isError: !!error,
    mutate,
    updateStatus,
    deleteDevice,
  };
}
