import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Profile, UserWithRoles } from '@/types';

interface AuthContextType {
  session: Session | null;
  user: UserWithRoles | null;
  loading: boolean;
  isAuthenticated: boolean;
  isMaster: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string, department?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchUserWithRoles(authUser: User): Promise<UserWithRoles | null> {
  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!profile) return null;

  // Fetch roles via security definer function
  const { data: rolesData, error: rolesError } = await supabase.rpc('get_user_roles', { _user_id: authUser.id });

  if (rolesError) {
    console.error('Error fetching roles from get_user_roles:', rolesError);
  }

  const roles: AppRole[] = (rolesData as AppRole[]) || [];

  return {
    ...(profile as Profile),
    roles,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const userWithRoles = await fetchUserWithRoles(authUser);
      setUser(userWithRoles);
    } catch (err) {
      console.error('Error loading user profile:', err);
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        } else if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => loadUser(session.user), 0);
        }
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUser(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUser]);

  // Realtime: refresh local user when role assignments or profile change.
  // Only modern tables (user_role_assignments + profiles), debounced.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (session?.user) loadUser(session.user);
      }, 300);
    };
    const channel = supabase
      .channel(`auth-user-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_role_assignments', filter: `user_id=eq.${uid}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, trigger)
      .subscribe();
    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadUser]);

  const hasRole = useCallback((role: AppRole) => {
    return user?.roles.includes(role) ?? false;
  }, [user]);

  const hasAnyRole = useCallback((roles: AppRole[]) => {
    return roles.some(r => user?.roles.includes(r)) ?? false;
  }, [user]);

  const isMaster = user?.roles.includes('master') ?? false;

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, department?: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };

    // Update department if provided (profile already created by trigger)
    if (department && data.user) {
      await supabase
        .from('profiles')
        .update({ department })
        .eq('id', data.user.id);
    }

    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await loadUser(session.user);
    }
  }, [session, loadUser]);

  return (
    <AuthContext.Provider value={{
      session,
      user,
      loading,
      isAuthenticated: !!session && !!user,
      isMaster,
      hasRole,
      hasAnyRole,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
