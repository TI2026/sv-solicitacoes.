/**
 * useCriticalPendings.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: encapsular o React Query para as pendências
 * críticas operacionais — anomalias que requerem atenção imediata.
 *
 * Query Key: ['critical_pendings']
 *   - Invalidada por refreshApprovalData() e pelo Realtime do Dashboard
 *     ao detectar mudanças em approval_requests.
 *
 * Padrão: Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadCriticalPendings } from '../queries/criticalPendingsLoader';
import type { CriticalPending, CriticalPendingKind } from '../queries/criticalPendingsLoader';

export type { CriticalPending, CriticalPendingKind };

export function useCriticalPendings() {
  return useQuery({
    queryKey: ['critical_pendings'],
    queryFn: loadCriticalPendings,
    staleTime: 30_000,
  });
}
