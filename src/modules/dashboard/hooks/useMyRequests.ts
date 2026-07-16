/**
 * useMyRequests.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: encapsular o React Query para as solicitações
 * do usuário logado, agrupadas por categoria de status.
 *
 * Query Key: ['my_requests', userId]
 *   - Invalidada por refreshApprovalData() e pelo Realtime do Dashboard.
 *
 * Padrão: Component → Hook (este arquivo) → Loader → Supabase
 */

import { useQuery } from '@tanstack/react-query';
import { loadMyRequests } from '../queries/myRequestsLoader';
import type { MyRequest, RequestGroup } from '../queries/myRequestsLoader';

export type { MyRequest, RequestGroup };

interface GroupedRequests {
  em_aprovacao: MyRequest[];
  devolvida: MyRequest[];
  concluida: MyRequest[];
  cancelada: MyRequest[];
  outra: MyRequest[];
}

interface UseMyRequestsResult {
  grouped: GroupedRequests;
  total: number;
  isLoading: boolean;
}

const EMPTY_GROUPED: GroupedRequests = {
  em_aprovacao: [],
  devolvida: [],
  concluida: [],
  cancelada: [],
  outra: [],
};

export function useMyRequests(userId: string | undefined): UseMyRequestsResult {
  const { data, isLoading } = useQuery({
    queryKey: ['my_requests', userId],
    queryFn: () => loadMyRequests(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const items = data ?? [];

  const grouped: GroupedRequests = items.reduce(
    (acc, item) => {
      acc[item.group].push(item);
      return acc;
    },
    { ...EMPTY_GROUPED, em_aprovacao: [], devolvida: [], concluida: [], cancelada: [], outra: [] }
  );

  return {
    grouped,
    total: items.length,
    isLoading,
  };
}
