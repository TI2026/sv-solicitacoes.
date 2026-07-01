import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const GRANULAR_ROLE_KEYS = [
  'master', 'diretoria', 'supervisor', 'administrativo',
  'financeiro', 'compras', 'rh', 'colaborador',
] as const;

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
      const { data: roleData, error: roleErr } = await supabase
        .from('roles')
        .select('id, key, is_master')
        .eq('id', params.roleId)
        .single();
      if (roleErr) throw roleErr;

      await supabase.from('user_role_assignments').delete().eq('user_id', params.userId);
      const { error: insertErr } = await supabase
        .from('user_role_assignments')
        .insert({ user_id: params.userId, role_id: params.roleId, assigned_by: params.assignedBy });
      if (insertErr) throw insertErr;

      await supabase.from('user_roles').delete().eq('user_id', params.userId);
      await supabase.rpc('rebuild_user_permissions', { p_user_id: params.userId });

      await supabase.from('audit_logs').insert({
        user_id: params.assignedBy,
        action: 'role_change',
        entity_type: 'profiles',
        entity_id: params.userId,
        details: {
          new_role_key: roleData.key,
          new_role_id: params.roleId,
          granular: GRANULAR_ROLE_KEYS.includes(roleData.key as any),
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
