import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { PurchaseRequest } from '../queries/purchaseLoader';

export function usePurchaseMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseRequest>) => {
      if (!user) throw new Error('Usuário não autenticado');
      
      const { data: result, error } = await supabase
        .from('purchases')
        .insert([{ ...data, requester_user_id: user.id }])
        .select()
        .single();
        
      if (error) throw error;
      return result as PurchaseRequest;
    },
    onSuccess: () => {
      refreshApprovalData(queryClient);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PurchaseRequest> }) => {
      const { data: result, error } = await supabase
        .from('purchases')
        .update(data)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return result as PurchaseRequest;
    },
    onSuccess: (data) => {
      refreshApprovalData(queryClient, data.id);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('submit_purchase_request', {
        p_request_id: id
      });
      
      if (error) throw error;
      if (data && data.code) {
        throw new Error(data.message || 'Erro ao enviar para aprovação');
      }
      return data;
    },
    onSuccess: (_, id) => {
      refreshApprovalData(queryClient, id);
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
