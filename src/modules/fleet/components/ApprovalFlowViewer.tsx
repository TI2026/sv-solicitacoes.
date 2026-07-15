/**
 * ApprovalFlowViewer.tsx
 *
 * CAMADA: Component
 *
 * Responsabilidade única: renderizar os steps do fluxo de aprovação.
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
 *   Component (este arquivo) → useApprovalFlowSteps → loadApprovalSteps → Supabase
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, XCircle, RotateCcw, Clock } from 'lucide-react';
import { useApprovalFlowSteps } from '../hooks/useApprovalFlowSteps';

export function ApprovalFlowViewer({ approvalRequestId }: { approvalRequestId: string }) {
  const queryClient = useQueryClient();
  const { data: steps = [], isLoading } = useApprovalFlowSteps(approvalRequestId);

  // Realtime: APENAS invalida o cache. Nunca busca dados diretamente.
  // O React Query decide se e quando recarregar com base no staleTime e nos triggers.
  useEffect(() => {
    if (!approvalRequestId) return;

    const channel = supabase
      .channel(`approval-flow-${approvalRequestId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_request_steps',
          filter: `approval_request_id=eq.${approvalRequestId}`,
        },
        (payload) => {
          // Validação defensiva: só invalida se o payload pertence ao contexto atual.
          // O filtro do Supabase já faz essa triagem, mas verificamos também no cliente
          // como proteção extra contra payloads inesperados de subscriptions compartilhadas.
          const record = (payload.new ?? payload.old) as any;
          if (record?.approval_request_id !== approvalRequestId) return;

          queryClient.invalidateQueries({ queryKey: ['approval_flow_steps', approvalRequestId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [approvalRequestId, queryClient]);

  // — JSX idêntico ao anterior. Nenhuma alteração visual. —

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (steps.length === 0) return <p className="text-sm text-muted-foreground py-2 text-center">Nenhuma etapa configurada</p>;

  return (
    <div className="space-y-2">
      {steps.map((s) => {
        const icon = s.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          : s.status === 'rejected' ? <XCircle className="w-4 h-4 text-destructive" />
          : s.status === 'returned' ? <RotateCcw className="w-4 h-4 text-amber-600" />
          : <Clock className="w-4 h-4 text-muted-foreground" />;
        const label = s.status === 'approved' ? 'Aprovada'
          : s.status === 'rejected' ? 'Recusada'
          : s.status === 'returned' ? 'Devolvida'
          : 'Pendente';
        return (
          <div key={s.id} className="flex items-start gap-3 p-2 rounded-md border bg-card">
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-medium">Etapa {s.step_order}</span>
                <span className="text-muted-foreground">·</span>
                <span>{label}</span>
                {s.profiles?.full_name && <span className="text-muted-foreground">· {s.profiles.full_name}</span>}
              </div>
              {s.comments && <p className="text-xs text-muted-foreground mt-1 italic">"{s.comments}"</p>}
              {s.action_at && <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(s.action_at).toLocaleString('pt-BR')}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}