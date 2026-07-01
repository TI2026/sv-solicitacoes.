import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Check, Clock, Circle, Loader2 } from 'lucide-react';

/**
 * 8-step canonical progression for the Diária workflow.
 * Maps logical steps to fuel_requests.status values that COMPLETE the step.
 */
const STEPS: { key: string; label: string; completedBy: string[] }[] = [
  { key: 'enviado',             label: 'Enviada',     completedBy: ['enviado', 'em_revisao', 'em_aprovacao', 'aprovado', 'aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'em_revisao',          label: 'Revisão',     completedBy: ['em_revisao', 'em_aprovacao', 'aprovado', 'aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'em_aprovacao',        label: 'Aprovação',   completedBy: ['em_aprovacao', 'aprovado', 'aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'aprovado',            label: 'Aprovada',    completedBy: ['aprovado', 'aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'aguardando_oc',       label: 'OC',          completedBy: ['aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'aguardando_pagamento',label: 'Pagamento',   completedBy: ['aguardando_pagamento', 'pago', 'concluido'] },
  { key: 'pago',                label: 'Pago',        completedBy: ['pago', 'concluido'] },
  { key: 'concluido',           label: 'Concluída',   completedBy: ['concluido'] },
];

interface Props {
  requestId: string;
  currentStatus: string;
}

export function DiariaProgressBar({ requestId, currentStatus }: Props) {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from('status_history')
        .select('to_status, created_at')
        .eq('entity_id', requestId)
        .eq('entity_type', 'fuel_requests')
        .eq('module', 'fleet')
        .order('created_at', { ascending: true });
      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (!map[row.to_status]) map[row.to_status] = row.created_at;
      }
      if (mounted) {
        setDates(map);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`diaria-progress-${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'status_history', filter: `entity_id=eq.${requestId}`,
      }, () => load())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [requestId]);

  const isCancelled = ['cancelado', 'reprovado', 'encerrado', 'retornado'].includes(currentStatus);

  if (loading) {
    return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  // Determine state per step
  const stepStates = STEPS.map(step => {
    const completed = step.completedBy.includes(currentStatus) && currentStatus !== step.key;
    const isCurrent = step.key === currentStatus;
    const reachedAt = dates[step.key] || null;
    return { ...step, completed: completed || isCurrent && step.key === 'concluido', isCurrent, reachedAt };
  });

  // Find current step index (or last completed)
  const currentIdx = STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className="space-y-2">
      {/* Mobile: vertical list / Desktop: horizontal */}
      <div className="hidden md:flex items-start gap-1">
        {stepStates.map((s, idx) => {
          const past = currentIdx >= 0 && idx < currentIdx;
          const isCurr = idx === currentIdx;
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                <div className={`flex-1 h-1 rounded-full ${idx === 0 ? 'opacity-0' : past ? 'bg-emerald-500' : 'bg-border'}`} />
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mx-1 transition-all ${
                  isCancelled && isCurr ? 'bg-destructive text-destructive-foreground' :
                  past || (isCurr && s.key === 'concluido') ? 'bg-emerald-500 text-white' :
                  isCurr ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-200 animate-pulse' :
                  'bg-muted text-muted-foreground border border-border'
                }`}>
                  {past || (isCurr && s.key === 'concluido') ? <Check className="w-4 h-4" /> :
                   isCurr ? <Clock className="w-4 h-4" /> :
                   <Circle className="w-3 h-3" />}
                </div>
                <div className={`flex-1 h-1 rounded-full ${idx === STEPS.length - 1 ? 'opacity-0' : (past && currentIdx > idx) || (isCurr && s.key === 'concluido') ? 'bg-emerald-500' : 'bg-border'}`} />
              </div>
              <div className="text-center mt-1.5">
                <p className={`text-[10px] font-medium ${isCurr ? 'text-amber-700' : past ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.label}</p>
                {s.reachedAt && (
                  <p className="text-[9px] text-muted-foreground">{new Date(s.reachedAt).toLocaleDateString('pt-BR')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile vertical */}
      <div className="md:hidden space-y-1.5">
        {stepStates.map((s, idx) => {
          const past = currentIdx >= 0 && idx < currentIdx;
          const isCurr = idx === currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isCancelled && isCurr ? 'bg-destructive text-destructive-foreground' :
                past || (isCurr && s.key === 'concluido') ? 'bg-emerald-500 text-white' :
                isCurr ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200 animate-pulse' :
                'bg-muted text-muted-foreground border border-border'
              }`}>
                {past || (isCurr && s.key === 'concluido') ? <Check className="w-3 h-3" /> :
                 isCurr ? <Clock className="w-3 h-3" /> :
                 <Circle className="w-2.5 h-2.5" />}
              </div>
              <span className={`text-xs flex-1 ${isCurr ? 'text-amber-700 font-semibold' : past ? 'text-emerald-700' : 'text-muted-foreground'}`}>{s.label}</span>
              {s.reachedAt && (
                <span className="text-[10px] text-muted-foreground">{new Date(s.reachedAt).toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}