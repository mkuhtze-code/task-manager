'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabaseClient';
import { HAS_SIGNED_IN_KEY } from '@/lib/taskTypes';

export type AuthContextValue = {
  /** Supabase session, or null when signed out. */
  session: any;
  setSession: (s: any) => void;
  /**
   * False until the first getSession() resolves (or onAuthStateChange
   * delivers a definitive state). Consumers must not treat session===null
   * as signed-out until authReady is true — that is the login-flash bug.
   */
  authReady: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Establishes auth once at the app boundary. Today and other surfaces
 * consume this instead of each calling getSession() on mount.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  const setSession = useCallback((s: Session | null) => {
    setSessionState(s);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSessionState(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSessionState(s);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && typeof window !== 'undefined') {
      window.localStorage.setItem(HAS_SIGNED_IN_KEY, 'true');
    }
  }, [session]);

  const value = useMemo(
    () => ({ session, setSession, authReady }),
    [session, setSession, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

