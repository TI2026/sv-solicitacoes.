-- ============================================================
-- SPRINT 15.1: 007/008/009/010/011 (adaptado ao schema real)
-- ============================================================

-- ==========================================
-- 1. PROFILES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can read profiles directory" ON public.profiles;

CREATE POLICY "Authenticated can read profiles directory"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE VIEW public.vw_employee_directory AS
SELECT
  id,
  full_name AS display_name,
  avatar_url AS avatar,
  sector_id,
  active
FROM public.profiles
WHERE active = true;

REVOKE ALL ON public.vw_employee_directory FROM anon;
GRANT SELECT ON public.vw_employee_directory TO authenticated;

-- ==========================================
-- 2. ROLE ASSIGNMENTS
-- ==========================================
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read user_role_assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view all role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can read own role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Admin can manage role assignments" ON public.user_role_assignments;

CREATE POLICY "Users can read own role assignments"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "Admin can manage role assignments"
  ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.key
  FROM public.roles r
  JOIN public.user_role_assignments ura ON ura.role_id = r.id
  WHERE ura.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- ==========================================
-- 3. APPROVAL FLOW CONFIG
-- ==========================================
ALTER TABLE public.approval_flow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view approval flow steps" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Users can view flow steps" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Admin can view approval flow steps" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Admin can manage approval flow steps" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Authenticated can view approval flow steps" ON public.approval_flow_steps;

CREATE POLICY "Authenticated can view approval flow steps"
  ON public.approval_flow_steps FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage approval flow steps"
  ON public.approval_flow_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- ==========================================
-- 4. APPROVAL REQUESTS
-- ==========================================
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view approval requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Anyone can view approval requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Restricted view on approval_requests" ON public.approval_requests;

CREATE POLICY "Restricted view on approval_requests"
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR current_approver_user_id = auth.uid()
    OR public.user_participates_in_approval(id, auth.uid())
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF public.approval_requests
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.approval_requests
  WHERE current_approver_user_id = auth.uid() AND status LIKE 'awaiting_step_%';
$$;

REVOKE ALL ON FUNCTION public.get_my_approval_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_request_approval_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('status', status, 'current_step_order', current_step_order)
  FROM public.approval_requests
  WHERE id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.get_request_approval_status(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_request_approval_status(uuid) TO authenticated;

-- ==========================================
-- 5. GRANTS / GRAPHQL
-- ==========================================
DO $$
DECLARE func record;
BEGIN
  FOR func IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('start_approval_flow','process_approval_action','termination_set_status')
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func.sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func.sig || ' FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '  || func.sig || ' TO authenticated';
  END LOOP;
END $$;

REVOKE ALL ON public.user_role_assignments FROM anon;
REVOKE ALL ON public.roles FROM anon;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.approval_requests FROM anon;
REVOKE ALL ON public.approval_flow_steps FROM anon;
REVOKE ALL ON public.approval_flows FROM anon;
REVOKE ALL ON public.approval_modules FROM anon;

COMMENT ON TABLE public.user_role_assignments IS '@graphql({"omit": true})';
COMMENT ON TABLE public.roles IS '@graphql({"omit": true})';
COMMENT ON TABLE public.permissions IS '@graphql({"omit": true})';
COMMENT ON TABLE public.role_permissions IS '@graphql({"omit": true})';
COMMENT ON TABLE public.approval_flows IS '@graphql({"omit": true})';
COMMENT ON TABLE public.approval_flow_steps IS '@graphql({"omit": true})';

-- ==========================================
-- 6. STORAGE (buckets já são privados)
-- ==========================================
DROP POLICY IF EXISTS "Anyone can upload to admissions" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads to admissions" ON storage.objects;
DROP POLICY IF EXISTS "Candidate uploads to admissions" ON storage.objects;
DROP POLICY IF EXISTS "Admissions bucket requires authentication" ON storage.objects;
CREATE POLICY "Admissions bucket requires authentication"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'admissions')
  WITH CHECK (bucket_id = 'admissions');

-- ==========================================
-- 7. USER PREFERENCES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver suas próprias preferências" ON public.user_preferences;
CREATE POLICY "Usuários podem ver suas próprias preferências" ON public.user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem inserir suas próprias preferências" ON public.user_preferences;
CREATE POLICY "Usuários podem inserir suas próprias preferências" ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias preferências" ON public.user_preferences;
CREATE POLICY "Usuários podem atualizar suas próprias preferências" ON public.user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias preferências" ON public.user_preferences;
CREATE POLICY "Usuários podem deletar suas próprias preferências" ON public.user_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.user_preferences;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- 8. FLEET DISCRIMINATORS
-- ==========================================
DO $$
DECLARE invalid_rows INT;
BEGIN
  SELECT COUNT(*) INTO invalid_rows
  FROM public.fuel_requests
  WHERE type IS NULL OR type NOT IN ('abastecimento','diaria','reembolso');

  IF invalid_rows > 0 THEN
    RAISE EXCEPTION 'fuel_requests possui % registros sem discriminador válido.', invalid_rows;
  END IF;
END $$;

ALTER TABLE public.fuel_requests DROP CONSTRAINT IF EXISTS check_fuel_request_type;
ALTER TABLE public.fuel_requests
  ADD CONSTRAINT check_fuel_request_type CHECK (type IN ('abastecimento','diaria','reembolso'));

CREATE INDEX IF NOT EXISTS idx_fuel_requests_type ON public.fuel_requests(type);
ALTER TABLE public.fuel_requests ALTER COLUMN type SET NOT NULL;