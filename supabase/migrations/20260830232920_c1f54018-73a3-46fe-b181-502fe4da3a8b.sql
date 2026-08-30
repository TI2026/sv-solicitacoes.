
-- ============================================================
-- 1. approval_flow_steps: leitura escopada
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_approval_flow_step(p_step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'diretoria'::app_role)
      OR public.is_master(auth.uid())
      OR EXISTS (
        SELECT 1
          FROM public.approval_request_steps ars
          JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
         WHERE ars.flow_step_id = p_step_id
           AND (
             ar.requester_user_id = auth.uid()
             OR ars.approver_user_id = auth.uid()
             OR ars.primary_user_id = auth.uid()
             OR ars.substitute_user_id = auth.uid()
           )
      )
      OR EXISTS (
        SELECT 1
          FROM public.approval_flow_steps afs
         WHERE afs.id = p_step_id
           AND (
             afs.approver_user_id = auth.uid()
             OR afs.substitute_user_id = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.sectors s
                WHERE s.id = afs.fixed_sector_id
                  AND (s.responsible_user_id = auth.uid()
                       OR s.substitute_user_id = auth.uid())
             )
           )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.can_view_approval_flow_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_approval_flow_step(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can view approval flow steps" ON public.approval_flow_steps;
CREATE POLICY "Participants and admins view approval flow steps"
ON public.approval_flow_steps FOR SELECT TO authenticated
USING (public.can_view_approval_flow_step(id));

-- ============================================================
-- 2. audit_logs: sem inserção direta pelo cliente
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
REVOKE INSERT ON TABLE public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_client_event(
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_entity text := lower(trim(COALESCE(p_entity_type, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUDIT_UNAUTHENTICATED';
  END IF;

  IF v_entity NOT IN (
    'auth','epi_items','epi_deliveries','collaborators','admission_requests'
  ) THEN
    RAISE EXCEPTION 'AUDIT_ENTITY_TYPE_DENIED';
  END IF;

  IF NOT (
    v_action IN (
      'password_changed','password_reset_completed',
      'create','update','edit_admission','epi_dismissal_report'
    )
    OR v_action LIKE 'epi\_%'
  ) THEN
    RAISE EXCEPTION 'AUDIT_ACTION_DENIED';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    v_action,
    v_entity,
    NULLIF(left(COALESCE(p_entity_id, ''), 200), ''),
    COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('source', 'client')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_event(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_event(text, text, text, jsonb) TO authenticated;

-- ============================================================
-- 3. candidate_documents: policies por comando
-- ============================================================
DROP POLICY IF EXISTS "RH chain manages candidate_documents" ON public.candidate_documents;

CREATE POLICY "RH chain reads candidate documents"
ON public.candidate_documents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "RH chain creates candidate documents"
ON public.candidate_documents FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "RH chain updates candidate documents"
ON public.candidate_documents FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
);

CREATE POLICY "Directors delete candidate documents"
ON public.candidate_documents FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
);

-- ============================================================
-- 4. clinics: leitura restrita à cadeia RH
-- ============================================================
DROP POLICY IF EXISTS "Anyone authenticated can view clinics" ON public.clinics;
CREATE POLICY "RH chain views clinics"
ON public.clinics FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'rh'::app_role)
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'master'::app_role)
);

-- ============================================================
-- 5. role_permission_matrix: leitura administrativa
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view rpm" ON public.role_permission_matrix;
CREATE POLICY "Admins view role permission matrix"
ON public.role_permission_matrix FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.has_role(auth.uid(), 'administrativo'::app_role)
  OR public.is_master(auth.uid())
);

-- ============================================================
-- 6. vehicles: catálogo operacional mínimo
-- ============================================================
DROP POLICY IF EXISTS vehicles_select_authenticated ON public.vehicles;
CREATE POLICY vehicles_select_scoped
ON public.vehicles FOR SELECT TO authenticated
USING (
  status = 'ativo'
  OR public.has_role(auth.uid(), 'diretoria'::app_role)
  OR public.is_master(auth.uid())
);
