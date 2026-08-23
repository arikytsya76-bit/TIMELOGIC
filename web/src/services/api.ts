import { API_URL } from '../config';

let _token: string | null = localStorage.getItem('accessToken');

export function setToken(t: string | null) {
  _token = t;
  if (t) localStorage.setItem('accessToken', t);
  else localStorage.removeItem('accessToken');
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

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: Method, path: string, body?: unknown, allowRefresh = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(`Cannot reach the local backend at ${API_URL}. Start it and try again.`, 0);
  }

  const data = await res.json().catch(() => null);

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    if (allowRefresh && await refreshAccessToken()) {
      return request<T>(method, path, body, false);
    }
    setToken(null);
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  if (!res.ok) throw new ApiError(data?.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const api = {
  get:    <T>(path: string)                => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)               => request<T>('DELETE', path),
};
