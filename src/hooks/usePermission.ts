import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types';

export interface PermissionFallback {
  fallbackRoles?: AppRole[];
  fallbackAuthenticated?: boolean;
}

/**
 * Resolves module visibility through the persisted RBAC matrix.
 *
 * Older installations may not have a permission catalog yet. Only in that
 * unconfigured state, the declared role/authenticated fallback preserves the
 * current MVP access model. Once module + action exist in the catalog, the
 * backend RPC result is authoritative, including an explicit denial.
 */
export function usePermission(
  moduleCode: string,
  actionCode: string,
  fallback: PermissionFallback = {},
) {
  const { user, hasAnyRole, isMaster } = useAuth();

  const query = useQuery({
    queryKey: ['permission', user?.id, moduleCode, actionCode],
    enabled: !!user?.id && !!moduleCode && !!actionCode,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [permission, module, action] = await Promise.all([
        supabase.rpc('current_user_has_permission', {
          p_module_code: moduleCode,
          p_action_code: actionCode,
        }),
        supabase
          .from('permission_modules')
          .select('id')
          .eq('code', moduleCode)
          .eq('active', true)
          .maybeSingle(),
        supabase
          .from('permission_actions')
          .select('id')
          .eq('code', actionCode)
          .eq('active', true)
          .maybeSingle(),
      ]);
      if (permission.error) throw permission.error;
      if (module.error) throw module.error;
      if (action.error) throw action.error;
      return {
        configured: Boolean(module.data && action.data),
        allowed: Boolean(permission.data),
      };
    },
  });

  const compatibilityFallback = fallback.fallbackAuthenticated
    || hasAnyRole(fallback.fallbackRoles || []);
  const allowed = isMaster || (
    query.data?.configured
      ? query.data.allowed
      : (!query.isError && compatibilityFallback)
  );

  return {
    allowed,
    configured: query.data?.configured ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export default usePermission;
