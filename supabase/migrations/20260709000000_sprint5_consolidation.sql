-- ============================================================
-- Sprint 5.0 — Consolidação do Motor de Aprovação
-- Três entregas:
--   1. get_domain_status()     → Motor agnóstico sem SQL dinâmico
--   2. submit_fuel_request()   → Envio atômico (sem RPC encadeada)
--   3. get_approval_context()  → Usa get_domain_status()
--   4. GRANTs corrigidos       → Sprint 3 omitiu o GRANT
-- ============================================================

-- ============================================================
-- 1. get_domain_status()
-- Mapeia module_code → tabela de domínio via CASE.
-- O Motor nunca referencia nomes físicos de tabela.
-- Para adicionar um módulo: acrescentar um WHEN nesta função.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_domain_status(
  p_module_code   text,
  p_reference_id  uuid
)
RETURNS TABLE(domain_status text, domain_requester_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE
    WHEN p_module_code IN ('abastecimento', 'diaria', 'reembolso') THEN
      RETURN QUERY
        SELECT fr.status::text, fr.requester_user_id
        FROM   public.fuel_requests fr
        WHERE  fr.id = p_reference_id
        LIMIT  1;

    WHEN p_module_code = 'admissions' THEN
      RETURN QUERY
        SELECT ar.status::text, ar.requester_user_id
        FROM   public.admission_requests ar
        WHERE  ar.id = p_reference_id
        LIMIT  1;

    -- Sprint 7: adicionar WHEN 'epis' THEN aqui
    -- Sprint N: adicionar WHEN 'compras' THEN aqui

    ELSE
      -- Módulo desconhecido → retorno vazio (Motor trata como sem domínio)
      RETURN;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.get_domain_status(text, uuid) IS
  'Retorna o status e o solicitante do domínio de um módulo, de forma agnóstica. '
  'Para adicionar um módulo: incluir um WHEN nesta função. O Motor não é alterado.';

GRANT EXECUTE ON FUNCTION public.get_domain_status(text, uuid) TO authenticated;


-- ============================================================
-- 2. submit_fuel_request()
-- Envio atômico: valida → cria approval_request + steps →
-- atualiza status → registra histórico → notifica.
-- Nenhuma RPC encadeada. Nenhuma race condition.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_fuel_request(
  p_request_id   uuid,
  p_module_code  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid          uuid := auth.uid();
  _req          RECORD;
  _module       RECORD;
  _flow         RECORD;
  _ar_id        uuid;
  _first_step   RECORD;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. LOCK + VALIDAÇÃO DA SOLICITAÇÃO
  -- ----------------------------------------------------------------
  BEGIN
    SELECT * INTO STRICT _req
    FROM   public.fuel_requests
    WHERE  id = p_request_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada.');
  END;

  -- Apenas rascunho ou retornado podem ser enviados para aprovação
  IF _req.status::text NOT IN ('rascunho', 'retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400','message',
      format('Transição inválida: "%s" não pode ser enviado para aprovação.', _req.status));
  END IF;

  -- Apenas o solicitante pode enviar
  IF _req.requester_user_id != _uid THEN
    RETURN jsonb_build_object('code','ENGINE-403','message',
      'Apenas o solicitante pode enviar esta solicitação para aprovação.');
  END IF;

  -- ----------------------------------------------------------------
  -- 2. VERIFICAR FLUXO DUPLICADO (ENGINE-409)
  -- Impede duplo clique ou chamadas concorrentes criarem dois
  -- approval_requests para a mesma solicitação.
  -- ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM   public.approval_requests
    WHERE  reference_id = p_request_id
      AND  ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-409',
      'message','Já existe um fluxo de aprovação ativo para esta solicitação.');
  END IF;

  -- ----------------------------------------------------------------
  -- 3. LOCALIZAR MÓDULO E FLUXO ATIVO
  -- ----------------------------------------------------------------
  SELECT * INTO _module
  FROM   public.approval_modules
  WHERE  code = p_module_code
  LIMIT  1;

  IF _module IS NULL THEN
    RETURN jsonb_build_object('code','ENGINE-404',
      'message','Módulo de aprovação não configurado: ' || p_module_code);
  END IF;

  SELECT * INTO _flow
  FROM   public.approval_flows
  WHERE  module_id = _module.id
    AND  active    = true
  ORDER  BY created_at DESC
  LIMIT  1;

  IF _flow IS NULL THEN
    RETURN jsonb_build_object('code','ENGINE-404',
      'message','Nenhum fluxo de aprovação ativo para o módulo: ' || p_module_code);
  END IF;

  -- ----------------------------------------------------------------
  -- 4. CRIAR APPROVAL REQUEST
  -- ----------------------------------------------------------------
  INSERT INTO public.approval_requests (
    module_id,
    flow_id,
    reference_id,
    requester_user_id,
    status,
    current_step_order
  ) VALUES (
    _module.id,
    _flow.id,
    p_request_id,
    _uid,
    'awaiting_step_1',
    1
  )
  RETURNING id INTO _ar_id;

  -- ----------------------------------------------------------------
  -- 5. CRIAR APPROVAL REQUEST STEPS (cópia do gabarito do fluxo)
  -- ----------------------------------------------------------------
  INSERT INTO public.approval_request_steps (
    approval_request_id,
    flow_step_id,
    step_order,
    approver_user_id,
    resolved_sector_id,
    status
  )
  SELECT
    _ar_id,
    afs.id,
    afs.step_order,
    afs.approver_user_id,
    afs.sector_id,
    'pending'
  FROM   public.approval_flow_steps afs
  WHERE  afs.flow_id = _flow.id
    AND  afs.active  = true
  ORDER  BY afs.step_order;

  -- ----------------------------------------------------------------
  -- 6. DEFINIR APROVADOR ATUAL (primeira etapa ativa)
  -- ----------------------------------------------------------------
  SELECT * INTO _first_step
  FROM   public.approval_request_steps
  WHERE  approval_request_id = _ar_id
    AND  step_order = 1
  LIMIT  1;

  UPDATE public.approval_requests
  SET    current_approver_user_id = _first_step.approver_user_id
  WHERE  id = _ar_id;

  -- ----------------------------------------------------------------
  -- 7. ATUALIZAR STATUS DO DOMÍNIO
  -- ----------------------------------------------------------------
  UPDATE public.fuel_requests
  SET    status = 'em_aprovacao'::fuel_status
  WHERE  id = p_request_id;

  -- ----------------------------------------------------------------
  -- 8. REGISTRAR HISTÓRICO (approval + status + auditoria)
  -- ----------------------------------------------------------------
  INSERT INTO public.approval_history (
    approval_request_id,
    action,
    action_by,
    step_order,
    old_status,
    new_status
  ) VALUES (
    _ar_id,
    'flow_started',
    _uid,
    1,
    _req.status::text,
    'em_aprovacao'
  );

  INSERT INTO public.status_history (
    module,
    entity_type,
    entity_id,
    from_status,
    to_status,
    changed_by
  ) VALUES (
    'fleet',
    'fuel_requests',
    p_request_id,
    _req.status::text,
    'em_aprovacao',
    _uid
  );

  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    _uid,
    'submit_for_approval',
    'fuel_requests',
    p_request_id::text,
    jsonb_build_object(
      'module',   p_module_code,
      'flow_id',  _flow.id,
      'flow_name', _flow.name
    )
  );

  -- ----------------------------------------------------------------
  -- 9. NOTIFICAR PRIMEIRO APROVADOR
  -- ----------------------------------------------------------------
  IF _flow.notify_next_approver = true AND _first_step.approver_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      _first_step.approver_user_id,
      'Nova solicitação aguardando aprovação',
      'Uma solicitação foi enviada para sua aprovação.',
      jsonb_build_object(
        'entity_type', 'approval_request',
        'entity_id',   _ar_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'approval_request_id', _ar_id,
    'status',              'em_aprovacao'
  );
