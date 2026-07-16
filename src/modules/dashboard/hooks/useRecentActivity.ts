/**
 * useRecentActivity.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: encapsular o React Query para as últimas
 * movimentações do sistema (status_history, LIMIT 30).
 *
 * Query Key: ['recent_activity']
 *   - Invalidada por refreshApprovalData() e pelo Realtime do Dashboard
 *     ao detectar INSERT em status_history.
 *
 * Padrão: Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadRecentActivity } from '../queries/recentActivityLoader';
import type { ActivityItem } from '../queries/recentActivityLoader';

export type { ActivityItem };

export function useRecentActivity() {
  return useQuery({
    queryKey: ['recent_activity'],
    queryFn: loadRecentActivity,
    staleTime: 60_000,
  });
}
