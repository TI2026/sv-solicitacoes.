-- RELEASE GATE FINAL — least privilege for SECURITY DEFINER maintenance RPCs.
-- Incremental migration: published migrations remain unchanged.

-- Internal cache rebuild is invoked by trusted trigger/RPC owners only.
REVOKE ALL ON FUNCTION public.rebuild_user_permissions(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_user_permissions(uuid)
  TO service_role;

-- The maintenance screen is authenticated and the function itself enforces
-- Master membership. Anonymous callers must not reach the definer function.
REVOKE ALL ON FUNCTION public.admin_purge_test_data(text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_test_data(text, boolean)
  TO authenticated, service_role;
