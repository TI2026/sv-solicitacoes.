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

/**
 * [Sprint Final 1] Convergência V2.
 *
 * Removido o padrão legado `admission_set_status` → `start_approval_flow`.
 * Toda mutação de workflow de Admissões passa pelo executor único.
 *
 * Etapas: 1 aprovacao_vaga → 2 processamento_rh → 3 validacao_final_rh.
 * Ações: enviar | aprovar | devolver | rejeitar | concluir_triagem | concluir.
 * Edição NÃO é workflow action — usar context.can_edit.
 */
export function useAdmissionSetStatus() {
  const exec = useEntityAction();
  return {
    ...exec,
    mutateAsync: (vars: { requestId: string; action: string; payload?: Record<string, unknown>; reason?: string }) =>
      exec.mutateAsync({
        moduleKey: 'admissoes',
        entityId: vars.requestId,
        action: vars.action,
        payload: { ...(vars.payload ?? {}), ...(vars.reason ? { comments: vars.reason } : {}) },
      }),
  };
}
