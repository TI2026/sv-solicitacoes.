import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
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
        await supabase.rpc('start_approval_flow' as any, {
          _reference_type: 'admission',
          _reference_id: requestId,
          _requester_user_id: startApproval.requesterUserId,
        } as any);
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
      qc.invalidateQueries({ queryKey: ['admission_request', vars.requestId] });
      qc.invalidateQueries({ queryKey: ['admission_list_items'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar status', description: e.message, variant: 'destructive' }),
  });
}
