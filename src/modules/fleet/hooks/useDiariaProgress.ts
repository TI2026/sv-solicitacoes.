/**
 * useDiariaProgress.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade única: encapsular o React Query para diaria_progress.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA acessar Supabase diretamente.
 *  - NUNCA escrever SQL ou montar queries.
 *  - Delega toda consulta para loadDiariaStatusDates() (Loader).
 *
 * Configuração de cache:
 *  - staleTime: 30 000 ms — dado considerado obsoleto após 30s.
 *
 * Query Key: ['diaria_progress', requestId]
 *  - Owner: tabela status_history
 *  - Invalidado por: refreshApprovalData() via invalidação de fleet_timeline
 *    (o fleet_timeline e diaria_progress leem da mesma tabela status_history).
 *  - Realtime: DiariaProgressBar invalida ao receber INSERT em status_history
 *    pertencente ao requestId atualmente aberto.
 *
 * Padrão arquitetural:
 *   Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadDiariaStatusDates } from '../queries/diariaProgressLoader';

export function useDiariaProgress(requestId: string) {
  return useQuery<Record<string, string>>({
    queryKey: ['diaria_progress', requestId],
    queryFn: () => loadDiariaStatusDates(requestId),
    enabled: !!requestId,
    staleTime: 30_000,
    // retry, gcTime e refetchOnWindowFocus: defaults do React Query v5
  });
}
