import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setToken, getToken } from '../services/api';
import type { AdminOrganization, AdminUser } from '../types/api';

interface AuthCtx {
  user: AdminUser | null;
  organization: AdminOrganization | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  serverNow: Date | null;
  organizationTimezone: string;
  currentTime: () => Date | null;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  organization: null,
  loading: true,
  login: async () => ({ ok: false, error: 'Authentication is unavailable.' }),
  logout: () => {},
  serverNow: null,
  organizationTimezone: 'Africa/Lagos',
  currentTime: () => null,
});

function normalizeUser(raw: AdminUser): AdminUser {
  const organization = raw.organization;
  return {
    ...raw,
    organization: {
      id: organization?.id ?? raw.orgId,
      name: organization?.name ?? 'Organization',
      allowDeviceCheckIn: organization?.allowDeviceCheckIn ?? true,
      allowManualCheckIn: organization?.allowManualCheckIn ?? false,
      hasStudents: organization?.hasStudents ?? false,
      openingTime: organization?.openingTime ?? null,
      timezone: organization?.timezone ?? null,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState<Date | null>(null);
  const [serverNowAt, setServerNowAt] = useState(0);

  const syncServerTime = async () => {
    const response = await api.get<{ success: boolean; data?: { now?: string } }>('/reports/server-time');
    const next = response.data?.now ? new Date(response.data.now) : null;
    if (next && !Number.isNaN(next.getTime())) {
      setServerNow(next);
      setServerNowAt(Date.now());
    }
  };

  // Restore session on mount
  useEffect(() => {
    const token = getToken();
    if (token) {
      api.get<{ success: boolean; data: AdminUser }>('/auth/me')
        .then((res) => {
          if (res.data && ['ADMIN', 'SUPER_ADMIN'].includes(res.data.role)) setUser(normalizeUser(res.data));
          else setToken(null);
        })
        .catch(() => {
          // Token invalid or server down — clear it
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for 401 events emitted by the api client
  useEffect(() => {
    const handler = () => { setUser(null); setLoading(false); };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  // Capability changes are controlled by the Super Admin web app. Refresh them
  // while this Desktop session is open so tabs and employee-method choices stay current.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshUser = async () => {
      try {
        const response = await api.get<{ success: boolean; data: AdminUser }>('/auth/me');
        if (active && response.data && ['ADMIN', 'SUPER_ADMIN'].includes(response.data.role)) {
          setUser(normalizeUser(response.data));
        }
      } catch { /* the shared API client handles expired sessions */ }
    };
    const timer = window.setInterval(() => void refreshUser(), 30_000);
    const onFocus = () => void refreshUser();
    const clockTimer = window.setInterval(() => void syncServerTime().catch(() => {}), 30_000);
    void syncServerTime().catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(clockTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  const login = async (identifier: string, password: string) => {
    try {
      const isEmail = identifier.includes('@');
      const body = isEmail
        ? { email: identifier, password }
        : { employeeCode: identifier, password };

      const res = await api.post<{
        success: boolean;
        data: { accessToken: string; refreshToken: string; user: AdminUser };
      }>('/auth/login', body);

      if (!['ADMIN', 'SUPER_ADMIN'].includes(res.data.user.role)) {
        setToken(res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        await api.post('/auth/logout', { refreshToken: res.data.refreshToken }).catch(() => {});
        setToken(null);
        localStorage.removeItem('refreshToken');
        return { ok: false, error: 'Employee accounts must use the Android app or employee PWA.' };
      }

      // Save both tokens
      setToken(res.data.accessToken);                            // persists to localStorage
      localStorage.setItem('refreshToken', res.data.refreshToken);

      setUser(normalizeUser(res.data.user));
      void syncServerTime().catch(() => {});
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      return {
        ok: false,
        error: message === 'Invalid credentials'
          ? 'Invalid credentials. Check your email/code and password.'
          : message,
      };
    }
  };

  const logout = () => {
    const refresh = localStorage.getItem('refreshToken');
    if (refresh) {
      api.post('/auth/logout', { refreshToken: refresh }).catch(() => {});
    }
    setToken(null);
    localStorage.removeItem('refreshToken');
    setUser(null);
    setServerNow(null);
    setServerNowAt(0);
  };

  const currentTime = () => serverNow ? new Date(serverNow.getTime() + Math.max(0, Date.now() - serverNowAt)) : null;

  return (
    <AuthContext.Provider value={{
      user,
      organization: user?.organization ?? null,
      loading,
      login,
      logout,
      serverNow,
      organizationTimezone: user?.organization?.timezone || 'Africa/Lagos',
      currentTime,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
