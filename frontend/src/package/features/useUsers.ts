import useSWR from "swr";
import type { ApiUser } from "@/package/schema/api";
import api from "@/package/services/api";

const fetcher = (url: string) =>
  api.get<{ users: ApiUser[] }>(url).then((r) => r.data.users);

export function useUsers() {
  const { data, error, isLoading, mutate } = useSWR<ApiUser[]>(
    "/api/users",
    fetcher
  );

  const createUser = async (username: string, password: string, role: "operator" | "viewer") => {
    await api.post("/api/users", { username, password, role });
    mutate();
  };

  const changePassword = async (id: number, password: string) => {
    await api.patch(`/api/users/${id}/password`, { password });
  };

  const deleteUser = async (id: number) => {
    await api.delete(`/api/users/${id}`);
    mutate();
  };

  return {
    users: data ?? [],
    isLoading,
    isError: !!error,
    createUser,
    changePassword,
    deleteUser,
  };
}
