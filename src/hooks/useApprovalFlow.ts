import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { useEntityAction } from '@/hooks/useEntityAction';

/**
 * [Sprint Final 1] Convergência V2.
 *
 * `start_approval_flow` NÃO é mais chamado pelo frontend.
 * O envio de uma solicitação é a ação canônica `enviar` do executor único.
 */
export function useStartApprovalFlow() {
  const exec = useEntityAction();
  return {
    ...exec,
    mutateAsync: (params: { moduleCode: string; referenceId: string }) =>
      exec.mutateAsync({
        moduleKey: params.moduleCode,
        entityId: params.referenceId,
        action: 'enviar',
        successMessage: 'Solicitação enviada para aprovação',
      }),
  };
}

/** Fetch all approval cycles for one canonical module + entity pair. */
export function useApprovalRequestsForReference(moduleCode: string, referenceId?: string) {
  return useQuery({
    queryKey: ['approval_request_for', moduleCode, referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          approval_modules!inner(code, name),
          approval_flows(name, approval_type, allow_return_for_adjustment, return_mode),
          profiles!approval_requests_requester_user_id_fkey(full_name),
          approval_request_steps(
            *,
            profiles(full_name)
          )
        `)
        .eq('reference_id', referenceId!)
        .eq('approval_modules.code', moduleCode)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!moduleCode && !!referenceId,
  });
}

/** Fetch the latest approval cycle for one canonical module + entity pair. */
export function useApprovalRequestForReference(moduleCode: string, referenceId?: string) {
  const { data, ...rest } = useApprovalRequestsForReference(moduleCode, referenceId);
  return { data: data?.[0] || null, ...rest };
}
