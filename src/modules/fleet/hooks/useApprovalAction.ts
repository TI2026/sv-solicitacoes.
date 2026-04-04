import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    onSuccess: () => {
      // Invalidate all relevant queries so lists/dashboard refresh
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_rejected'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_completed'] });
      qc.invalidateQueries({ queryKey: ['fuel_request'] });
      qc.invalidateQueries({ queryKey: ['fuel_reviews'] });
      qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
      qc.invalidateQueries({ queryKey: ['status_history'] });
      qc.invalidateQueries({ queryKey: ['approval_request_for'] });
      qc.invalidateQueries({ queryKey: ['approval_requests_for'] });
      qc.invalidateQueries({ queryKey: ['my_approvals'] });
      qc.invalidateQueries({ queryKey: ['all_approval_requests'] });
      toast({ title: 'Ação de aprovação processada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
