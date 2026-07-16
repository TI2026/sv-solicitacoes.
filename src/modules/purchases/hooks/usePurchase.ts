import { useQuery } from '@tanstack/react-query';
import { loadPurchase } from '../queries/purchaseLoader';

export function usePurchase(id?: string) {
  return useQuery({
    queryKey: ['purchase', id],
    queryFn: () => loadPurchase(id!),
    enabled: !!id,
  });
}
