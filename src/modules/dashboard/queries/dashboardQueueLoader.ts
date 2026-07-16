/**
 * dashboardQueueLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: consultar approval_requests onde o usuário logado
 * é o aprovador atual e o fluxo ainda está ativo (ended_at IS NULL).
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA importar React, hooks ou QueryClient.
 *  - NUNCA gerenciar estado, cache ou invalidações.
 *  - Apenas consultar e retornar dados tipados.
 *
 * Padrão: Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';

export interface QueueItem {
  id: string;
  reference_id: string;
  status: string;
  current_step_order: number | null;
  created_at: string;
  module_code: string | null;
  module_name: string | null;
  requester_name: string | null;
}

export interface QueueSummary {
  total: number;
  /** Criadas há mais de 48h e ainda pendentes */
  urgent: number;
  /** returned_to_requester ou returned_for_adjustment */
  returned: number;
}

function isUrgent(createdAt: string): boolean {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  return diffMs > 48 * 60 * 60 * 1000;
}

const RETURNED_STATUSES = new Set(['returned_to_requester', 'returned_for_adjustment']);

export async function loadDashboardQueue(userId: string): Promise<{
  items: QueueItem[];
  summary: QueueSummary;
}> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select(`
      id,
      reference_id,
      status,
      current_step_order,
      created_at,
      approval_modules(code, name),
      profiles!approval_requests_requester_user_id_fkey(full_name)
    `)
    .eq('current_approver_user_id', userId)
    .is('ended_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const items: QueueItem[] = (data || []).map((row: any) => ({
    id: row.id,
    reference_id: row.reference_id,
    status: row.status,
    current_step_order: row.current_step_order,
    created_at: row.created_at,
    module_code: row.approval_modules?.code ?? null,
    module_name: row.approval_modules?.name ?? null,
    requester_name: row.profiles?.full_name ?? null,
  }));

  const summary: QueueSummary = {
    total: items.length,
    urgent: items.filter(i => isUrgent(i.created_at)).length,
    returned: items.filter(i => RETURNED_STATUSES.has(i.status)).length,
  };

  return { items, summary };
}
