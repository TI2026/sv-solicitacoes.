-- 1. Tighten notifications INSERT policy (was WITH CHECK true)
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated can insert own notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. Restrict get_user_roles to own user or diretoria
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
  RETURNS app_role[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), '{}')
  FROM public.user_roles
  WHERE user_id = _user_id
    AND (_user_id = auth.uid() OR public.has_role(auth.uid(), 'diretoria'))
$$;