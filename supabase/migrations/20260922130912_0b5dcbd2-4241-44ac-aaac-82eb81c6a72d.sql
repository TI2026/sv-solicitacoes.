-- Helper: identidade ativa (SECURITY DEFINER evita recursao de RLS em profiles)
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.active, true)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated, service_role;

-- Substitui policies com USING (true) por predicado real
DROP POLICY IF EXISTS "Anyone authenticated can view role_permissions" ON public.role_permissions;
CREATE POLICY "Active members can view role_permissions"
ON public.role_permissions FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone can view approval_modules" ON public.approval_modules;
CREATE POLICY "Active members can view approval_modules"
ON public.approval_modules FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone can view permission_actions" ON public.permission_actions;
CREATE POLICY "Active members can view permission_actions"
ON public.permission_actions FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone authenticated can view categories" ON public.dynamic_categories;
CREATE POLICY "Active members can view categories"
ON public.dynamic_categories FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone authenticated can view sectors" ON public.sectors;
CREATE POLICY "Active members can view sectors"
ON public.sectors FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.roles;
CREATE POLICY "Active members can view roles"
ON public.roles FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone can view permission_modules" ON public.permission_modules;
CREATE POLICY "Active members can view permission_modules"
ON public.permission_modules FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone authenticated can view request_limits" ON public.request_limits;
CREATE POLICY "Active members can view request_limits"
ON public.request_limits FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone authenticated can view permissions" ON public.permissions;
CREATE POLICY "Active members can view permissions"
ON public.permissions FOR SELECT TO authenticated
USING (public.is_active_member());

DROP POLICY IF EXISTS "Anyone can view approval_flows" ON public.approval_flows;
CREATE POLICY "Active members can view approval_flows"
ON public.approval_flows FOR SELECT TO authenticated
USING (public.is_active_member());