END;
$$;

COMMENT ON FUNCTION public.submit_fuel_request(uuid, text) IS
  'Envio atômico para aprovação: valida, cria approval_request + steps, '
  'atualiza status do domínio, registra histórico e notifica — em uma única transação. '
  'Protegido contra duplo clique via ENGINE-409.';

GRANT EXECUTE ON FUNCTION public.submit_fuel_request(uuid, text) TO authenticated;


-- ============================================================
-- 3. REESCREVER get_approval_context()
-- Substituir SELECT direto em fuel_requests por get_domain_status().
-- Único ponto alterado: as duas linhas que liam fuel_requests diretamente.
-- Toda a lógica de permissões permanece idêntica ao Sprint 3.
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
  _domain_status    text;
  _domain_requester uuid;
  _reason_blocked   text := NULL;
  _allowed_actions  jsonb := '[]'::jsonb;
BEGIN
  -- ============================================================
  -- 1. LOCALIZAR O APPROVAL REQUEST ATIVO
  -- ============================================================
  SELECT ar.* INTO _req
  FROM public.approval_requests ar
  JOIN public.approval_modules  am ON am.id = ar.module_id
  WHERE ar.reference_id = p_reference_id
    AND ar.ended_at IS NULL
    AND (p_module_code IS NULL OR am.code = p_module_code)
  ORDER BY ar.created_at DESC
  LIMIT 1;

  -- ============================================================
  -- 2. LER ESTADO DO DOMÍNIO via get_domain_status()
  -- Motor é agnóstico: não conhece fuel_requests nem nenhuma tabela de domínio.
  -- ============================================================
  SELECT domain_status, domain_requester_id
    INTO _domain_status, _domain_requester
  FROM public.get_domain_status(COALESCE(p_module_code, ''), p_reference_id);

  -- ============================================================
  -- 3. SEM FLUXO ATIVO — contexto mínimo (rascunho, sem motor)
  -- ============================================================
  IF _req IS NULL THEN
    _is_requester := (_domain_requester = _uid);
    RETURN jsonb_build_object(
      'is_in_flow',        false,
      'status',            COALESCE(_domain_status, 'draft'),
      'flow',              jsonb_build_object('id',null,'name',null,'current_step',0,'total_steps',0,'current_step_name',null),
      'current_approver',  null,
      'requester',         jsonb_build_object('id',null,'name',null),
      'visibility',        jsonb_build_object('mode','self'),
      'permissions',       jsonb_build_object(
        'approve', false, 'reject', false, 'return', false,
        'edit',    _is_requester,
        'cancel',  _is_requester,
        'generate_oc', false, 'confirm_payment', false,
        'allowed_actions', '[]'::jsonb
      ),
      'meta', jsonb_build_object('reason_blocked', null, 'last_action_at', null)
    );
  END IF;

  -- ============================================================
  -- 4. CARREGAR FLUXO E STEP ATUAL
  -- ============================================================
  SELECT af.* INTO _flow FROM public.approval_flows af WHERE af.id = _req.flow_id;
  SELECT afs.* INTO _step_cfg
  FROM public.approval_flow_steps afs
  JOIN public.approval_request_steps ars ON ars.flow_step_id = afs.id
  WHERE ars.approval_request_id = _req.id
    AND ars.step_order = _req.current_step_order
  LIMIT 1;
  SELECT COUNT(*) INTO _total_steps FROM public.approval_flow_steps WHERE flow_id = _req.flow_id AND active = true;

  -- ============================================================
  -- 5. PERFIS
  -- ============================================================
  SELECT id, full_name AS name INTO _requester_profile FROM public.profiles WHERE id = _req.requester_user_id;
  SELECT id, full_name AS name INTO _approver_profile  FROM public.profiles WHERE id = _req.current_approver_user_id;
  SELECT MAX(created_at) INTO _last_action_at FROM public.approval_history WHERE approval_request_id = _req.id;

  -- ============================================================
  -- 6. RESOLUÇÃO DE IDENTIDADE E VISIBILIDADE
  -- ============================================================
  _is_requester := (_req.requester_user_id = _uid);
  _is_approver  := (_req.current_approver_user_id = _uid
    OR EXISTS (SELECT 1 FROM public.approval_request_steps
               WHERE approval_request_id = _req.id AND approver_user_id = _uid));
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

  IF    _is_global    THEN _visibility_mode := 'global';
  ELSIF _is_sector    THEN _visibility_mode := 'sector';
  ELSIF _is_approver  THEN _visibility_mode := 'approver';
  ELSIF _is_requester THEN _visibility_mode := 'self';
  ELSE
    RETURN jsonb_build_object('code', 'AUTH-009', 'message', 'Sem permissão para visualizar esta solicitação.');
  END IF;

  -- ============================================================
  -- 7. PERMISSÕES BASE
  -- ============================================================
  _perm_approve     := (_req.current_approver_user_id = _uid) AND (_req.ended_at IS NULL);
  _perm_reject      := _perm_approve;
  _perm_return      := _perm_approve AND (_flow.allow_return_for_adjustment = true);
  _perm_edit        := _is_requester AND (_req.status IN ('returned_to_requester','pending_resolution'));
  _perm_cancel      := (
    (_is_requester AND _req.ended_at IS NULL AND _req.status NOT IN ('approved','rejected')) OR
    (_is_global    AND _req.ended_at IS NULL AND _req.status != 'approved')
  );
  _perm_generate_oc := (_req.status = 'approved') AND (_domain_status = 'aprovado')
                       AND (public.has_role(_uid, 'compras') OR _is_global);
  _perm_confirm_pay := (_req.status = 'approved') AND (_domain_status = 'aguardando_pagamento')
                       AND (public.has_role(_uid, 'financeiro') OR _is_global);

  -- ============================================================
  -- 8. AÇÕES DE MÓDULO (via module_action_rules — Sprint 3)
  -- ============================================================
  SELECT jsonb_agg(mar.action_name)
    INTO _allowed_actions
  FROM public.module_action_rules mar
  WHERE mar.module_code    = p_module_code
    AND mar.active          = true
    AND mar.required_status = _domain_status
    AND (
      (mar.visibility_mode = 'global'   AND _is_global)   OR
      (mar.visibility_mode = 'approver' AND _is_approver) OR
      (mar.visibility_mode = 'sector'   AND _is_sector)   OR
      (mar.visibility_mode = 'self'     AND _is_requester)
    );

  _allowed_actions := COALESCE(_allowed_actions, '[]'::jsonb);

  -- ============================================================
  -- 9. RAZÃO DE BLOQUEIO
  -- ============================================================
  IF NOT _perm_approve AND _req.ended_at IS NULL AND _req.current_approver_user_id IS NOT NULL THEN
    SELECT 'Aguardando aprovação de: ' || full_name
      INTO _reason_blocked
    FROM public.profiles WHERE id = _req.current_approver_user_id;
  ELSIF _req.ended_at IS NOT NULL THEN
    _reason_blocked := 'Fluxo encerrado com status: ' || _req.status;
  END IF;

  -- ============================================================
  -- 10. RETORNO FINAL
  -- ============================================================
  RETURN jsonb_build_object(
    'is_in_flow',       true,
    'status',           _req.status,
    'flow', jsonb_build_object(
      'id',                _flow.id,
      'name',              _flow.name,
      'current_step',      _req.current_step_order,
      'total_steps',       _total_steps,
      'current_step_name', COALESCE((SELECT name FROM public.approval_flow_steps WHERE id = _step_cfg.id LIMIT 1), 'Etapa ' || _req.current_step_order)
    ),
    'current_approver', CASE
      WHEN _approver_profile.id IS NOT NULL
      THEN jsonb_build_object('id', _approver_profile.id, 'name', _approver_profile.name)
      ELSE NULL END,
    'requester',        jsonb_build_object('id', _requester_profile.id, 'name', _requester_profile.name),
    'visibility',       jsonb_build_object('mode', _visibility_mode),
    'permissions', jsonb_build_object(
      'approve',         _perm_approve,
      'reject',          _perm_reject,
      'return',          _perm_return,
      'edit',            _perm_edit,
      'cancel',          _perm_cancel,
      'generate_oc',     _perm_generate_oc,
      'confirm_payment', _perm_confirm_pay,
      'allowed_actions', _allowed_actions
    ),
    'meta', jsonb_build_object(
      'reason_blocked', _reason_blocked,
      'last_action_at', _last_action_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_approval_context(uuid, text) IS
  'Motor de aprovação canônico. '
  'Usa get_domain_status() para consultar o domínio — agnóstico de tabela. '
  'Retorna permissões determinísticas para o frontend. '
  'Sprint 5: desacoplado de fuel_requests.';

-- ============================================================
-- 4. GRANTs
-- Sprint 3 reescreveu get_approval_context() mas omitiu o GRANT.
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_approval_context(uuid, text) TO authenticated;
