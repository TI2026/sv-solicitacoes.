-- Checkpoint 2: role scoping hardening (incremental migration)

-- 1. admission_requests insert: restrict role scope to authenticated
DROP POLICY IF EXISTS "Requester can insert own admission" ON public.admission_requests;
CREATE POLICY "Requester can insert own admission"
ON public.admission_requests
FOR INSERT
TO authenticated
WITH CHECK (requester_user_id = auth.uid());

-- 2. status_history RH read: restrict role scope to authenticated
DROP POLICY IF EXISTS "RH can view admission status history" ON public.status_history;
CREATE POLICY "RH can view admission status history"
ON public.status_history
FOR SELECT
TO authenticated
USING (module = 'admissions' AND has_role(auth.uid(), 'rh'::app_role));

-- 3. documents catalogue: stop exposing requirement definitions to every
--    authenticated user. Public candidate flows read it through SECURITY
--    DEFINER edge/service paths, which are unaffected by RLS.
DROP POLICY IF EXISTS "Anyone authenticated can view documents" ON public.documents;
CREATE POLICY "Admission chain reads document definitions"
ON public.documents
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'rh'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'master'::app_role)
);