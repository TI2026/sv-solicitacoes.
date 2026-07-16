/**
 * useDashboardQueue.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: encapsular o React Query para a fila de aprovação
 * do usuário logado no Dashboard.
 *
 * Query Key: ['my_approvals', userId]
 *   - Mesma key já invalidada por refreshApprovalData() — garantindo
 *     que a fila esvazia imediatamente após uma ação de aprovação.
 *
 * Padrão: Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadDashboardQueue } from '../queries/dashboardQueueLoader';
import type { QueueItem, QueueSummary } from '../queries/dashboardQueueLoader';

interface UseDashboardQueueResult {
  items: QueueItem[];
  summary: QueueSummary;
  isLoading: boolean;
}

export function useDashboardQueue(userId: string | undefined): UseDashboardQueueResult {
  const { data, isLoading } = useQuery({
    queryKey: ['my_approvals', userId],
    queryFn: () => loadDashboardQueue(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  return {
    items: data?.items ?? [],
    summary: data?.summary ?? { total: 0, urgent: 0, returned: 0 },
    isLoading,
  };
}
