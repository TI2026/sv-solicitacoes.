import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/types';

export * from './usePermissionsSession';
export * from './usePermissionsAdmin';

export function useApprovalModules() {
  return useQuery({
    queryKey: ['approval_modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_modules')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useApprovalFlows() {
  return useQuery({
    queryKey: ['approval_flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_flows')
        .select('*, approval_modules(code, name), approval_flow_steps(*, profiles!approval_flow_steps_approver_user_id_fkey(full_name, email), sectors:sector_id(id, name))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSectors() {
  return useQuery({
    queryKey: ['active_sectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sectors')
        .select('id, name, code, responsible_user_id, profiles:responsible_user_id(full_name)')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export interface StepDraft {
  stepOrder: number;
  approverType: 'specific_user' | 'sector';
  fixedUserId: string | null;
  sectorId: string | null;
  timeoutHours: number | null;
}

export function useSaveApprovalFlow() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id?: string;
      moduleId: string;
      name: string;
      approvalType: string;
      requireRejectionReason: boolean;
      allowReturn: boolean;
      returnMode: string;
      notifyNext: boolean;
      createdBy: string;
      steps: StepDraft[];
    }): Promise<{ flowId: string; versioned: boolean }> => {
      let flowId = params.id;
      let versioned = false;

      if (flowId) {
        // Check if this flow has ever been used by approval_requests
        const { count, error: countErr } = await supabase
          .from('approval_requests')
          .select('id', { count: 'exact', head: true })
          .eq('flow_id', flowId);
        if (countErr) throw countErr;

        const flowInUse = (count || 0) > 0;

        if (flowInUse) {
          // VERSIONING: deactivate old flow, create new one
          await supabase
            .from('approval_flows')
            .update({ active: false })
            .eq('id', flowId);

          const { data: newFlow, error: createErr } = await supabase
            .from('approval_flows')
            .insert({
              module_id: params.moduleId,
              name: params.name,
              approval_type: params.approvalType,
              require_rejection_reason: params.requireRejectionReason,
              allow_return_for_adjustment: params.allowReturn,
              return_mode: params.returnMode,
              notify_next_approver: params.notifyNext,
              created_by: params.createdBy,
              active: true,
            })
            .select()
            .single();
          if (createErr) throw createErr;
          flowId = newFlow.id;
          versioned = true;
        } else {
          // Safe to edit in-place: no references exist
          const { error } = await supabase
            .from('approval_flows')
            .update({
              name: params.name,
              approval_type: params.approvalType,
              require_rejection_reason: params.requireRejectionReason,
              allow_return_for_adjustment: params.allowReturn,
              return_mode: params.returnMode,
              notify_next_approver: params.notifyNext,
            })
            .eq('id', flowId);
          if (error) throw error;
        }
      } else {
        // New flow: deactivate other active flows for the same module
        await supabase
          .from('approval_flows')
          .update({ active: false })
          .eq('module_id', params.moduleId)
          .eq('active', true);

        const { data, error } = await supabase
          .from('approval_flows')
          .insert({
            module_id: params.moduleId,
            name: params.name,
            approval_type: params.approvalType,
            require_rejection_reason: params.requireRejectionReason,
            allow_return_for_adjustment: params.allowReturn,
            return_mode: params.returnMode,
            notify_next_approver: params.notifyNext,
            created_by: params.createdBy,
          })
          .select()
          .single();
        if (error) throw error;
        flowId = data.id;
      }

      // Atomic replace via RPC — avoids 409 on (flow_id, step_order) uniqueness
      // and guarantees DELETE + INSERT happen in the same transaction.
      const stepsPayload = params.steps.map((s) => {
        return {
          approver_type: s.approverType,
          approver_user_id: s.approverType === 'specific_user' ? s.fixedUserId : null,
          sector_id: s.approverType === 'sector' ? s.sectorId : null,
          timeout_hours: s.timeoutHours || null,
        };
      });

      const { data: replaceResult, error: replaceErr } = await supabase.rpc(
        'replace_approval_flow_steps',
        { p_flow_id: flowId!, p_steps: stepsPayload as any }
      );
      if (replaceErr) throw replaceErr;
      if ((replaceResult as any)?.error) throw new Error((replaceResult as any).error);

      return { flowId: flowId!, versioned };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['approval_flows'] });
      if (result.versioned) {
        toast({ title: 'Nova versão do fluxo criada', description: 'O fluxo anterior foi preservado para histórico. Novas solicitações usarão esta versão.' });
      } else {
        toast({ title: 'Fluxo salvo com sucesso' });
      }
    },
    onError: (err: any) => {
      console.error('Approval flow save error:', err);
      const msg = err.message?.includes('foreign key')
        ? 'Este fluxo já foi usado em aprovações. Tente salvar novamente — o sistema criará uma nova versão automaticamente.'
        : err.message?.includes('unique constraint')
        ? 'Erro de etapas duplicadas. Tente salvar novamente.'
        : err.message || 'Erro ao salvar fluxo';
      toast({ title: 'Erro ao salvar fluxo', description: msg, variant: 'destructive' });
    },
  });
}

export function useMyApprovals(userId?: string) {
  return useQuery({
    queryKey: ['my_approvals', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          approval_modules(code, name),
          approval_flows(name, allow_return_for_adjustment, return_mode, approval_type),
          profiles!approval_requests_requester_user_id_fkey(full_name, email),
          approval_request_steps(*, profiles!approval_request_steps_approver_user_id_fkey(full_name))
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

export function useAllApprovalRequests() {
  return useQuery({
    queryKey: ['all_approval_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(`
          *,
          approval_modules(code, name),
          approval_flows(name, allow_return_for_adjustment, return_mode, approval_type),
          profiles!approval_requests_requester_user_id_fkey(full_name, email),
          approval_request_steps(*, profiles!approval_request_steps_approver_user_id_fkey(full_name))
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useProcessApproval() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { approvalRequestId: string; action: string; comments?: string }) => {
      const { data, error } = await supabase.rpc('process_approval_action', {
        p_approval_request_id: params.approvalRequestId,
        p_action: params.action,
        p_comments: params.comments || null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_approvals'] });
      qc.invalidateQueries({ queryKey: ['all_approval_requests'] });
      qc.invalidateQueries({ queryKey: ['approval_flows'] });
      qc.invalidateQueries({ queryKey: ['approval_request_for'] });
      qc.invalidateQueries({ queryKey: ['fuel_requests'] });
      qc.invalidateQueries({ queryKey: ['fuel_request'] });
      toast({ title: 'Ação registrada com sucesso' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

/**
 * Profiles eligible as approvers.
 * Critério (Fase 1 hardening):
 *   - Apenas `user_role_assignments` (a tabela legada `user_roles` foi descontinuada
 *     como fonte de elegibilidade — ela continua sendo lida apenas pelo
 *     `get_user_roles` RPC para compatibilidade histórica).
 *   - O cargo precisa ser diferente de `colaborador` OU o role precisa ser master.
 *   - O perfil precisa estar ativo (`profiles.active = true`).
 */
export function useEligibleApprovers() {
  return useQuery({
    queryKey: ['eligible_approvers'],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, active')
        .order('full_name');
      if (pErr) throw pErr;

      const { data: assignments, error: aErr } = await supabase
        .from('user_role_assignments')
        .select('user_id, roles(key, is_master)');
      if (aErr) throw aErr;

      const eligibleUserIds = new Set<string>();
      (assignments || []).forEach((a: any) => {
        const roleKey = a.roles?.key;
        const isMaster = !!a.roles?.is_master;
        if (isMaster || (roleKey && roleKey !== 'colaborador')) {
          eligibleUserIds.add(a.user_id);
        }
      });

      return (profiles || [])
        .filter((p: any) => p.active !== false)
        .filter((p: any) => eligibleUserIds.has(p.id));
    },
  });
}

/** All profiles (kept for backward compatibility) */
export function useProfiles() {
  return useQuery({
    queryKey: ['all_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });
}

/** Roles eligible as approver profiles (non-colaborador, active) */
export function useApproverRoles() {
  return useQuery({
    queryKey: ['approver_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, key, name, is_master')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data || []).filter((r: any) => r.key !== 'colaborador');
    },
  });
}

/** Fuel requests awaiting admin forwarding (status = enviado) — not yet in approval flow */
export function usePendingFuelRequests() {
  return useQuery({
    queryKey: ['fuel_requests_awaiting_forwarding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, type, status, created_at, updated_at, valor, placa, motivo, daily_category, person_name, requester_user_id, profiles!fuel_requests_requester_user_id_fkey(full_name, email)')
        .is('deleted_at', null)
        .eq('status', 'enviado')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}
