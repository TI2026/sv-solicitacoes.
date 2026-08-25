-- CHECKPOINT B — regras empresariais e security gate.
-- Migration aditiva: não altera migrations históricas.

-- ---------------------------------------------------------------------------
-- 1. Somente o executor V2 é API pública de workflow.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admission_set_status(uuid, public.admission_status, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_set_status(uuid, public.fuel_status, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.termination_set_status(uuid, public.termination_status, text)
  FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF to_regprocedure('public.check_and_escalate_timeouts()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_and_escalate_timeouts() FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Campos controlados: nem Master usa UPDATE bruto.
-- SECURITY DEFINER do motor executa como owner e continua autorizado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchases_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_value IS DISTINCT FROM OLD.approved_value
     OR NEW.purchase_number IS DISTINCT FROM OLD.purchase_number
     OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fuel_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.oc_number IS DISTINCT FROM OLD.oc_number
     OR NEW.oc_uploaded_by IS DISTINCT FROM OLD.oc_uploaded_by
     OR NEW.oc_uploaded_at IS DISTINCT FROM OLD.oc_uploaded_at
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.payment_notes IS DISTINCT FROM OLD.payment_notes
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  THEN
    RAISE EXCEPTION 'FUEL_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fuel_requests_guard_controlled_fields ON public.fuel_requests;
CREATE TRIGGER tr_fuel_requests_guard_controlled_fields
BEFORE UPDATE ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.fuel_requests_guard_controlled_fields();

-- ---------------------------------------------------------------------------
-- 3. Validação empresarial no backend.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_fuel_request_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := lower(COALESCE(NEW.type, ''));
BEGIN
  -- Restore/seed e funções SECURITY DEFINER do motor operam como owner.
  -- A validação empresarial é aplicada às escritas vindas do cliente/RLS.
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.type IS NOT DISTINCT FROM OLD.type
     AND NEW.valor IS NOT DISTINCT FROM OLD.valor
     AND NEW.data_abastecimento IS NOT DISTINCT FROM OLD.data_abastecimento
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.placa IS NOT DISTINCT FROM OLD.placa
     AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
     AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
     AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method
     AND NEW.pix_key IS NOT DISTINCT FROM OLD.pix_key
     AND NEW.bank_name IS NOT DISTINCT FROM OLD.bank_name
     AND NEW.bank_agency IS NOT DISTINCT FROM OLD.bank_agency
     AND NEW.bank_account IS NOT DISTINCT FROM OLD.bank_account
     AND NEW.daily_category IS NOT DISTINCT FROM OLD.daily_category
     AND NEW.person_name IS NOT DISTINCT FROM OLD.person_name
     AND NEW.daily_value IS NOT DISTINCT FROM OLD.daily_value
  THEN
    RETURN NEW;
  END IF;

  IF v_type NOT IN ('abastecimento','diaria','reembolso') THEN
    RAISE EXCEPTION 'REQUEST_TYPE_INVALID';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 50000 THEN
    RAISE EXCEPTION 'REQUEST_VALUE_INVALID';
  END IF;

  IF v_type = 'abastecimento' THEN
    IF NEW.data_abastecimento <> current_date THEN
      RAISE EXCEPTION 'FUEL_DATE_MUST_BE_TODAY';
    END IF;
    IF NULLIF(trim(NEW.placa), '') IS NULL OR NULLIF(trim(NEW.motivo), '') IS NULL THEN
      RAISE EXCEPTION 'FUEL_REQUIRED_FIELDS_MISSING';
    END IF;
  ELSIF v_type = 'diaria' THEN
    IF NEW.data_abastecimento < current_date THEN
      RAISE EXCEPTION 'DAILY_DATE_MUST_BE_TODAY_OR_FUTURE';
    END IF;
    IF NULLIF(trim(NEW.daily_category), '') IS NULL
       OR NULLIF(trim(NEW.person_name), '') IS NULL
       OR COALESCE(NEW.daily_value, 0) <= 0 THEN
      RAISE EXCEPTION 'DAILY_REQUIRED_FIELDS_MISSING';
    END IF;
  ELSE
    IF NEW.data_abastecimento > current_date THEN
      RAISE EXCEPTION 'REIMBURSEMENT_FUTURE_DATE_DENIED';
    END IF;
    IF NULLIF(trim(NEW.categoria), '') IS NULL OR NULLIF(trim(NEW.notes), '') IS NULL THEN
      RAISE EXCEPTION 'REIMBURSEMENT_REQUIRED_FIELDS_MISSING';
    END IF;
    IF NEW.payment_method = 'pix' AND NULLIF(trim(NEW.pix_key), '') IS NULL THEN
      RAISE EXCEPTION 'REIMBURSEMENT_PIX_REQUIRED';
    ELSIF NEW.payment_method = 'banco'
          AND (NULLIF(trim(NEW.bank_name), '') IS NULL
               OR NULLIF(trim(NEW.bank_agency), '') IS NULL
               OR NULLIF(trim(NEW.bank_account), '') IS NULL) THEN
      RAISE EXCEPTION 'REIMBURSEMENT_BANK_DATA_REQUIRED';
    ELSIF NEW.payment_method NOT IN ('pix','banco') THEN
      RAISE EXCEPTION 'REIMBURSEMENT_PAYMENT_METHOD_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_validate_fuel_request_business_rules ON public.fuel_requests;
CREATE TRIGGER tr_validate_fuel_request_business_rules
BEFORE INSERT OR UPDATE ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_fuel_request_business_rules();

CREATE OR REPLACE FUNCTION public.enforce_configured_request_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
BEGIN
  IF OLD.status::text <> 'rascunho' OR NEW.status::text = 'rascunho' THEN
    RETURN NEW;
  END IF;

  SELECT max(rl.daily_limit)
    INTO v_limit
  FROM public.request_limits rl
  JOIN public.roles r ON r.key = rl.role AND r.active
  JOIN public.user_role_assignments ura ON ura.role_id = r.id
  WHERE ura.user_id = NEW.requester_user_id
    AND rl.request_type = NEW.type;

  -- Ausência de configuração significa ilimitado.
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_used
  FROM public.fuel_requests fr
  WHERE fr.requester_user_id = NEW.requester_user_id
    AND fr.type = NEW.type
    AND fr.id <> NEW.id
    AND fr.deleted_at IS NULL
    AND fr.status::text <> 'rascunho'
    AND fr.created_at >= date_trunc('day', now())
    AND fr.created_at < date_trunc('day', now()) + interval '1 day';

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'REQUEST_LIMIT_REACHED: %/%', v_used, v_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_configured_request_limit ON public.fuel_requests;
CREATE TRIGGER tr_enforce_configured_request_limit
BEFORE UPDATE OF status ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_configured_request_limit();

-- ---------------------------------------------------------------------------
-- 4. Role escalation e matriz: mutations somente por RPC Master + auditoria.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Only diretoria can manage roles" ON public.roles;
DROP POLICY IF EXISTS "Diretoria manages ura" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Admin can manage role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Diretoria manages rpm" ON public.role_permission_matrix;
DROP POLICY IF EXISTS "Diretoria manages permission_modules" ON public.permission_modules;
DROP POLICY IF EXISTS "Diretoria manages permission_actions" ON public.permission_actions;

CREATE OR REPLACE FUNCTION public.set_user_role_assignment(p_user_id uuid, p_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role public.roles%ROWTYPE;
  v_target_was_master boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_master(v_actor) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MASTER_REQUIRED');
  END IF;
  IF p_user_id IS NULL OR p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ARGUMENT');
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROLE_NOT_FOUND');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = p_user_id AND (r.is_master OR r.key = 'master')
  ) INTO v_target_was_master;

  IF v_target_was_master AND NOT (v_role.is_master OR v_role.key = 'master')
     AND (SELECT count(DISTINCT ura.user_id)
          FROM public.user_role_assignments ura
          JOIN public.roles r ON r.id = ura.role_id
          WHERE r.is_master OR r.key = 'master') <= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'LAST_MASTER_PROTECTED');
  END IF;

  DELETE FROM public.user_role_assignments WHERE user_id = p_user_id;
  INSERT INTO public.user_role_assignments(user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, v_actor);
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  PERFORM public.rebuild_user_permissions(p_user_id);

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'ROLE_ASSIGNMENT_SET', 'profiles', p_user_id::text,
          jsonb_build_object('role_id', p_role_id, 'role_key', v_role.key,
                             'is_master', v_role.is_master));

  RETURN jsonb_build_object('success', true, 'role_key', v_role.key,
                            'is_master', v_role.is_master);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_role_permission(
  p_role_id uuid, p_module_id uuid, p_action_id uuid, p_allowed boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_master(v_actor) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MASTER_REQUIRED');
  END IF;
  IF p_allowed THEN
    INSERT INTO public.role_permission_matrix(role_id, module_id, action_id, allowed)
    VALUES (p_role_id, p_module_id, p_action_id, true)
    ON CONFLICT (role_id, module_id, action_id)
    DO UPDATE SET allowed = EXCLUDED.allowed;
  ELSE
    DELETE FROM public.role_permission_matrix
    WHERE role_id = p_role_id AND module_id = p_module_id AND action_id = p_action_id;
  END IF;

  FOR v_user IN SELECT user_id FROM public.user_role_assignments WHERE role_id = p_role_id LOOP
    PERFORM public.rebuild_user_permissions(v_user);
  END LOOP;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (v_actor, 'ROLE_PERMISSION_SET', 'roles', p_role_id::text,
          jsonb_build_object('module_id', p_module_id, 'action_id', p_action_id,
                             'allowed', p_allowed));
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role_assignment(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_role_permission(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_role_permission(uuid, uuid, uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Storage: políticas explícitas por operação; nenhum FOR ALL legado.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Purchases bucket requires authentication" ON storage.objects;

DROP POLICY IF EXISTS "Admins and RH can view admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can view admissions files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'admissions' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Admins and RH can insert admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can insert admissions files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'admissions' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Admins and RH can update admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can update admissions files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'admissions' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
))
WITH CHECK (bucket_id = 'admissions' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Admins and RH can delete admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can delete admissions files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'admissions' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Authorized users can view epi files" ON storage.objects;
CREATE POLICY "Authorized users can view epi files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'epis' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Authorized users can insert epi files" ON storage.objects;
CREATE POLICY "Authorized users can insert epi files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'epis' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Admins RH update epis" ON storage.objects;
CREATE POLICY "Authorized users can update epi files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'epis' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
))
WITH CHECK (bucket_id = 'epis' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

DROP POLICY IF EXISTS "Authorized users can delete epi files" ON storage.objects;
CREATE POLICY "Authorized users can delete epi files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'epis' AND (
  public.current_has_role('diretoria'::public.app_role)
  OR public.current_has_role('administrativo'::public.app_role)
  OR public.current_has_role('rh'::public.app_role)
  OR public.current_has_role('master'::public.app_role)
));

REVOKE ALL ON TABLE public.documents FROM anon;
REVOKE ALL ON TABLE public.candidate_documents FROM anon;
REVOKE ALL ON TABLE public.document_reviews FROM anon;

REVOKE ALL ON FUNCTION public.fuel_requests_guard_controlled_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_fuel_request_business_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_configured_request_limit() FROM PUBLIC, anon, authenticated;
