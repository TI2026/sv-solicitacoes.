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
  /** Etapa vencida ou a vencer conforme o SLA real da etapa (sla_deadline). */
  urgent: number;
  /** returned_to_requester ou returned_for_adjustment */
  returned: number;
}

const RETURNED_STATUSES = new Set(['returned_to_requester', 'returned_for_adjustment']);

export async function loadDashboardQueue(userId: string): Promise<{
  items: QueueItem[];
  summary: QueueSummary;
}> {
  void userId; // escopo real vem de auth.uid() dentro do RPC
  // Fonte única da fila: get_my_approval_queue() — mesma regra usada pelo
  // Dashboard, pela página de Pendências e pelo motor (V2 = awaiting_step;
  // compatibilidade V1 isolada no próprio RPC).
  const { data: queue, error: queueError } = await (supabase as any).rpc('get_my_approval_queue');
  if (queueError) throw queueError;

  const ids: string[] = (Array.isArray(queue) ? queue : []).map((r: any) => r.id);
  if (ids.length === 0) {
    return { items: [], summary: { total: 0, urgent: 0, returned: 0 } };
  }

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
    .in('id', ids)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // [Checkpoint A] Urgência vem do SLA real da etapa pendente, não de "48h desde a criação".
  const { data: steps, error: stepsError } = await supabase
    .from('approval_request_steps')
    .select('approval_request_id, status, sla_deadline, overdue')
    .in('approval_request_id', ids)
    .eq('status', 'pending');
  if (stepsError) throw stepsError;

  const now = Date.now();
  const urgentRequestIds = new Set(
    (Array.isArray(steps) ? steps : [])
      .filter((s: any) => s.overdue === true || (s.sla_deadline && new Date(s.sla_deadline).getTime() <= now))
      .map((s: any) => s.approval_request_id as string),
  );

  const items: QueueItem[] = (Array.isArray(data) ? data : []).map((row: any) => ({
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
    urgent: items.filter(i => urgentRequestIds.has(i.id)).length,
    returned: items.filter(i => RETURNED_STATUSES.has(i.status)).length,
  };

  return { items, summary };
}
