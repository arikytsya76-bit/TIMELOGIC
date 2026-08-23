import { API_URL } from '../config';
import { tokenStore } from './tokenStore';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.data?.accessToken) return false;
        tokenStore.setAccess(body.data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(method: Method, path: string, body?: unknown, allowRefresh = true): Promise<T> {
  const token = tokenStore.getAccess();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(`Cannot reach the local backend at ${API_URL}. Check the PC, Wi-Fi, and firewall.`);
  }

  const data = await res.json().catch(() => null);

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    if (allowRefresh && await refreshAccessToken()) {
      return request<T>(method, path, body, false);
    }
    tokenStore.clear();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(data?.message ?? `Request failed (${res.status})`);
  }

  return (data?.data ?? data) as T;
}

export const api = {
  get:    <T>(path: string)              => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)              => request<T>('DELETE', path),
};
