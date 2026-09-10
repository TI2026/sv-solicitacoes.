-- Anon must never call the role-check helper
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- Internal/admin-only routines must not be callable from the client API
REVOKE EXECUTE ON FUNCTION public.admin_purge_test_data(text, boolean) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_test_data(text, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.activate_approval_v2() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_approval_v2() TO service_role;