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
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const debouncedInvalidate = (key: string, queryKeys: string[][]) => {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(key, setTimeout(() => {
        for (const qk of queryKeys) queryClient.invalidateQueries({ queryKey: qk });
        timers.delete(key);
      }, 300));
    };

    for (const t of tables) {
      channel = (channel as any).on(
        'postgres_changes',
        {
          event: t.event || '*',
          schema: 'public',
          table: t.table,
          ...(t.filter ? { filter: t.filter } : {}),
        },
        () => {
          debouncedInvalidate(t.table, t.queryKeys);
        }
      );
    }

    channel.subscribe();

    return () => {
      for (const tm of timers.values()) clearTimeout(tm);
      timers.clear();
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, queryClient]);
}
