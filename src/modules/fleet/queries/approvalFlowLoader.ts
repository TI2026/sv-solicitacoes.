/**
 * approvalFlowLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade única: consultar o Supabase e retornar dados brutos.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA importar React, Hooks ou QueryClient.
 *  - NUNCA gerenciar estado, cache ou invalidações.
 *  - NUNCA conter regras de negócio.
 *  - Apenas consultar, ordenar e retornar.
 *
 * Padrão arquitetural:
 *   Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';

export interface ApprovalStep {
  id: string;
  step_order: number;
  status: string;
  action_at: string | null;
  comments: string | null;
  approver_user_id: string | null;
  profiles?: { full_name: string | null } | null;
}

/**
 * Consulta os steps de um approval_request, ordenados por step_order.
 * Retorna um array vazio em caso de ausência de dados.
 */
export async function loadApprovalSteps(approvalRequestId: string): Promise<ApprovalStep[]> {
  const { data, error } = await supabase
    .from('approval_request_steps')
    .select('id, step_order, status, action_at, comments, approver_user_id, profiles:approver_user_id(full_name)')
    .eq('approval_request_id', approvalRequestId)
    .order('step_order', { ascending: true });

  if (error) throw error;

  return (data as ApprovalStep[]) ?? [];
}
