import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile, type Role } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  });

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    return data as Profile | null;
  };

  const refreshProfile = async () => {
    if (state.user) {
      const p = await loadProfile(state.user.id);
      setState((s) => ({ ...s, profile: p }));
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      (async () => {
        const profile = data.session?.user ? await loadProfile(data.session.user.id) : null;
        setState({
          session: data.session,
          user: data.session?.user ?? null,
          profile,
          loading: false,
        });
      })();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const profile = session?.user ? await loadProfile(session.user.id) : null;
        setState({ session, user: session?.user ?? null, profile, loading: false });
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ session: null, user: null, profile: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function canAccess(role: Role | null, allowed: Role[]): boolean {
  if (!role) return false;
  if (role === 'super_admin' || role === 'owner') return true;
  return allowed.includes(role);
}
