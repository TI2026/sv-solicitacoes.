import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PresenceContextData {
  onlineUsers: any[];
}

const PresenceContext = createContext<PresenceContextData>({ onlineUsers: [] });

export const usePresence = () => useContext(PresenceContext);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    const primaryRole = user.roles?.[0] || 'colaborador';
    const channel = supabase.channel(`online-users-${user.id}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
          role: p.role || 'colaborador',
          current_route: p.current_route || '/',
        }));
        const unique = Array.from(new Map(users.map(u => [u.user_id, u])).values());
        setOnlineUsers(unique);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            full_name: user.full_name || user.email,
            email: user.email,
            avatar_url: user.avatar_url || null,
            role: primaryRole,
            current_route: location.pathname,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error("Error during presence cleanup:", error);
      }
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [user]); 

  const previousLocationRef = useRef(location.pathname);

  useEffect(() => {
    if (!user || !channelRef.current) return;
    
    if (previousLocationRef.current === location.pathname) return;
    previousLocationRef.current = location.pathname;

    const primaryRole = user.roles?.[0] || 'colaborador';
    channelRef.current.track({
      user_id: user.id,
      full_name: user.full_name || user.email,
      email: user.email,
      avatar_url: user.avatar_url || null,
      role: primaryRole,
      current_route: location.pathname,
      online_at: new Date().toISOString(),
    }).catch(console.error);
  }, [location.pathname, user]);

  return (
    <PresenceContext.Provider value={{ onlineUsers }}>
      {children}
    </PresenceContext.Provider>
  );
}
