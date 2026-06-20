import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve the current session once on mount, then flip loading off.
    // onAuthStateChange fires on sign-in / sign-out events but does NOT fire
    // on the initial load, so we need getSession() for the first render.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.warn('Failed to get session:', error.message);
        setUser(data?.session?.user ?? null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        console.warn('getSession failed:', e instanceof Error ? e.message : e);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}
