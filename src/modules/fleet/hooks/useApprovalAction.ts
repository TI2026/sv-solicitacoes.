import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

/**
 * Calls process_approval_action RPC which now atomically syncs fuel_requests.status.
 * No manual frontend sync needed — the RPC handles everything in a single transaction.
 */
export function useApprovalAction() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      approvalRequestId: string;
      action: 'approve' | 'reject' | 'return';
      comments?: string;
      /** Kept for API compatibility but no longer used for manual sync */
      fuelRequestId?: string;
      fuelRequestType?: string;
    }) => {
      const { data, error } = await supabase.rpc('process_approval_action', {
        p_approval_request_id: params.approvalRequestId,
        p_action: params.action,
        p_comments: params.comments || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, params) => {
      refreshApprovalData(qc, params.fuelRequestId);
      toast({ title: 'Ação de aprovação processada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
