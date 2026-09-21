import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { executeEntityAction } from '@/hooks/useEntityAction';
import type { FleetBusinessModule } from '../requestRoutes';

type FuelStatus = Database['public']['Enums']['fuel_status'];
const FINAL_STATUSES: FuelStatus[] = ['aprovado', 'concluido', 'encerrado'];
const REJECTED_STATUSES: FuelStatus[] = ['reprovado'];

const SELECT_WITH_PEOPLE =
  '*, profiles!fuel_requests_requester_user_id_fkey(full_name, email), assignee:profiles!fuel_requests_assigned_to_user_id_fkey(full_name)';

/**
 * [Checkpoint A] Isolamento autoritativo por módulo.
 * Toda consulta de Abastecimento/Diária/Reembolso filtra `type` no servidor e
 * carrega o módulo na query key. O navegador nunca decide o escopo do módulo.
 */
export function useFuelRequests(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  module: FleetBusinessModule,
  page = 1,
  pageSize = 20,
) {
  return useQuery({
    queryKey: ['fuel_requests', module, userId, isAdmin, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('fuel_requests')
        .select(SELECT_WITH_PEOPLE, { count: 'exact' })
        .eq('type', module)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

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
export function useFuelRequestsPending(userId: string | undefined, isAdmin: boolean | undefined, module: FleetBusinessModule) {
  return useQuery({
    queryKey: ['fuel_requests_pending', module, userId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('fuel_requests')
        .select(SELECT_WITH_PEOPLE)
        .eq('type', module)
        .is('deleted_at', null)
        .not('status', 'in', `(${[...FINAL_STATUSES, ...REJECTED_STATUSES].join(',')})`)
        .order('created_at', { ascending: false });
      if (!isAdmin && userId) query = query.eq('requester_user_id', userId);
      const res: any = await query;
      if (res.error) throw res.error;
      return res.data || [];
    },
    enabled: !!userId,
  });
}

/** Only rejected/reprovado */
export function useFuelRequestsRejected(userId: string | undefined, isAdmin: boolean | undefined, module: FleetBusinessModule) {
  return useQuery({
    queryKey: ['fuel_requests_rejected', module, userId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('fuel_requests')
        .select(SELECT_WITH_PEOPLE)
        .eq('type', module)
        .is('deleted_at', null)
        .in('status', REJECTED_STATUSES)
        .order('created_at', { ascending: false });
      if (!isAdmin && userId) query = query.eq('requester_user_id', userId);
      const res: any = await query;
      if (res.error) throw res.error;
      return res.data || [];
    },
    enabled: !!userId,
  });
}

/** Only completed */
export function useFuelRequestsCompleted(userId: string | undefined, isAdmin: boolean | undefined, module: FleetBusinessModule) {
  return useQuery({
    queryKey: ['fuel_requests_completed', module, userId, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('fuel_requests')
        .select('*, profiles!fuel_requests_requester_user_id_fkey(full_name, email)')
        .eq('type', module)
        .is('deleted_at', null)
        .in('status', FINAL_STATUSES)
        .order('created_at', { ascending: false });
      if (!isAdmin && userId) query = query.eq('requester_user_id', userId);
      const res: any = await query;
      if (res.error) throw res.error;
      return res.data || [];
    },
    enabled: !!userId,
  });
}

/**
 * Detalhe/edição: o módulo é obrigatório e aplicado no servidor.
 * Um id de outro módulo devolve `null` — nunca o registro de outro processo.
 */
export function useFuelRequest(id: string, module: FleetBusinessModule) {
  return useQuery({
    queryKey: ['fuel_request', id, module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select(SELECT_WITH_PEOPLE)
        .eq('id', id)
        .eq('type', module)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Resolve apenas o módulo real de um id — usado para redirecionar o usuário
 * para a tela correta sem jamais carregar o conteúdo na tela errada.
 */
export function useFuelRequestModule(id: string | undefined) {
  return useQuery({
    queryKey: ['fuel_request_module', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, type')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data?.type as string | undefined) ?? null;
    },
    enabled: !!id,
  });
}

export function useFuelAttachments(requestId: string, options?: { enabled?: boolean }) {
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
    enabled: !!requestId && options?.enabled !== false,
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

export function useCancelFleetRequest() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (params: { requestId: string; moduleKey: string; reason?: string }) =>
      executeEntityAction({
        moduleKey: params.moduleKey,
        entityId: params.requestId,
        action: 'cancelar',
        payload: params.reason ? { notes: params.reason } : {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_rejected'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests_completed'] });
      qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
      qc.invalidateQueries({ queryKey: ['fuel_all'] });
      toast({ title: 'Solicitação cancelada com sucesso' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao cancelar', description: err.message, variant: 'destructive' });
    },
  });
}
