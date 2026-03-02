import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeConfig {
  /** Channel name (must be unique per component instance) */
  channelName: string;
  /** Tables to subscribe to */
  tables: {
    table: string;
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    filter?: string;
    /** Query keys to invalidate when this table changes */
    queryKeys: string[][];
  }[];
  /** Whether subscription is enabled */
  enabled?: boolean;
}

/**
 * Hook that subscribes to Supabase Realtime postgres_changes
 * and automatically invalidates TanStack Query caches.
 */
export function useRealtimeSubscription({ channelName, tables, enabled = true }: RealtimeConfig) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    let channel: RealtimeChannel = supabase.channel(channelName);

    for (const t of tables) {
      channel = channel.on(
        'postgres_changes',
        {
          event: t.event || '*',
          schema: 'public',
          table: t.table,
          ...(t.filter ? { filter: t.filter } : {}),
        },
        () => {
          // Invalidate all related query keys
          for (const key of t.queryKeys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, queryClient]);
}
