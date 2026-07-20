import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTerminations() {
  return useQuery({
    queryKey: ['termination_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('termination_requests' as any)
        .select('*, collaborator:collaborators(id, full_name, role_name, worksite, sector_id, sector:sectors(id, name)), requester:profiles!termination_requests_requester_user_id_fkey(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useTermination(id: string) {
  return useQuery({
    queryKey: ['termination_request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('termination_requests' as any)
        .select('*, collaborator:collaborators(id, full_name, role_name, worksite, sector_id, sector:sectors(id, name)), requester:profiles!termination_requests_requester_user_id_fkey(full_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateTermination() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data, error } = await supabase
        .from('termination_requests' as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      refreshApprovalData(qc, result?.id);
      toast({ title: 'Desligamento criado com sucesso' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao criar desligamento', description: e.message, variant: 'destructive' }),
  });
}

export function useTerminationSetStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      requestId,
      toStatus,
      reason,
      startApproval,
    }: {
      requestId: string;
      toStatus: string;
      reason?: string;
      startApproval?: { requesterUserId: string };
    }) => {
      const { data, error } = await supabase.rpc('termination_set_status' as any, {
        _request_id: requestId,
        _to_status: toStatus,
        _reason: reason ?? null,
      } as any);
      if (error) throw error;

      if (startApproval) {
        const flowResult = await supabase.rpc('start_approval_flow' as any, {
          p_module_code: 'desligamentos',
          p_reference_id: requestId,
          p_requester_user_id: startApproval.requesterUserId,
        });
        if (flowResult.error) throw flowResult.error;
        const resultData = flowResult.data as any;
        if (resultData?.error) throw new Error(resultData.error);
      }

      return data;
    },
    onSuccess: (_d, vars) => {
      refreshApprovalData(qc, vars.requestId);
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao atualizar status', description: e.message, variant: 'destructive' }),
  });
}
