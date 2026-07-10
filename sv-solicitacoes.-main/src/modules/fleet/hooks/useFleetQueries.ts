import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

type FuelStatus = Database['public']['Enums']['fuel_status'];
const FINAL_STATUSES: FuelStatus[] = ['aprovado', 'concluido', 'encerrado'];
const REJECTED_STATUSES: FuelStatus[] = ['reprovado'];

export function useFuelRequests(userId?: string, isAdmin?: boolean, type?: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['fuel_requests', userId, isAdmin, type, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (type) query = query.eq('type', type);
      if (!isAdmin && userId) query = query.eq('requester_user_id', userId);

      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      query = query.range(start, end);

      const res: any = await query;
      if (res.error) throw res.error;
      return { data: res.data || [], count: res.count || 0 };
    },
    enabled: !!userId,
  });
}

/** Only pending (not completed, not rejected) */
export function useFuelRequestsPending(userId?: string, isAdmin?: boolean, type?: string) {
  return useQuery({
    queryKey: ['fuel_requests_pending', userId, isAdmin, type],
    queryFn: async () => {
      const res: any = await supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      let items = res.data || [];
      if (type) items = items.filter((r: any) => r.type === type);
      // Filter out completed and rejected
      items = items.filter((r: any) => ![...FINAL_STATUSES, ...REJECTED_STATUSES].includes(r.status));
      return items;
    },
    enabled: !!userId,
  });
}

/** Only rejected/reprovado */
export function useFuelRequestsRejected(userId?: string, isAdmin?: boolean, type?: string) {
  return useQuery({
    queryKey: ['fuel_requests_rejected', userId, isAdmin, type],
    queryFn: async () => {
      const res: any = await supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
        .is('deleted_at', null)
        .in('status', REJECTED_STATUSES)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      let items = res.data || [];
      if (type) items = items.filter((r: any) => r.type === type);
      return items;
    },
    enabled: !!userId,
  });
}

/** Only completed */
export function useFuelRequestsCompleted(userId?: string, isAdmin?: boolean, type?: string) {
  return useQuery({
    queryKey: ['fuel_requests_completed', userId, isAdmin, type],
    queryFn: async () => {
      const res: any = await supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email)')
        .is('deleted_at', null)
        .in('status', FINAL_STATUSES)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      let items = res.data || [];
      if (type) items = items.filter((r: any) => r.type === type);
      return items;
    },
    enabled: !!userId,
  });
}

export function useFuelRequest(id: string) {
  return useQuery({
    queryKey: ['fuel_request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useFuelAttachments(requestId: string) {
  return useQuery({
    queryKey: ['fuel_attachments', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_attachments')
        .select('*')
        .eq('fuel_request_id', requestId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!requestId,
  });
}

export function useFuelReviews(requestId: string) {
  return useQuery({
    queryKey: ['fuel_reviews', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_reviews')
        .select('*, profiles!fuel_reviews_reviewer_user_id_fkey(full_name)')
        .eq('fuel_request_id', requestId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!requestId,
  });
}

export function useCreateFuelRequest() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { data: result, error } = await supabase
        .from('fuel_requests')
        .insert(data as any)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
      toast({ title: 'Solicitação criada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useFuelSetStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { requestId: string; toStatus: string; reason?: string; startApproval?: { moduleCode: string; requesterUserId: string } }) => {
      // Envio para aprovação: RPC atômica — valida, cria fluxo e atualiza status em uma transaçãoúnica.
      // Elimina a race condition da abordagem anterior (duas chamadas separadas).
      if (params.toStatus === 'em_aprovacao' && params.startApproval) {
        const { data, error } = await supabase.rpc('submit_fuel_request', {
          p_request_id:  params.requestId,
          p_module_code: params.startApproval.moduleCode,
        } as any);
        if (error) throw error;
        const result = data as any;
        if (result?.code) throw new Error(`${result.code}: ${result.message}`);
        return result;
      }

      // Demais transições continuam via fuel_set_status (validações e locks já existentes)
      const { data, error } = await supabase.rpc('fuel_set_status', {
        _request_id: params.requestId,
        _to_status:  params.toStatus as any,
        _reason:     params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, params) => {
      refreshApprovalData(qc, params.requestId);
      // Invalidar listas que mostram status: afetadas por qualquer transição
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['status_history'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useSoftDeleteRequest() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { requestId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('soft_delete_request', {
        _request_id: params.requestId,
        _reason: params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_rejected'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_completed'] });
      qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
      qc.invalidateQueries({ queryKey: ['fuel_all'] });
      toast({ title: 'Solicitação excluída com sucesso' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });
}
