/**
 * useGlobalWorkflowRealtime
 *
 * CAMADA: Hook (infraestrutura)
 *
 * Assinatura única de eventos do banco para TODO o workflow.
 * Sempre que uma solicitação, etapa de aprovação, fluxo ou notificação muda,
 * as telas abertas de qualquer usuário revalidam os dados automaticamente —
 * sem recarregar a página.
 *
 * Não contém regra de negócio: apenas coordena a invalidação via
 * refreshApprovalData (orquestrador central já existente).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

const WORKFLOW_TABLES = [
  'fuel_requests',
  'purchases',
  'admission_requests',
  'termination_requests',
  'approval_requests',
  'approval_request_steps',
  'status_history',
  'notifications',
] as const;

export function useGlobalWorkflowRealtime(enabled: boolean) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let channel = supabase.channel('workflow-global');

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        refreshApprovalData(qc);
        qc.invalidateQueries({ queryKey: ['notifications'] });
        timer.current = null;
      }, 250);
    };

    for (const table of WORKFLOW_TABLES) {
      channel = (channel as any).on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        schedule,
      );
    }

    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
