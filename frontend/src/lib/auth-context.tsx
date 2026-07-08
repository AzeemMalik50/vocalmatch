'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { AuthUser, ApiError, api } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<AuthUser>;
  signup: (
    email: string,
    username: string,
    password: string,
    acceptedTerms: boolean,
    acceptedPrivacy: boolean,
    turnstileToken?: string,
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
    // Refresh from /me on mount so flags like isAdmin/isSongwriter
    // pick up server-side changes without forcing a re-login.
    if (localStorage.getItem('vm_token')) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (token: string, u: AuthUser) => {
    localStorage.setItem('vm_token', token);
    localStorage.setItem('vm_user', JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string, turnstileToken?: string) => {
    const { token, user } = await api.login({ email, password, turnstileToken });
    persist(token, user);
    return user;
  };

  const signup = async (
    email: string,
    username: string,
    password: string,
    acceptedTerms: boolean,
    acceptedPrivacy: boolean,
    turnstileToken?: string,
  ) => {
    const { token, user } = await api.signup({
      email,
      username,
      password,
      acceptedTerms,
      acceptedPrivacy,
      turnstileToken,
    });
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
      // /users/me doesn't return email — preserve it from existing state
      const prev = JSON.parse(localStorage.getItem('vm_user') || '{}');
      const merged: AuthUser = {
        id: me.id,
        email: prev.email ?? '',
        username: me.username,
        avatarUrl: me.avatarUrl,
        profileCompleted: me.profileCompleted,
        isAdmin: me.isAdmin,
        isSongwriter: me.isSongwriter,
      };
      localStorage.setItem('vm_user', JSON.stringify(merged));
      setUser(merged);
    } catch (err) {
      // Bug — the catch used to fire logout() on ANY failure. Safari
      // cancels in-flight fetches when the user presses F5, and the
      // aborted `/me` promise rejected with a network error. That
      // wiped vm_token from localStorage before the new page loaded,
      // logging the user out on refresh. Only actual HTTP 401 means
      // the token is invalid; a network/CORS/abort error should leave
      // the cached session alone so the next call can retry.
      const status = err instanceof ApiError ? err.status : null;
      if (status === 401 || status === 403) {
        logout();
      }
      // Otherwise: swallow silently. The cached user in state and
      // localStorage is still authoritative; the next page mount /
      // successful request will reconcile.
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
