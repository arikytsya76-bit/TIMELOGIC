import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { loginApi, logoutApi, getMeApi, canUseDeviceCheckIn, AuthUser } from '../services/authService';
import { tokenStore } from '../services/tokenStore';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: async () => ({ success: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const access = await tokenStore.loadFromSecureStore();
        if (!access) return;
        const restoredUser = await getMeApi();
        if (restoredUser.role !== 'EMPLOYEE' || !canUseDeviceCheckIn(restoredUser)) {
          await logoutApi();
          return;
        }
        if (active) setUser(restoredUser);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      const u = await loginApi(identifier.trim(), password);
      setUser(u);
      return { success: true };
    } catch (err: any) {
      tokenStore.clear();
      return { success: false, error: err?.message ?? 'Login failed. Please try again.' };
    }
  };

  const logout = () => {
    logoutApi();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
