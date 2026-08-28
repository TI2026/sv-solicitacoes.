import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { PurchaseRequest } from '../queries/purchaseLoader';
import { executeEntityAction } from '@/hooks/useEntityAction';

export function usePurchaseMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseRequest>) => {
      if (!user) throw new Error('Usuário não autenticado');
      
      const { data: result, error } = await (supabase as any)
        .from('purchases')
        .insert([{ ...data, requester_user_id: user.id }])
        .select()
        .single();
        
      if (error) throw error;
      return result as PurchaseRequest;
    },
    onSuccess: () => {
      refreshApprovalData(queryClient, undefined, 'compras');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PurchaseRequest> }) => {
      const { data: result, error } = await (supabase as any)
        .from('purchases')
        .update(data)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return result as PurchaseRequest;
    },
    onSuccess: (data) => {
      refreshApprovalData(queryClient, data.id, 'compras');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => executeEntityAction({ moduleKey: 'compras', entityId: id, action: 'enviar' }),
    onSuccess: (_, id) => {
      refreshApprovalData(queryClient, id, 'compras');
    },
  });

  return {
    createPurchase: createMutation.mutateAsync,
    updatePurchase: updateMutation.mutateAsync,
    submitPurchase: submitMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isSubmitting: submitMutation.isPending,
  };
}
