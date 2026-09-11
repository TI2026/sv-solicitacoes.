-- RLS policies (vehicles_select_scoped, role_permission_matrix) call public.is_master(),
-- so the authenticated role must be able to execute it. Same exposure class as has_role().
GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO authenticated;