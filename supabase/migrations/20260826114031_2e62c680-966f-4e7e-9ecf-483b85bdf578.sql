-- Revert definer view (avoids Security Definer View lint)
ALTER VIEW public.vw_employee_directory SET (security_invoker = true);

-- Safe directory exposing ONLY non-sensitive columns
CREATE OR REPLACE FUNCTION public.get_employee_directory()
RETURNS TABLE (id uuid, display_name text, avatar text, sector_id uuid, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.sector_id, p.active
  FROM public.profiles p
  WHERE p.active = true
$$;

REVOKE ALL ON FUNCTION public.get_employee_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_directory() TO authenticated;