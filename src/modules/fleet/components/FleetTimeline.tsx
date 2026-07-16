/**
 * FleetTimeline.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade única: renderizar a timeline de eventos da solicitação.
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
 *   Component (este arquivo) → useFleetTimeline → loadFleetTimeline → Supabase
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock, FileText, CreditCard, CheckCircle2, XCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { FUEL_STATUS_LABELS } from '@/lib/constants';
import { useFleetTimeline } from '../hooks/useFleetTimeline';
import type { TimelineEvent } from '../queries/fleetTimelineLoader';

interface FleetTimelineProps {
  requestId: string;
  req: any;
  approvalRequest: any;
}

function renderIcon(kind: TimelineEvent['icon']) {
  const cls = 'w-3.5 h-3.5';
  switch (kind) {
    case 'send': return <Send className={cls} />;
    case 'oc': return <FileText className={cls} />;
    case 'payment': return <CreditCard className={cls} />;
    case 'approve': return <CheckCircle2 className={cls} />;
    case 'reject': return <XCircle className={cls} />;
    case 'return': return <RotateCcw className={cls} />;
    case 'sparkles': return <Sparkles className={cls} />;
    default: return <Clock className={cls} />;
  }
}

export function FleetTimeline({ requestId, req, approvalRequest }: FleetTimelineProps) {
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useFleetTimeline({
    requestId,
    req,
    approvalRequestId: approvalRequest?.id,
  });

  // Realtime: APENAS invalida o cache. Nunca busca dados diretamente.
  // O React Query decide se e quando recarregar com base no staleTime e nos triggers.
  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`fleet-timeline-${requestId}`)
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

          queryClient.invalidateQueries({ queryKey: ['fleet_timeline', requestId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, queryClient]);

  // — JSX idêntico ao anterior. Nenhuma alteração visual. —

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado ainda</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((e, idx) => (
        <div key={e.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              e.kind === 'approval' ? 'bg-primary/10 text-primary' :
              e.kind === 'oc' ? 'bg-amber-100 text-amber-700' :
              e.kind === 'payment' ? 'bg-emerald-100 text-emerald-700' :
              e.kind === 'created' ? 'bg-blue-100 text-blue-700' :
              'bg-muted text-muted-foreground'
            }`}>{renderIcon(e.icon)}</div>
            {idx < events.length - 1 && <div className="w-px flex-1 bg-border min-h-[24px]" />}
          </div>
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {e.kind === 'status' && e.toStatus ? (
                <StatusBadge status={e.toStatus} label={FUEL_STATUS_LABELS[e.toStatus] || e.toStatus} />
              ) : (
                <span className="text-sm font-medium text-foreground">{e.title}</span>
              )}
              {e.fromStatus && (
                <span className="text-xs text-muted-foreground">← {FUEL_STATUS_LABELS[e.fromStatus] || e.fromStatus}</span>
              )}
            </div>
            {e.detail && (
              <p className="text-xs text-muted-foreground mt-1 italic line-clamp-3">"{e.detail}"</p>
            )}
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(e.at).toLocaleString('pt-BR')}
              {e.actor && <span>· {e.actor}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}