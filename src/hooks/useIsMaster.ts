import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true when the authenticated user has the `master` role
 * OR the `diretoria` role. Regra de negócio do cliente:
 * "quem é diretor é master e quem é master é diretor".
 * Reads from the unified `get_user_roles` RPC consumed by AuthContext —
 * no extra DB queries, no role flattening to `administrativo`.
 */
export function useIsMaster(): boolean {
  const { isMaster, hasRole } = useAuth();
  return isMaster || hasRole('diretoria');
}