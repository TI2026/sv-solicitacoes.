import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useFuelRequests(userId?: string, isAdmin?: boolean) {
  return useQuery({
    queryKey: ['fuel_requests', userId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false });
      
      // RLS already filters, but for clarity
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
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
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email)')
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
    mutationFn: async (data: { valor: number; data_abastecimento: string; notes?: string; requester_user_id: string }) => {
      const { data: result, error } = await supabase
        .from('fuel_requests')
        .insert({
          requester_user_id: data.requester_user_id,
          valor: data.valor,
          data_abastecimento: data.data_abastecimento,
          notes: data.notes || null,
          status: 'rascunho' as any,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
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
    mutationFn: async (params: { requestId: string; toStatus: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('fuel_set_status', {
        _request_id: params.requestId,
        _to_status: params.toStatus as any,
        _reason: params.reason || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_request'] });
      qc.invalidateQueries({ queryKey: ['fuel_reviews'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}
