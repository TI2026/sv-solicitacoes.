
-- ============================================================
-- Security hardening: RLS tightening, function grants, ownership checks
-- ============================================================

-- 1) Restrict anon access to sensitive tables (fixes SUPA_pg_graphql_anon_table_exposed)
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.user_role_assignments FROM anon;
REVOKE SELECT ON public.approval_flow_steps FROM anon;
REVOKE SELECT ON public.approval_requests FROM anon;
REVOKE SELECT ON public.approval_request_steps FROM anon;
REVOKE SELECT ON public.approval_flows FROM anon;
REVOKE SELECT ON public.approval_modules FROM anon;
REVOKE SELECT ON public.approval_history FROM anon;
REVOKE SELECT ON public.user_roles FROM anon;
REVOKE SELECT ON public.roles FROM anon;
REVOKE SELECT ON public.role_permission_matrix FROM anon;
REVOKE SELECT ON public.user_effective_permissions FROM anon;
REVOKE SELECT ON public.user_permission_overrides FROM anon;
REVOKE SELECT ON public.notifications FROM anon;
REVOKE SELECT ON public.audit_logs FROM anon;
REVOKE SELECT ON public.fuel_requests FROM anon;
REVOKE SELECT ON public.admission_requests FROM anon;

-- 2) Tighten profiles SELECT — self OR staff roles (colaborador only sees own)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view profiles (self or staff)"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'master'::app_role)
  OR has_role(auth.uid(), 'rh'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
);

-- 3) Tighten approval_flow_steps SELECT — authenticated only (not USING true from anon)
DROP POLICY IF EXISTS "Anyone can view afs" ON public.approval_flow_steps;
CREATE POLICY "Authenticated view approval flow steps"
ON public.approval_flow_steps FOR SELECT TO authenticated USING (true);

-- 4) Tighten user_role_assignments SELECT — self OR staff
DROP POLICY IF EXISTS "Anyone can view ura" ON public.user_role_assignments;
CREATE POLICY "View own role assignments or admin"
ON public.user_role_assignments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'master'::app_role)
  OR has_role(auth.uid(), 'rh'::app_role)
);

-- 5) Ownership check in start_approval_flow (fixes start_flow_no_owner_check)
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code text, p_reference_id uuid, p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
  _uid uuid := auth.uid();
BEGIN
  -- Enforce that caller is the requester, or an authorized admin
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;
  IF _uid <> p_requester_user_id
     AND NOT (has_role(_uid,'diretoria'::app_role)
              OR has_role(_uid,'administrativo'::app_role)
              OR has_role(_uid,'master'::app_role)
              OR has_role(_uid,'rh'::app_role)) THEN
    RETURN jsonb_build_object('error', 'Não autorizado a iniciar fluxo em nome de outro usuário');
  END IF;

  -- Prevent duplicate active flow for same reference
  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_reference_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('error', 'Já existe um fluxo de aprovação ativo para esta solicitação');
  END IF;

  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active LIMIT 1;
  IF _module_id IS NULL THEN RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado'); END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE module_id = _module_id AND active
    ORDER BY updated_at DESC, created_at DESC LIMIT 1;
  IF _flow.id IS NULL THEN RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (_module_id, _flow.id, p_reference_id, p_requester_user_id, 'pending_resolution')
  RETURNING id INTO _request_id;

  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    _resolved_sector_id := NULL;

    CASE _step.approver_type
      WHEN 'specific_user' THEN
        _resolved_user_id := _step.approver_user_id;
      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _step.sector_id;
        END IF;
      ELSE
        _resolved_user_id := _step.approver_user_id;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      INSERT INTO public.approval_request_steps (
        approval_request_id, flow_step_id, step_order, approver_user_id,
        is_required, status, timeout_hours
      ) VALUES (
        _request_id, _step.id, _step.step_order, _resolved_user_id,
        _step.is_required, 'pending', _step.timeout_hours
      );
      IF _first_approver IS NULL THEN
        _first_approver := _resolved_user_id;
        _first_order := _step.step_order;
      END IF;
    END IF;
  END LOOP;

  IF _first_approver IS NULL THEN
    DELETE FROM public.approval_requests WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'Nenhum aprovador válido encontrado');
  END IF;

  UPDATE public.approval_requests
    SET status = 'awaiting_step_' || _first_order,
        current_step_order = _first_order,
        current_approver_user_id = _first_approver
    WHERE id = _request_id;

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_first_approver, 'Nova aprovação pendente', 'Uma solicitação aguarda sua aprovação.',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$function$;

-- 6) Revoke EXECUTE from anon on SECURITY DEFINER functions (fixes SUPA_anon_security_definer_function_executable)
REVOKE EXECUTE ON FUNCTION public.admin_purge_test_data(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admission_set_status(uuid, admission_status, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_has_role(app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_permission(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fuel_set_status(uuid, fuel_status, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_approval_action(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_user_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_approval_flow_steps(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_request(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_participates_in_approval(uuid, uuid) FROM anon;

-- 7) Revoke EXECUTE from authenticated + anon on trigger/internal-only functions
-- (fixes SUPA_authenticated_security_definer_function_executable for functions that should never be called directly by clients)
REVOKE EXECUTE ON FUNCTION public.rebuild_user_permissions(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_purge_test_data(text, boolean) FROM authenticated;

-- 8) Fix storage.objects: prevent listing of public "avatars" bucket while keeping direct public URL reads working
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
-- Note: bucket.public=true still allows direct signed/public URL access to individual objects without needing a SELECT policy.

-- 9) Set search_path on any remaining public functions that lack it (defensive)
ALTER FUNCTION public.get_dashboard_metrics() SET search_path = 'public';
