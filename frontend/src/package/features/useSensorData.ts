import useSWR from "swr";
import type { ApiSensorData } from "@/package/schema/api";
import api from "@/package/services/api";

type RawResponse = { data: ApiSensorData[] } | ApiSensorData[];

const fetcher = (url: string) =>
  api.get<RawResponse>(url).then((r) => {
    const d = r.data;
    return Array.isArray(d) ? d : (d.data ?? []);
  });

export function useSensorData(id: string | number | null) {
  const { data, error, isLoading } = useSWR<ApiSensorData[]>(
    id !== null ? `/api/devices/${id}/data?limit=200` : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  return {
    sensorData: data ?? [],
    isLoading,
    isError: !!error,
  };
}
