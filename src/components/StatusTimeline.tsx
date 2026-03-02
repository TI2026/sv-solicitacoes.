import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface TimelineEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  created_at: string;
  changer_name?: string;
}

interface StatusTimelineProps {
  entityId: string;
  entityType: string;
  module: string;
  statusLabels: Record<string, string>;
}

export function StatusTimeline({ entityId, entityType, module, statusLabels }: StatusTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('status_history')
        .select('*')
        .eq('entity_id', entityId)
        .eq('entity_type', entityType)
        .eq('module', module)
        .order('created_at', { ascending: false });
      
      if (data && data.length > 0) {
        const userIds = [...new Set(data.filter(d => d.changed_by).map(d => d.changed_by!))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        const nameMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        setEntries(data.map(d => ({ ...d, changer_name: d.changed_by ? nameMap.get(d.changed_by) || 'Sistema' : 'Sistema' })));
      } else {
        setEntries([]);
      }
      setLoading(false);
    };
    fetch();

    // Realtime
    const channel = supabase
      .channel(`timeline-${entityId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'status_history',
        filter: `entity_id=eq.${entityId}`,
      }, () => { fetch(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [entityId, entityType, module]);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (entries.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum histórico ainda</p>;

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <div key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-primary mt-2" />
            <div className="w-px flex-1 bg-border" />
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={e.to_status} label={statusLabels[e.to_status] || e.to_status} />
              {e.from_status && (
                <span className="text-xs text-muted-foreground">← {statusLabels[e.from_status] || e.from_status}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(e.created_at).toLocaleString('pt-BR')}
              <span>· {e.changer_name}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
