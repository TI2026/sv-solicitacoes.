import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/** Start an approval flow for a module reference */
export function useStartApprovalFlow() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { moduleCode: string; referenceId: string; requesterUserId: string }) => {
      const { data, error } = await supabase.rpc('start_approval_flow', {
        p_module_code: params.moduleCode,
        p_reference_id: params.referenceId,
        p_requester_user_id: params.requesterUserId,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) {
        // Not a fatal error - just means no flow configured
        console.warn('Approval flow:', result.error);
        return result;
      }
      return result;
    },
    onSuccess: (result) => {
      if (result?.success) {
        qc.invalidateQueries({ queryKey: ['my_approvals'] });
        qc.invalidateQueries({ queryKey: ['all_approval_requests'] });
        qc.invalidateQueries({ queryKey: ['approval_request_for'] });
      }
    },
    onError: (err: any) => {
      // Silently handle - approval flow is optional enhancement
      console.warn('Approval flow error:', err.message);
    },
  });
}

/** Fetch ALL approval_requests for a specific reference_id (all cycles) */
export function useApprovalRequestsForReference(referenceId?: string) {
  return useQuery({
    queryKey: ['approval_requests_for', referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          approval_modules(code, name),
          approval_flows(name, approval_type, allow_return_for_adjustment, return_mode),
          profiles!approval_requests_requester_user_id_fkey(full_name),
          approval_request_steps(
            *,
            profiles(full_name)
          )
        `)
        .eq('reference_id', referenceId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!referenceId,
  });
}

/** Fetch the latest (current) approval_request for a reference_id — backward compat */
export function useApprovalRequestForReference(referenceId?: string) {
  const { data, ...rest } = useApprovalRequestsForReference(referenceId);
  return { data: data?.[0] || null, ...rest };
}
