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
      const { data, error } = await (supabase as any).rpc('set_role_permission', {
        p_role_id: params.roleId,
        p_module_id: params.moduleId,
        p_action_id: params.actionId,
        p_allowed: params.allowed,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'ROLE_PERMISSION_FAILED');
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
      void params.assignedBy;
      const { data, error } = await (supabase as any).rpc('set_user_role_assignment', {
        p_user_id: params.userId,
        p_role_id: params.roleId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'ROLE_ASSIGNMENT_FAILED');
      return { roleKey: result.role_key, isMaster: result.is_master };
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
