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
  /**
   * Snapshot do tipo semântico da etapa vindo de `approval_flow_steps`.
   * Usado para renderizar rótulos como "Responsável do setor X" ou
   * "Usuário fixo: Fulano". Pode ser null quando o flow_step foi removido
   * após o snapshot do request — nesse caso o Viewer aplica o fallback.
   */
  approval_flow_steps?: {
    approver_type: string | null;
    fixed_sector_id: string | null;
    sectors?: { name: string | null } | null;
  } | null;
}

/**
 * Consulta os steps de um approval_request, ordenados por step_order.
 * Retorna um array vazio em caso de ausência de dados.
 */
export async function loadApprovalSteps(approvalRequestId: string): Promise<ApprovalStep[]> {
  const { data, error } = await supabase
    .from('approval_request_steps')
    .select(`
      id, step_order, status, action_at, comments, approver_user_id,
      profiles:approver_user_id(full_name),
      approval_flow_steps:flow_step_id(
        approver_type,
        fixed_sector_id,
        sectors:fixed_sector_id(name)
      )
    `)
    .eq('approval_request_id', approvalRequestId)
    .order('step_order', { ascending: true });

  if (error) throw error;

  return (data as unknown as ApprovalStep[]) ?? [];
}
