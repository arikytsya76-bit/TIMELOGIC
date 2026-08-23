import { API_URL } from "../config";

const ACCESS = "tl_access";
const REFRESH = "tl_refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    return localStorage.getItem(REFRESH);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  setAccess(access: string) {
    localStorage.setItem(ACCESS, access);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.data?.accessToken) return false;
        tokens.setAccess(body.data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export interface ApiError extends Error {
  reason?: string;
  status?: number;
}

async function request<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const access = tokens.access;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(`Cannot reach the local backend at ${API_URL}. Start it and try again.`);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }

  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    if (allowRefresh && await refreshAccessToken()) {
      return request<T>(path, options, false);
    }
    tokens.clear();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  if (!res.ok) {
    const err = new Error(body?.message || `Request failed (${res.status})`) as ApiError;
    err.reason = body?.reason;
    err.status = res.status;
    throw err;
  }
  return (body?.data ?? body) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
};
