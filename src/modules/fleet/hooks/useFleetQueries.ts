import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type FuelStatus = Database['public']['Enums']['fuel_status'];
const FINAL_STATUSES: FuelStatus[] = ['concluido', 'encerrado'];
const REJECTED_STATUSES: FuelStatus[] = ['reprovado'];

export function useFuelRequests(userId?: string, isAdmin?: boolean, type?: string) {
  return useQuery({
    queryKey: ['fuel_requests', userId, isAdmin, type],
    queryFn: async () => {
      const res: any = await supabase
        .from('fuel_requests')
        .select('*, profiles(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      let items = res.data || [];
      if (type) items = items.filter((r: any) => r.type === type);
      return items;
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
        .select('*, profiles(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
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
        .select('*, profiles(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
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
        .select('*, profiles(full_name, email)')
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
        .select('*, profiles(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)')
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
        .select('*, profiles(full_name)')
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
      const { data, error } = await supabase.rpc('fuel_set_status', {
        _request_id: params.requestId,
        _to_status: params.toStatus as any,
        _reason: params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);

      // If transitioning to em_aprovacao, try to start approval flow
      if (params.toStatus === 'em_aprovacao' && params.startApproval) {
        try {
          const { data: flowResult } = await supabase.rpc('start_approval_flow', {
            p_module_code: params.startApproval.moduleCode,
            p_reference_id: params.requestId,
            p_requester_user_id: params.startApproval.requesterUserId,
          });
          if (flowResult && !(flowResult as any).error) {
            console.log('Approval flow started:', flowResult);
          }
        } catch (e) {
          console.warn('Approval flow not started (no active flow?):', e);
        }
      }

      return result;
    },
    onSuccess: () => {
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
