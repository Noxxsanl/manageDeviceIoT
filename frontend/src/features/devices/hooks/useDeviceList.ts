import useSWR from "swr";
import type { ApiDevice, ApiDeviceStatus } from "@/shared/types/api";
import api from "@/shared/api/client";

const fetcher = (url: string) => api.get<{ devices: ApiDevice[] }>(url).then((r) => r.data.devices);

export function useDeviceList() {
  const { data, error, isLoading, mutate } = useSWR<ApiDevice[]>(
    "/api/devices",
    fetcher,
    { refreshInterval: 10000 }
  );

  const updateStatus = async (id: number, status: ApiDeviceStatus) => {
    await api.patch(`/api/devices/${id}/status`, { status });
    await mutate(
      (current) =>
        current?.map((device) =>
          device.id === id
            ? {
                ...device,
                status,
                fail_count: status === "active" ? 0 : device.fail_count,
              }
            : device
        ),
      { revalidate: true }
    );
  };

  const deleteDevice = async (id: number) => {
    await api.delete(`/api/devices/${id}`);
    await mutate((current) => current?.filter((device) => device.id !== id), {
      revalidate: true,
    });
  };

  return {
    devices: data ?? [],
    isLoading,
    isError: !!error,
    updateStatus,
    deleteDevice,
  };
}
