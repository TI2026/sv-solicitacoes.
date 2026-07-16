/**
 * useFleetTimeline.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade única: encapsular o React Query para fleet_timeline.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA escrever SQL ou montar queries.
 *  - Delega toda consulta para loadFleetTimeline() (Loader).
 *
 * Configuração de cache:
 *  - staleTime: 30 000 ms — dado considerado obsoleto após 30s.
 *  - Não faz refetch automático; apenas sinaliza que um trigger pode recarregar.
 *
 * Query Key: ['fleet_timeline', requestId]
 *  - Owner: tabelas status_history + approval_request_steps
 *  - Invalidado por: refreshApprovalData(qc, referenceId)
 *  - Realtime: FleetTimeline invalida ao receber INSERT em status_history
 *    pertencente ao requestId atualmente aberto.
 *
 * ATENÇÃO: approvalRequestId NÃO faz parte da query key.
 * Ele é passado como parâmetro ao loader, mas a identidade da query
 * é ancorada apenas em requestId. Isso garante que a invalidação via
 * refreshApprovalData(qc, fuelRequestId) acerte sempre a query correta,
 * independente de qual ciclo de aprovação está ativo.
 *
 * Padrão arquitetural:
 *   Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadFleetTimeline, type TimelineEvent, type FleetTimelineParams } from '../queries/fleetTimelineLoader';

export function useFleetTimeline(params: FleetTimelineParams) {
  return useQuery<TimelineEvent[]>({
    queryKey: ['fleet_timeline', params.requestId],
    queryFn: () => loadFleetTimeline(params),
    enabled: !!params.requestId,
    staleTime: 30_000,
    // retry, gcTime e refetchOnWindowFocus: defaults do React Query v5
  });
}
