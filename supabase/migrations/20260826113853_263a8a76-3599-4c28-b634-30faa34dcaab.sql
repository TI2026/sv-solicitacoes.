-- 1. PROFILES: remove blanket directory read (exposes email/department/manager)
DROP POLICY IF EXISTS "Authenticated can read profiles directory" ON public.profiles;
-- remaining SELECT policy: "Users can view profiles (self or staff)"

-- Safe, non-sensitive directory (names/avatars only) for all authenticated users.
CREATE OR REPLACE VIEW public.vw_employee_directory AS
SELECT id, full_name AS display_name, avatar_url AS avatar, sector_id, active
FROM public.profiles
WHERE active = true;

-- definer view: exposes ONLY non-sensitive columns, never email/department/manager
ALTER VIEW public.vw_employee_directory SET (security_invoker = false);
REVOKE ALL ON public.vw_employee_directory FROM anon;
GRANT SELECT ON public.vw_employee_directory TO authenticated;

-- 2. approval_flow_steps: consolidate duplicate SELECT policies
DROP POLICY IF EXISTS "Authenticated view approval flow steps" ON public.approval_flow_steps;

-- 3. candidates / candidate_documents: tighten PII access to RH chain only
DROP POLICY IF EXISTS "Admins and RH can manage candidates" ON public.candidates;
CREATE POLICY "RH chain can manage candidates"
  ON public.candidates FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

DROP POLICY IF EXISTS "Admins and RH manage candidate_documents" ON public.candidate_documents;
CREATE POLICY "RH chain manages candidate_documents"
  ON public.candidate_documents FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

-- 4. Stop broadcasting candidate PII over Realtime (no client subscribes to these)
ALTER PUBLICATION supabase_realtime DROP TABLE public.candidates;
ALTER PUBLICATION supabase_realtime DROP TABLE public.candidate_documents;