-- ============================================================
-- Sprint 2.0 — get_approval_context()
-- Contrato Canônico: Uma função, um resultado determinístico.
-- Frontend NÃO interpreta. Apenas renderiza o JSON retornado.
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
  _reason_blocked   text := NULL;
  _domain_state     text;
BEGIN
  -- ============================================================
  -- 1. LOCALIZAR O APPROVAL REQUEST ATIVO
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

  -- Se não existe fluxo ativo, retorna contexto mínimo (request pode estar em rascunho)
  IF _req IS NULL THEN
    -- Ler o domínio para checar se o usuário é o solicitante
    SELECT requester_user_id INTO _is_requester
      FROM public.fuel_requests WHERE id = p_reference_id LIMIT 1;

    RETURN jsonb_build_object(
      'is_in_flow', false,
      'status', 'draft',
      'flow', jsonb_build_object('id', null, 'name', null, 'current_step', 0, 'total_steps', 0, 'current_step_name', null),
      'current_approver', null,
      'requester', jsonb_build_object('id', null, 'name', null),
      'visibility', jsonb_build_object('mode', 'self'),
      'permissions', jsonb_build_object(
        'approve', false, 'reject', false, 'return', false,
        'edit', true,   -- pode editar rascunho
        'cancel', true, -- pode cancelar rascunho
        'generate_oc', false, 'confirm_payment', false
      ),
      'meta', jsonb_build_object('reason_blocked', null, 'last_action_at', null)
    );
  END IF;

  -- ============================================================
  -- 2. CARREGAR GABARITO DO FLUXO E STEP ATUAL
  -- ============================================================
  SELECT af.*
    INTO _flow
  FROM public.approval_flows af
  WHERE af.id = _req.flow_id;

  -- Step de configuração (gabarito)
  SELECT afs.*
    INTO _step_cfg
  FROM public.approval_flow_steps afs
  JOIN public.approval_request_steps ars ON ars.flow_step_id = afs.id
  WHERE ars.approval_request_id = _req.id
    AND ars.step_order = _req.current_step_order
  LIMIT 1;

  -- Total de etapas do fluxo
  SELECT COUNT(*) INTO _total_steps
  FROM public.approval_flow_steps
  WHERE flow_id = _req.flow_id AND active = true;

  -- ============================================================
  -- 3. PERFIS (solicitante e aprovador atual)
  -- ============================================================
  SELECT id, full_name AS name
    INTO _requester_profile
  FROM public.profiles WHERE id = _req.requester_user_id;

  SELECT id, full_name AS name
    INTO _approver_profile
  FROM public.profiles WHERE id = _req.current_approver_user_id;

  -- Última ação registrada
  SELECT MAX(created_at) INTO _last_action_at
  FROM public.approval_history
  WHERE approval_request_id = _req.id;

  -- ============================================================
  -- 4. RESOLUÇÃO DE VISIBILIDADE (camadas cumulativas)
  -- ============================================================
  _is_requester := (_req.requester_user_id = _uid);
  _is_approver  := (
    _req.current_approver_user_id = _uid
    OR EXISTS (
      SELECT 1 FROM public.approval_request_steps
      WHERE approval_request_id = _req.id AND approver_user_id = _uid
    )
  );
  _is_sector    := EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.approval_request_steps ars ON ars.resolved_sector_id = p.sector_id
    WHERE p.id = _uid AND ars.approval_request_id = _req.id
  );
  _is_global    := (
    public.has_role(_uid, 'diretoria') OR
    public.has_role(_uid, 'administrativo') OR
    public.has_role(_uid, 'master')
  );

  -- Modo de visibilidade: prioridade do mais restrito ao mais amplo
  IF _is_global THEN
    _visibility_mode := 'global';
  ELSIF _is_sector THEN
    _visibility_mode := 'sector';
  ELSIF _is_approver THEN
    _visibility_mode := 'approver';
  ELSIF _is_requester THEN
    _visibility_mode := 'self';
  ELSE
    -- Sem permissão de visibilidade → retorna contexto vazio por segurança
    RETURN jsonb_build_object('code', 'AUTH-009', 'message', 'Sem permissão para visualizar esta solicitação.');
  END IF;

  -- ============================================================
  -- 5. RESOLUÇÃO DE PERMISSÕES (funções puras)
  -- ============================================================
  -- Ações do Motor: somente o current_approver ativo
  _perm_approve := (_req.current_approver_user_id = _uid) AND (_req.ended_at IS NULL) AND (_req.status LIKE 'awaiting_step_%' OR _req.status = 'pending');
  _perm_reject  := _perm_approve;
  _perm_return  := _perm_approve AND (_flow.allow_return_for_adjustment = true);

  -- Editar: somente solicitante em estados iniciais
  _perm_edit := _is_requester AND (_req.status IN ('returned_to_requester', 'pending_resolution'));

  -- Cancelar: solicitante pré-aprovação, ou global em status não aprovado
  _perm_cancel := (
    (_is_requester AND _req.ended_at IS NULL AND _req.status NOT IN ('approved', 'rejected'))
    OR (_is_global AND _req.ended_at IS NULL AND _req.status != 'approved')
  );

  -- Ações de Domínio: dependem do estado do fluxo (aprovado) + estado do domínio
  SELECT status INTO _domain_state
  FROM public.fuel_requests WHERE id = p_reference_id LIMIT 1;

  _perm_generate_oc  := (_req.ended_at IS NOT NULL AND _req.status = 'approved') AND (_domain_state = 'aprovado');
  _perm_confirm_pay  := (_req.ended_at IS NOT NULL AND _req.status = 'approved') AND (_domain_state = 'aguardando_pagamento');

  -- Razão de bloqueio para debug no frontend
  IF NOT _perm_approve AND _req.ended_at IS NULL THEN
    IF _req.current_approver_user_id != _uid THEN
      SELECT 'Aguardando aprovação de: ' || full_name INTO _reason_blocked
      FROM public.profiles WHERE id = _req.current_approver_user_id;
    END IF;
  ELSIF _req.ended_at IS NOT NULL THEN
    _reason_blocked := 'Fluxo encerrado com status: ' || _req.status;
  END IF;

  -- ============================================================
  -- 6. RETORNO FINAL (Contrato Canônico)
  -- ============================================================
  RETURN jsonb_build_object(
    'is_in_flow', true,
    'status', _req.status,

    'flow', jsonb_build_object(
      'id',               _flow.id,
      'name',             _flow.name,
      'current_step',     _req.current_step_order,
      'total_steps',      _total_steps,
      'current_step_name', COALESCE(
        (SELECT name FROM public.approval_flow_steps WHERE id = _step_cfg.id LIMIT 1),
        'Etapa ' || _req.current_step_order
      )
    ),

    'current_approver', CASE
      WHEN _approver_profile.id IS NOT NULL THEN
        jsonb_build_object('id', _approver_profile.id, 'name', _approver_profile.name)
      ELSE NULL
    END,

    'requester', jsonb_build_object(
      'id',   _requester_profile.id,
      'name', _requester_profile.name
    ),

    'visibility', jsonb_build_object(
      'mode', _visibility_mode
    ),

    'permissions', jsonb_build_object(
      'approve',          _perm_approve,
      'reject',           _perm_reject,
      'return',           _perm_return,
      'edit',             _perm_edit,
      'cancel',           _perm_cancel,
      'generate_oc',      _perm_generate_oc,
      'confirm_payment',  _perm_confirm_pay
    ),

    'meta', jsonb_build_object(
      'reason_blocked', _reason_blocked,
      'last_action_at', _last_action_at
    )
  );
END;
$$;

-- Permissão de execução: qualquer usuário autenticado chama a função.
-- A segurança é feita internamente (retorna erro ou contexto vazio sem permissão).
GRANT EXECUTE ON FUNCTION public.get_approval_context(uuid, text) TO authenticated;

-- === ROLLBACK ===
-- DROP FUNCTION IF EXISTS public.get_approval_context(uuid, text);
