import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/types';

// Map RBAC role keys to legacy app_role enum values
const ROLE_KEY_TO_APP_ROLE: Record<string, AppRole> = {
  master: 'diretoria',
  diretoria: 'diretoria',
  administrativo: 'administrativo',
  rh: 'rh',
  supervisor: 'administrativo',
  financeiro: 'administrativo',
  compras: 'administrativo',
  colaborador: 'colaborador',
};

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
        .select('id, full_name, email, department, avatar_url, created_at, sector_id, manager_user_id')
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
      // 1. Get the role details to know the key
      const { data: roleData, error: roleErr } = await supabase
        .from('roles')
        .select('id, key, is_master')
        .eq('id', params.roleId)
        .single();
      if (roleErr) throw roleErr;

      // 2. Update user_role_assignments (RBAC table)
      await supabase.from('user_role_assignments').delete().eq('user_id', params.userId);
      const { error: insertErr } = await supabase
        .from('user_role_assignments')
        .insert({ user_id: params.userId, role_id: params.roleId, assigned_by: params.assignedBy });
      if (insertErr) throw insertErr;

      // 3. Sync legacy user_roles table (used by AuthContext, guards, sidebar)
      const mappedAppRole = ROLE_KEY_TO_APP_ROLE[roleData.key] || 'colaborador';

      // Delete existing legacy roles
      await supabase.from('user_roles').delete().eq('user_id', params.userId);

      // Insert mapped legacy role
      const { error: legacyErr } = await supabase
        .from('user_roles')
        .insert({ user_id: params.userId, role: mappedAppRole });
      if (legacyErr) throw legacyErr;

      // For master/diretoria, also add administrativo for broader access
      if (roleData.is_master || roleData.key === 'diretoria') {
        await supabase.from('user_roles')
          .insert({ user_id: params.userId, role: 'administrativo' as AppRole })
          .then(() => {}); // ignore if duplicate
      }

      // 4. Rebuild effective permissions
      await supabase.rpc('rebuild_user_permissions', { p_user_id: params.userId });

      // 5. Audit log
      await supabase.from('audit_logs').insert({
        user_id: params.assignedBy,
        action: 'role_change',
        entity_type: 'profiles',
        entity_id: params.userId,
        details: {
          new_role_key: roleData.key,
          new_role_id: params.roleId,
          mapped_legacy_role: mappedAppRole,
          is_master: roleData.is_master,
        },
      });

      return { roleKey: roleData.key, isMaster: roleData.is_master };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users_role_assignments'] });
      qc.invalidateQueries({ queryKey: ['user_effective_permissions'] });
      qc.invalidateQueries({ queryKey: ['all_profiles'] });
      qc.invalidateQueries({ queryKey: ['eligible_approvers'] });
      toast({ title: 'Cargo atualizado com sucesso' });
    },
    onError: (err: any) => {
      console.error('Role assignment error:', err);
      toast({ title: 'Erro ao atualizar cargo', description: 'Não foi possível salvar a alteração. Tente novamente.', variant: 'destructive' });
    },
  });
}

export function useUpdateUserOrgFields() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { userId: string; sectorId: string | null; managerUserId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ sector_id: params.sectorId, manager_user_id: params.managerUserId })
        .eq('id', params.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users_role_assignments'] });
      qc.invalidateQueries({ queryKey: ['all_profiles'] });
      toast({ title: 'Dados organizacionais atualizados' });
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

          // Safe to delete steps — no approval_request_steps reference them
          const { error: delErr } = await supabase
            .from('approval_flow_steps')
            .delete()
            .eq('flow_id', flowId);
          if (delErr) throw delErr;
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

      // Insert steps for the (possibly new) flow
      if (params.steps.length > 0) {
        const reindexedSteps = params.steps.map((s, idx) => {
          const isDynamic = ['responsavel_do_setor_do_solicitante', 'gestor_imediato'].includes(s.approverType);
          return {
            flow_id: flowId!,
            step_order: idx + 1,
            approver_type: s.approverType === 'cargo_perfil'
              ? `cargo_perfil:${s.approverRoleKey || ''}`
              : s.approverType,
            approver_user_id: s.approverType === 'usuario_fixo'
              ? s.fixedUserId
              : isDynamic ? (params.createdBy || null) : null,
            fixed_sector_id: s.approverType === 'responsavel_do_setor_especifico' ? s.fixedSectorId : null,
          };
        });

        const { error } = await supabase
          .from('approval_flow_steps')
          .insert(reindexedSteps);
        if (error) throw error;
      }

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
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name');
      if (pErr) throw pErr;

      const { data: userRoles, error: rErr } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rErr) throw rErr;

      const { data: assignments, error: aErr } = await supabase
        .from('user_role_assignments')
        .select('user_id, roles(key, is_master)');
      if (aErr) throw aErr;

      const eligibleUserIds = new Set<string>();
      
      (userRoles || []).forEach((ur: any) => {
        if (ur.role !== 'colaborador') {
          eligibleUserIds.add(ur.user_id);
        }
      });

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
      return (data || []).filter((r: any) => r.key !== 'colaborador');
    },
  });
}
