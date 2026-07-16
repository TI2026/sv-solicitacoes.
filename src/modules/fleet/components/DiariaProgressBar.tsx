/**
 * DiariaProgressBar.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade única: renderizar o progresso da Diária em 8 etapas.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA gerenciar estado de dados (useState, useEffect de carregamento).
 *  - NUNCA controlar cache ou invalidações.
 *
 * O Realtime é tratado aqui apenas como gatilho de invalidação.
 * Ele NUNCA busca dados. Quem decide se precisa recarregar é o React Query.
 *
 * Padrão arquitetural:
 *   Component (este arquivo) → useDiariaProgress → loadDiariaStatusDates → Supabase
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, Clock, Circle, Loader2 } from 'lucide-react';
import { useDiariaProgress } from '../hooks/useDiariaProgress';

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
  const queryClient = useQueryClient();
  const { data: dates = {}, isLoading } = useDiariaProgress(requestId);

  // Realtime: APENAS invalida o cache. Nunca busca dados diretamente.
  // O React Query decide se e quando recarregar com base no staleTime e nos triggers.
  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`diaria-progress-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'status_history',
          filter: `entity_id=eq.${requestId}`,
        },
        (payload) => {
          // Validação defensiva: só invalida se o payload pertence ao contexto atual.
          const record = payload.new as any;
          if (record?.entity_id !== requestId) return;

          queryClient.invalidateQueries({ queryKey: ['diaria_progress', requestId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, queryClient]);

  // — JSX idêntico ao anterior. Nenhuma alteração visual. —

  const isCancelled = ['cancelado', 'reprovado', 'encerrado', 'retornado'].includes(currentStatus);

  if (isLoading) {
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