import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

export function useAdmissionRequests() {
  return useQuery({
    queryKey: ['admission_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAdmissionRequest(id: string) {
  return useQuery({
    queryKey: ['admission_request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admission_requests')
        .select('*, profiles(full_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export * from './useCandidates';
export * from './useDocuments';
export * from './useInterviews';

export function useCreateAdmission() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data, error } = await supabase
        .from('admission_requests')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      refreshApprovalData(qc, result?.id);
      toast({ title: 'Vaga criada com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar vaga', description: e.message, variant: 'destructive' }),
  });
}

export function useAdmissionSetStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ requestId, toStatus, reason, startApproval }: {
      requestId: string;
      toStatus: string;
      reason?: string;
      startApproval?: { requesterUserId: string };
    }) => {
      const { data, error } = await supabase.rpc('admission_set_status' as any, {
        _request_id: requestId,
        _to_status: toStatus,
        _reason: reason ?? null,
      } as any);
      if (error) throw error;
      if (startApproval) {
        // Tipagem 'as any' mantida na função pois o supabase/types pode não estar 100% atualizado localmente para essa RPC
        const flowResult = await supabase.rpc('start_approval_flow' as any, {
          p_module_code: 'admissions',
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
    onError: (e: any) => toast({ title: 'Erro ao atualizar status', description: e.message, variant: 'destructive' }),
  });
}
