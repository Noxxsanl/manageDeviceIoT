export class FetchError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`HTTP ${status}`);
    this.name = "FetchError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<{ data: T }> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !url.includes("/api/auth/login") &&
    !url.includes("/api/auth/me")
  ) {
    window.location.href = "/login";
    return { data: undefined as T };
  }

  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new FetchError(res.status, data);
  }

  return { data: data as T };
}

const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T = unknown>(url: string) => request<T>("DELETE", url),
};

export default api;
