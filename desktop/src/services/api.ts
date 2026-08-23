import { API_URL } from '../config';

// ─── Token store — kept in memory AND persisted to localStorage ──────────────
let _token: string | null = null;

// Restore from localStorage on module load (page refresh / Electron restart)
try { _token = localStorage.getItem('accessToken'); } catch { _token = null; }

export function setToken(t: string | null) {
  _token = t;
  try {
    if (t) localStorage.setItem('accessToken', t);
    else   localStorage.removeItem('accessToken');
  } catch { /* localStorage unavailable (rare) */ }
}

export function getToken() { return _token; }

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
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
        setToken(body.data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
  });
  let res = await send();
  if (res.status === 401 && await refreshAccessToken()) res = await send();
  return res;
}

// ─── HTTP client ──────────────────────────────────────────────────────────────
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown, allowRefresh = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(`Cannot reach the local backend at ${API_URL}. Start it and try again.`);
  }

  const data = await res.json().catch(() => null);

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    if (allowRefresh && await refreshAccessToken()) {
      return request<T>(method, path, body, false);
    }
    // Clear stale token — let AuthContext detect the missing user and redirect via React Router
    setToken(null);
    localStorage.removeItem('refreshToken');
    // Dispatch a custom event so AuthContext can react without a hard reload
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) throw new Error(data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get:    <T>(path: string)                => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)               => request<T>('DELETE', path),
};
