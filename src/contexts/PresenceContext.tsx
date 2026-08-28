import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PresenceContextData {
  onlineUsers: any[];
}

const PresenceContext = createContext<PresenceContextData>({ onlineUsers: [] });

export const usePresence = () => useContext(PresenceContext);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const channelRef = useRef<any>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setOnlineUsers([]);
      return;
    }

    let active = true;
    const channelTopic = 'online-users';

    const setupPresence = async () => {
      const staleChannels = ((supabase as any).getChannels?.() || []).filter(
        (channel: any) => channel?.topic === `realtime:${channelTopic}` || channel?.topic === channelTopic,
      );
      await Promise.all(staleChannels.map((channel: any) => supabase.removeChannel(channel)));

      if (!active) return;

      const channel = supabase.channel(channelTopic, {
        config: { presence: { key: sessionIdRef.current } },
      });

      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const users = Object.values(state).flat().map((p: any) => ({
            session_id: p.session_id,
          }));
          const unique = Array.from(new Map(users.map(u => [u.session_id, u])).values());
          setOnlineUsers(unique);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && active) {
            await channel.track({
              session_id: sessionIdRef.current,
              online_at: new Date().toISOString(),
            });
          }
        });
    };

    setupPresence().catch((error) => console.error('Error setting up presence:', error));

    return () => {
      active = false;
      const channel = channelRef.current;
      if (!channel) return;
      if (channelRef.current === channel) {
        supabase.removeChannel(channel);
        channelRef.current = null;
      } else {
        supabase.removeChannel(channel);
      }
    };
  }, [user]); // Only recreate channel when user changes

  return (
    <PresenceContext.Provider value={{ onlineUsers }}>
      {children}
    </PresenceContext.Provider>
  );
}
