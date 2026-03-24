import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useRoles() {
  return useQuery({
    queryKey: ['rbac_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('key');
      if (error) throw error;
      return data || [];
    },
  });
}

export function usePermissionModules() {
  return useQuery({
    queryKey: ['permission_modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_modules')
        .select('*')
        .eq('active', true)
        .order('code');
      if (error) throw error;
      return data || [];
    },
  });
}

export function usePermissionActions() {
  return useQuery({
    queryKey: ['permission_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_actions')
        .select('*')
        .eq('active', true)
        .order('code');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useRolePermissionMatrix(roleId?: string) {
  return useQuery({
    queryKey: ['role_permission_matrix', roleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permission_matrix')
        .select('*')
        .eq('role_id', roleId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!roleId,
  });
}

export function useToggleRolePermission() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { roleId: string; moduleId: string; actionId: string; allowed: boolean }) => {
      if (params.allowed) {
        const { error } = await supabase
          .from('role_permission_matrix')
          .upsert({ role_id: params.roleId, module_id: params.moduleId, action_id: params.actionId, allowed: true },
            { onConflict: 'role_id,module_id,action_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('role_permission_matrix')
          .delete()
          .eq('role_id', params.roleId)
          .eq('module_id', params.moduleId)
          .eq('action_id', params.actionId);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['role_permission_matrix', vars.roleId] });
      qc.invalidateQueries({ queryKey: ['user_effective_permissions'] });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUsersWithRoleAssignments() {
  return useQuery({
    queryKey: ['users_role_assignments'],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, department, avatar_url, created_at')
        .order('full_name');
      if (pErr) throw pErr;

      const { data: assignments, error: aErr } = await supabase
        .from('user_role_assignments')
        .select('user_id, role_id, assigned_by, created_at, roles(id, key, name, is_master)');
      if (aErr) throw aErr;

      return (profiles || []).map((p: any) => ({
        ...p,
        assignments: (assignments || []).filter((a: any) => a.user_id === p.id),
      }));
    },
  });
}

export function useAssignUserRole() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { userId: string; roleId: string; assignedBy: string }) => {
      await supabase.from('user_role_assignments').delete().eq('user_id', params.userId);
      const { error } = await supabase
        .from('user_role_assignments')
        .insert({ user_id: params.userId, role_id: params.roleId, assigned_by: params.assignedBy });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users_role_assignments'] });
      qc.invalidateQueries({ queryKey: ['user_effective_permissions'] });
      toast({ title: 'Cargo atualizado com sucesso' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUserEffectivePermissions(userId?: string) {
  return useQuery({
    queryKey: ['user_effective_permissions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_effective_permissions')
        .select('*, permission_modules(code, name), permission_actions(code, name)')
        .eq('user_id', userId!)
        .eq('allowed', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

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
        .select('*, approval_modules(code, name), approval_flow_steps(*, profiles(full_name, email), sectors:fixed_sector_id(id, name))')
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
  approverType: 'usuario_fixo' | 'responsavel_do_setor_do_solicitante' | 'responsavel_do_setor_especifico' | 'gestor_imediato' | 'cargo_perfil';
  fixedUserId: string | null;
  fixedSectorId: string | null;
  /** For cargo_perfil type: role key to match */
  approverRoleKey: string | null;
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
    }) => {
      let flowId = params.id;

      if (flowId) {
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

        await supabase.from('approval_flow_steps').delete().eq('flow_id', flowId);
      } else {
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

      if (params.steps.length > 0) {
        const { error } = await supabase
          .from('approval_flow_steps')
          .insert(
            params.steps.map(s => ({
              flow_id: flowId!,
              step_order: s.stepOrder,
              approver_type: s.approverType === 'cargo_perfil'
                ? `cargo_perfil:${s.approverRoleKey || ''}`
                : s.approverType,
              approver_user_id: s.approverType === 'usuario_fixo' ? s.fixedUserId : null,
              fixed_sector_id: s.approverType === 'responsavel_do_setor_especifico' ? s.fixedSectorId : null,
            }))
          );
        if (error) throw error;
      }

      return flowId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_flows'] });
      toast({ title: 'Fluxo salvo com sucesso' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
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
          approval_request_steps(*, profiles(full_name))
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
          approval_request_steps(*, profiles(full_name))
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

/** Profiles eligible as approvers: exclude colaborador role */
export function useEligibleApprovers() {
  return useQuery({
    queryKey: ['eligible_approvers'],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name');
      if (pErr) throw pErr;

      // Get user_roles to filter out pure colaborador users
      const { data: userRoles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rErr) throw rErr;

      // Also get role assignments for extra context
      const { data: assignments, error: aErr } = await supabase
        .from('user_role_assignments')
        .select('user_id, roles(key, is_master)');
      if (aErr) throw aErr;

      // Build a set of user IDs that have at least one non-colaborador role
      const eligibleUserIds = new Set<string>();
      
      // From user_roles (legacy enum roles)
      (userRoles || []).forEach((ur: any) => {
        if (ur.role !== 'colaborador') {
          eligibleUserIds.add(ur.user_id);
        }
      });

      // From user_role_assignments (new RBAC)
      (assignments || []).forEach((a: any) => {
        const roleKey = a.roles?.key;
        if (roleKey && roleKey !== 'colaborador') {
          eligibleUserIds.add(a.user_id);
        }
        if (a.roles?.is_master) {
          eligibleUserIds.add(a.user_id);
        }
      });

      return (profiles || []).filter((p: any) => eligibleUserIds.has(p.id));
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
      // Exclude colaborador
      return (data || []).filter((r: any) => r.key !== 'colaborador');
    },
  });
}
