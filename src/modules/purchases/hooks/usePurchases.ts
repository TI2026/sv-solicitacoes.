import { useQuery } from '@tanstack/react-query';
import { loadPurchases, PurchaseFilters } from '../queries/purchaseLoader';

export function usePurchases(filters?: PurchaseFilters) {
  return useQuery({
    queryKey: ['purchases', filters],
    queryFn: () => loadPurchases(filters),
  });
}
