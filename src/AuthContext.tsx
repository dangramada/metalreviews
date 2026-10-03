import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthState {
  user: User | null;
  loading: boolean;
}

// Consumers only read user.id and user.email, and several use `user` as an effect dependency.
// supabase-js hands over a freshly parsed User object on INITIAL_SESSION and TOKEN_REFRESHED, so
// keep the previous reference unless the identity actually changed.
function keepIfSameUser(prev: User | null, next: User | null): User | null {
  return prev && next && prev.id === next.id && prev.email === next.email ? prev : next;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve the current session once on mount, then flip loading off.
    // getSession() resolves the first render. onAuthStateChange also emits INITIAL_SESSION
    // (and TOKEN_REFRESHED later) with a new User object; keepIfSameUser absorbs those.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.warn('Failed to get session:', error.message);
        setUser((prev) => keepIfSameUser(prev, data?.session?.user ?? null));
        setLoading(false);
      })
      .catch((e: unknown) => {
        console.warn('getSession failed:', e instanceof Error ? e.message : e);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => keepIfSameUser(prev, session?.user ?? null));
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
