'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { AuthUser, api } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (
    email: string,
    username: string,
    password: string,
  ) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Update locally cached user without a server call */
  patchUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem('vm_user');
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch {}
    }
    setLoading(false);
  }, []);

  const persist = (token: string, u: AuthUser) => {
    localStorage.setItem('vm_token', token);
    localStorage.setItem('vm_user', JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login({ email, password });
    persist(token, user);
    return user;
  };

  const signup = async (email: string, username: string, password: string) => {
    const { token, user } = await api.signup({ email, username, password });
    // Newly signed-up users haven't completed profile by default
    const enriched: AuthUser = { ...user, profileCompleted: false };
    persist(token, enriched);
    return enriched;
  };

  const logout = () => {
    localStorage.removeItem('vm_token');
    localStorage.removeItem('vm_user');
    setUser(null);
  };

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('vm_token')) return;
    try {
      const me = await api.me();
      const updated: AuthUser = {
        id: me.id,
        email: '', // /users/me doesn't return email; preserve from state
        username: me.username,
        avatarUrl: me.avatarUrl,
        profileCompleted: me.profileCompleted,
      };
      // Preserve email from existing state
      const prev = JSON.parse(localStorage.getItem('vm_user') || '{}');
      const merged = { ...updated, email: prev.email ?? '' };
      localStorage.setItem('vm_user', JSON.stringify(merged));
      setUser(merged);
    } catch {
      // token invalid → silent logout
      logout();
    }
  }, []);

  const patchUser = (patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      localStorage.setItem('vm_user', JSON.stringify(merged));
      return merged;
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, logout, refresh, patchUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
