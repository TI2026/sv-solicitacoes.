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
  const presenceTopicRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      presenceTopicRef.current = null;
      setOnlineUsers([]);
      return;
    }

    const primaryRole = user.roles?.[0] || 'colaborador';
    const channelTopic = `online-users-${user.id}-${crypto.randomUUID()}`;
    presenceTopicRef.current = channelTopic;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(channelTopic, {
      config: { presence: { key: user.id } },
    });

    channelRef.current = channel;

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
        // Remove duplicates if any (based on user_id)
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

    return () => {
      if (channelRef.current === channel) {
        supabase.removeChannel(channel);
        channelRef.current = null;
      } else {
        supabase.removeChannel(channel);
      }
      if (presenceTopicRef.current === channelTopic) {
        presenceTopicRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Only recreate channel when user changes

  // Update presence route on navigation, only if channel is ready and we have a user
  const previousLocationRef = useRef(location.pathname);
  useEffect(() => {
    if (!user || !channelRef.current) return;
    
    // Only track if route actually changed
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
