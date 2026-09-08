-- Impede autodesativação/reativação do próprio perfil via API (RLS permite update amplo para admins;
-- esta guarda garante que 'active' do próprio usuário só muda via backend/service role ou terceiros autorizados).
CREATE OR REPLACE FUNCTION public.guard_profile_self_active_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service role / backend (auth.uid() IS NULL) e alterações por outros usuários seguem permitidas
  IF auth.uid() IS NOT NULL
     AND auth.uid() = NEW.id
     AND NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'SELF_ACTIVE_CHANGE_FORBIDDEN: não é permitido alterar o próprio status ativo';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_self_active_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard_self_active ON public.profiles;
CREATE TRIGGER trg_profiles_guard_self_active
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_self_active_change();