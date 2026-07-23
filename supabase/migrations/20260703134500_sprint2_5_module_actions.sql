-- ============================================================
-- Sprint 2.5 — get_approval_context()
-- Expansão de Permissões: Ações de Módulo Específicas
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_approval_context(
  p_reference_id uuid,
  p_module_code   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid              uuid := auth.uid();
  _req              RECORD;
  _flow             RECORD;
  _step_cfg         RECORD;
  _approver_profile RECORD;
  _requester_profile RECORD;
  _total_steps      integer;
  _last_action_at   timestamptz;
  _visibility_mode  text;
  _is_requester     boolean;
  _is_approver      boolean;
  _is_sector        boolean;
  _is_global        boolean;
  _perm_approve     boolean;
  _perm_reject      boolean;
  _perm_return      boolean;
  _perm_edit        boolean;
  _perm_cancel      boolean;
  _perm_generate_oc boolean;
  _perm_confirm_pay boolean;
  
  -- Novas ações específicas de módulo
  _mod_analyze_travel boolean := false;
  _mod_confirm_fuel   boolean := false;
  _mod_review_admin   boolean := false;

  _reason_blocked   text := NULL;
  _domain_state     text;
  _domain_requester uuid;
BEGIN
  -- ============================================================
  -- 1. LOCALIZAR O APPROVAL REQUEST ATIVO E DOMÍNIO
  -- ============================================================
  SELECT ar.*
    INTO _req
  FROM public.approval_requests ar
  JOIN public.approval_modules  am ON am.id = ar.module_id
  WHERE ar.reference_id = p_reference_id
    AND ar.ended_at IS NULL
    AND (p_module_code IS NULL OR am.code = p_module_code)
  ORDER BY ar.created_at DESC
  LIMIT 1;

  -- Ler o estado da tabela de domínio 
  SELECT status, requester_user_id INTO _domain_state, _domain_requester
  FROM public.fuel_requests WHERE id = p_reference_id LIMIT 1;

  -- Se não existe fluxo ativo, retorna contexto mínimo (request pode estar em rascunho)
  IF _req IS NULL THEN
    _is_requester := (_domain_requester = _uid);
    RETURN jsonb_build_object(
      'is_in_flow', false,
      'status', 'draft',
      'flow', jsonb_build_object('id', null, 'name', null, 'current_step', 0, 'total_steps', 0, 'current_step_name', null),
      'current_approver', null,
      'requester', jsonb_build_object('id', null, 'name', null),
      'visibility', jsonb_build_object('mode', 'self'),
      'permissions', jsonb_build_object(
        'approve', false, 'reject', false, 'return', false,
        'edit', _is_requester,
        'cancel', _is_requester,
        'generate_oc', false, 'confirm_payment', false,
        'module_actions', jsonb_build_object(
          'analyze_travel', false,
          'confirm_fuel', false,
          'review_admin', false
        )
      ),
      'meta', jsonb_build_object('reason_blocked', null, 'last_action_at', null)
    );
  END IF;

  -- ============================================================
  -- 2. CARREGAR GABARITO DO FLUXO E STEP ATUAL
  -- ============================================================
  SELECT af.* INTO _flow FROM public.approval_flows af WHERE af.id = _req.flow_id;
  SELECT afs.* INTO _step_cfg FROM public.approval_flow_steps afs
  JOIN public.approval_request_steps ars ON ars.flow_step_id = afs.id
  WHERE ars.approval_request_id = _req.id AND ars.step_order = _req.current_step_order LIMIT 1;
  SELECT COUNT(*) INTO _total_steps FROM public.approval_flow_steps WHERE flow_id = _req.flow_id AND active = true;

  -- ============================================================
  -- 3. PERFIS (solicitante e aprovador atual)
  -- ============================================================
  SELECT id, full_name AS name INTO _requester_profile FROM public.profiles WHERE id = _req.requester_user_id;
  SELECT id, full_name AS name INTO _approver_profile FROM public.profiles WHERE id = _req.current_approver_user_id;
  SELECT MAX(created_at) INTO _last_action_at FROM public.approval_history WHERE approval_request_id = _req.id;

  -- ============================================================
  -- 4. RESOLUÇÃO DE VISIBILIDADE E ROLES
  -- ============================================================
  _is_requester := (_req.requester_user_id = _uid);
  _is_approver  := (_req.current_approver_user_id = _uid OR EXISTS (SELECT 1 FROM public.approval_request_steps WHERE approval_request_id = _req.id AND approver_user_id = _uid));
  _is_sector    := EXISTS (SELECT 1 FROM public.profiles p JOIN public.approval_request_steps ars ON ars.resolved_sector_id = p.sector_id WHERE p.id = _uid AND ars.approval_request_id = _req.id);
  _is_global    := (public.has_role(_uid, 'diretoria') OR public.has_role(_uid, 'administrativo') OR public.has_role(_uid, 'master'));

  IF _is_global THEN _visibility_mode := 'global';
  ELSIF _is_sector THEN _visibility_mode := 'sector';
  ELSIF _is_approver THEN _visibility_mode := 'approver';
  ELSIF _is_requester THEN _visibility_mode := 'self';
  ELSE RETURN jsonb_build_object('code', 'AUTH-009', 'message', 'Sem permissão para visualizar esta solicitação.');
  END IF;

  -- ============================================================
  -- 5. RESOLUÇÃO DE PERMISSÕES 
  -- ============================================================
  _perm_approve := (_req.current_approver_user_id = _uid) AND (_req.ended_at IS NULL) AND (_req.status LIKE 'awaiting_step_%' OR _req.status = 'pending');
  _perm_reject  := _perm_approve;
  _perm_return  := _perm_approve AND (_flow.allow_return_for_adjustment = true);
  _perm_edit    := _is_requester AND (_req.status IN ('returned_to_requester', 'pending_resolution'));
  _perm_cancel  := ((_is_requester AND _req.ended_at IS NULL AND _req.status NOT IN ('approved', 'rejected')) OR (_is_global AND _req.ended_at IS NULL AND _req.status != 'approved'));
  _perm_generate_oc  := (_req.ended_at IS NOT NULL AND _req.status = 'approved') AND (_domain_state = 'aprovado') AND (public.has_role(_uid, 'compras') OR _is_global);
  _perm_confirm_pay  := (_req.ended_at IS NOT NULL AND _req.status = 'approved') AND (_domain_state = 'aguardando_pagamento') AND (public.has_role(_uid, 'financeiro') OR _is_global);

  -- [Sprint 2.5] Ações Específicas de Módulo (Lógica transferida do Frontend)
  IF _is_global THEN
    IF p_module_code = 'diaria' AND _domain_state = 'enviado' THEN
      _mod_analyze_travel := true;
    END IF;
    IF p_module_code = 'abastecimento' AND _domain_state = 'aprovado' THEN
      _mod_confirm_fuel := true;
    END IF;
    IF p_module_code = 'abastecimento' AND _domain_state = 'em_revisao_admin' THEN
      _mod_review_admin := true;
    END IF;
  END IF;

  -- Razão de bloqueio
  IF NOT _perm_approve AND _req.ended_at IS NULL THEN
    IF _req.current_approver_user_id != _uid THEN
      SELECT 'Aguardando aprovação de: ' || full_name INTO _reason_blocked FROM public.profiles WHERE id = _req.current_approver_user_id;
    END IF;
  ELSIF _req.ended_at IS NOT NULL THEN
    _reason_blocked := 'Fluxo encerrado com status: ' || _req.status;
  END IF;

  -- ============================================================
  -- 6. RETORNO FINAL
  -- ============================================================
  RETURN jsonb_build_object(
    'is_in_flow', true,
    'status', _req.status,
    'flow', jsonb_build_object(
      'id', _flow.id, 'name', _flow.name, 'current_step', _req.current_step_order, 'total_steps', _total_steps,
      'current_step_name', COALESCE((SELECT name FROM public.approval_flow_steps WHERE id = _step_cfg.id LIMIT 1), 'Etapa ' || _req.current_step_order)
    ),
    'current_approver', CASE WHEN _approver_profile.id IS NOT NULL THEN jsonb_build_object('id', _approver_profile.id, 'name', _approver_profile.name) ELSE NULL END,
    'requester', jsonb_build_object('id', _requester_profile.id, 'name', _requester_profile.name),
    'visibility', jsonb_build_object('mode', _visibility_mode),
    'permissions', jsonb_build_object(
      'approve', _perm_approve, 'reject', _perm_reject, 'return', _perm_return,
      'edit', _perm_edit, 'cancel', _perm_cancel, 'generate_oc', _perm_generate_oc, 'confirm_payment', _perm_confirm_pay,
      'module_actions', jsonb_build_object(
        'analyze_travel', _mod_analyze_travel,
        'confirm_fuel', _mod_confirm_fuel,
        'review_admin', _mod_review_admin
      )
    ),
    'meta', jsonb_build_object('reason_blocked', _reason_blocked, 'last_action_at', _last_action_at)
  );
END;
$$;
