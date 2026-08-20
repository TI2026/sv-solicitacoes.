import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { useModuleWorkflowAction } from '@/hooks/useEntityAction';

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

/**
 * [Sprint Final 1] Convergência V2.
 *
 * Removido `termination_set_status` → `start_approval_flow` como API de workflow.
 * `termination_set_status` permanece APENAS como side effect interno do backend
 * na conclusão do offboarding (step 3) — o frontend não o invoca mais.
 *
 * Etapas: 1 autorizacao_desligamento → 2 processamento_rh → 3 checklist_offboarding.
 * Ação legada `processar` substituída por `concluir_processamento_rh`.
 * Offboarding irreversível ocorre SOMENTE no step 3, no backend.
 */
export function useTerminationSetStatus() {
  return useModuleWorkflowAction('desligamentos');
}
