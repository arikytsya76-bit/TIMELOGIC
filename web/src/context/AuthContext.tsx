import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setToken, getToken } from '../services/api';

interface SuperAdmin {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'SUPER_ADMIN';
  orgId: string;
}

interface AuthCtx {
  user: SuperAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => ({ ok: false, error: 'Authentication is unavailable.' }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SuperAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken()) {
      api.get<{ success: boolean; data: SuperAdmin }>('/auth/me')
        .then((res) => {
          if (res.data?.role === 'SUPER_ADMIN') setUser(res.data);
          else setToken(null);
        })
        .catch(() => setToken(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post<{ success: boolean; data: { accessToken: string; refreshToken: string; user: SuperAdmin } }>('/auth/login', { email, password });
      if (res.data.user.role !== 'SUPER_ADMIN') {
        setToken(res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        await api.post('/auth/logout', { refreshToken: res.data.refreshToken }).catch(() => {});
        setToken(null);
        localStorage.removeItem('refreshToken');
        return { ok: false, error: 'This account belongs in the Desktop Admin app, not the Super Admin portal.' };
      }
      setToken(res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      setUser(res.data.user);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      return {
        ok: false,
        error: message === 'Invalid credentials'
          ? 'Invalid email or password. Please try again.'
          : message,
      };
    }
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refreshToken');
    if (refresh) api.post('/auth/logout', { refreshToken: refresh }).catch(() => {});
    setToken(null);
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
