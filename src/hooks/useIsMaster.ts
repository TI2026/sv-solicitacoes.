import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true when the authenticated user has the `master` role.
 * Reads exclusively from the unified `get_user_roles` RPC consumed by AuthContext —
 * no extra DB queries, no role flattening to `administrativo`.
 */
export function useIsMaster(): boolean {
  const { isMaster } = useAuth();
  return isMaster;
}