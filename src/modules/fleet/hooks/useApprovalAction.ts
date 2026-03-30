import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Calls process_approval_action RPC, then syncs Fleet status based on result.
 * This replaces fuel_set_status for approve/reject/return when an active flow exists.
 */
export function useApprovalAction() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      approvalRequestId: string;
      action: 'approve' | 'reject' | 'return';
      comments?: string;
      /** The fuel_request ID to sync status after approval action */
      fuelRequestId: string;
      fuelRequestType: string;
    }) => {
      // 1. Execute the approval action
      const { data, error } = await supabase.rpc('process_approval_action', {
        p_approval_request_id: params.approvalRequestId,
        p_action: params.action,
        p_comments: params.comments || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);

      const newApprovalStatus = result?.status as string;

      // 2. Sync Fleet status based on approval outcome
      if (newApprovalStatus === 'approved') {
        // Flow fully approved -> advance to next business step
        const nextStatus = getNextStatusAfterApproval(params.fuelRequestType);
        if (nextStatus) {
          const { data: syncResult, error: syncError } = await supabase.rpc('fuel_set_status', {
            _request_id: params.fuelRequestId,
            _to_status: nextStatus as any,
          });
          if (syncError) console.warn('Sync status after approval:', syncError.message);
          else if ((syncResult as any)?.error) console.warn('Sync status:', (syncResult as any).error);
        }
      } else if (newApprovalStatus === 'rejected') {
        // Flow rejected -> mark as reprovado
        const { error: syncError } = await supabase.rpc('fuel_set_status', {
          _request_id: params.fuelRequestId,
          _to_status: 'reprovado' as any,
        });
        if (syncError) console.warn('Sync reject status:', syncError.message);
      } else if (newApprovalStatus === 'returned_to_requester' || newApprovalStatus?.startsWith('returned')) {
        // Returned -> mark as retornado
        const { error: syncError } = await supabase.rpc('fuel_set_status', {
          _request_id: params.fuelRequestId,
          _to_status: 'retornado' as any,
        });
        if (syncError) console.warn('Sync return status:', syncError.message);
      }
      // If still awaiting_step_N, do nothing to fuel_requests status — stays em_aprovacao

      return result;
    },
    onSuccess: () => {
      // Invalidate all relevant queries
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_rejected'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_completed'] });
      qc.invalidateQueries({ queryKey: ['fuel_request'] });
      qc.invalidateQueries({ queryKey: ['fuel_reviews'] });
      qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
      qc.invalidateQueries({ queryKey: ['status_history'] });
      qc.invalidateQueries({ queryKey: ['approval_request_for'] });
      qc.invalidateQueries({ queryKey: ['my_approvals'] });
      qc.invalidateQueries({ queryKey: ['all_approval_requests'] });
      toast({ title: 'Ação de aprovação processada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

function getNextStatusAfterApproval(type: string): string | null {
  switch (type) {
    case 'abastecimento':
      return 'aprovado'; // then admin confirms card reload -> aguardando_fotos
    case 'reembolso':
      return 'aprovado'; // then admin marks paid -> concluido
    case 'diaria':
      return 'aprovado'; // then -> aguardando_oc -> aguardando_pagamento -> pago -> concluido
    default:
      return 'aprovado';
  }
}
