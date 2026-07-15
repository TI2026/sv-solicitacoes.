/**
 * useApprovalFlowSteps.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade única: encapsular o React Query para approval_flow_steps.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA escrever SQL ou montar queries.
 *  - Delega toda consulta para loadApprovalSteps() (Loader).
 *
 * Configuração de cache (padrão do projeto):
 *  - staleTime: 30 000 ms — o dado é considerado obsoleto após 30s.
 *    Não faz refetch automático; apenas sinaliza que um trigger pode recarregar.
 *  - retry/gcTime/refetchOnWindowFocus: defaults do React Query (não sobreescrito).
 *
 * Query Key: ['approval_flow_steps', approvalRequestId]
 *  - Owner: tabela approval_request_steps
 *  - Invalidado por: refreshApprovalData()
 *  - Realtime: ApprovalFlowViewer invalida ao receber mudança pertencente ao contexto atual.
 *
 * Padrão arquitetural:
 *   Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadApprovalSteps, type ApprovalStep } from '../queries/approvalFlowLoader';

export function useApprovalFlowSteps(approvalRequestId: string) {
  return useQuery<ApprovalStep[]>({
    queryKey: ['approval_flow_steps', approvalRequestId],
    queryFn: () => loadApprovalSteps(approvalRequestId),
    enabled: !!approvalRequestId,
    staleTime: 30_000,
    // retry, gcTime e refetchOnWindowFocus: defaults do React Query v5
  });
}
