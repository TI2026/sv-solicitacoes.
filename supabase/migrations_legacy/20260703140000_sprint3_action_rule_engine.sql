-- ============================================================
-- Sprint 3.0 — Action Rule Engine
-- Elimina todo IF module_code do get_approval_context().
-- O Motor passa a ser zero-acoplado a módulos.
-- ============================================================

-- 1. TABELA module_action_rules
-- Cada linha é uma regra: "neste módulo, neste estado de domínio,
-- neste nível de visibilidade, o usuário pode executar esta ação."
CREATE TABLE IF NOT EXISTS public.module_action_rules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code      text        NOT NULL,
  action_name      text        NOT NULL,
  required_status  text        NOT NULL, -- estado na tabela de domínio (ex: 'aprovado', 'enviado')
  visibility_mode  text        NOT NULL CHECK (visibility_mode IN ('self','approver','sector','global')),
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_code, action_name, required_status, visibility_mode)
);

COMMENT ON TABLE  public.module_action_rules IS 'Regras de ações específicas de módulo. O Motor consulta esta tabela em vez de conter IFs por módulo.';
COMMENT ON COLUMN public.module_action_rules.module_code     IS 'Código do módulo (ex: fleet/abastecimento, fleet/diaria, admissions).';
COMMENT ON COLUMN public.module_action_rules.action_name     IS 'Nome semântico da ação (ex: confirm_fuel, analyze_travel, approve_admission).';
COMMENT ON COLUMN public.module_action_rules.required_status IS 'Status do domínio (coluna status da tabela de domínio) necessário para a regra ser ativa.';
COMMENT ON COLUMN public.module_action_rules.visibility_mode IS 'Nível mínimo de visibilidade do usuário para a ação ser permitida.';

-- RLS: apenas roles privilegiados podem gerenciar regras; leitura via SECURITY DEFINER da função.
ALTER TABLE public.module_action_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_action_rules: global read via RPC"
  ON public.module_action_rules FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "module_action_rules: admin manage"
  ON public.module_action_rules FOR ALL
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- ============================================================
-- 2. SEEDS — Regras iniciais (Fleet)
-- Migração das regras que estavam hardcoded no get_approval_context()
-- ============================================================

INSERT INTO public.module_action_rules (module_code, action_name, required_status, visibility_mode) VALUES
  -- Abastecimento: admin confirma recarga após aprovação
  ('abastecimento', 'confirm_fuel',   'aprovado',       'global'),
  -- Abastecimento: admin abre revisão final
  ('abastecimento', 'review_admin',   'em_revisao_admin', 'global'),
  -- Diária: admin analisa proposta enviada
  ('diaria',        'analyze_travel', 'enviado',        'global'),
  -- Reembolso: nenhuma ação extra além das permissões base
  -- (gerado pelo mesmo motor de aprovação, sem ações específicas neste momento)
  -- Admissions: placeholder (seeds reais virão com a migração de Admissions)
  ('admissions',    'approve_admission',  'em_analise', 'global'),
  ('admissions',    'finalize_admission', 'aprovado',   'global')
ON CONFLICT (module_code, action_name, required_status, visibility_mode) DO NOTHING;

-- ============================================================
-- 3. REESCRITA DE get_approval_context()
-- Motor zero-acoplado: consulta module_action_rules via SELECT.
-- Nenhum IF module_code no código.
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

  -- Estado atual da tabela de domínio (fuel_requests por ora)
  SELECT status, requester_user_id
    INTO _domain_status, _domain_requester
  FROM public.fuel_requests
  WHERE id = p_reference_id
  LIMIT 1;

  -- ============================================================
  -- 2. SEM FLUXO ATIVO — contexto mínimo (rascunho, sem motor)
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
  -- 3. CARREGAR FLUXO E STEP ATUAL
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
  -- 4. PERFIS
  -- ============================================================
  SELECT id, full_name AS name INTO _requester_profile FROM public.profiles WHERE id = _req.requester_user_id;
  SELECT id, full_name AS name INTO _approver_profile  FROM public.profiles WHERE id = _req.current_approver_user_id;
  SELECT MAX(created_at) INTO _last_action_at FROM public.approval_history WHERE approval_request_id = _req.id;

  -- ============================================================
  -- 5. RESOLUÇÃO DE IDENTIDADE E VISIBILIDADE
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
  -- 6. PERMISSÕES BASE (aprovação, edição, cancelamento, OC, pag.)
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
  -- 7. RESOLUÇÃO DE AÇÕES DE MÓDULO (ZERO IF de módulo no Motor)
  -- O Motor consulta module_action_rules via SELECT.
  -- Nenhum IF module_code aqui — o Motor não sabe o que é Fleet,
  -- Admissions ou qualquer outro módulo.
  -- ============================================================
  SELECT jsonb_agg(mar.action_name)
    INTO _allowed_actions
  FROM public.module_action_rules mar
  WHERE mar.module_code  = p_module_code
    AND mar.active        = true
    AND mar.required_status = _domain_status
    AND (
      (mar.visibility_mode = 'global'   AND _is_global)   OR
      (mar.visibility_mode = 'approver' AND _is_approver) OR
      (mar.visibility_mode = 'sector'   AND _is_sector)   OR
      (mar.visibility_mode = 'self'     AND _is_requester)
    );

  -- Garantir array vazio em vez de null
  _allowed_actions := COALESCE(_allowed_actions, '[]'::jsonb);

  -- ============================================================
  -- 8. RAZÃO DE BLOQUEIO
  -- ============================================================
  IF NOT _perm_approve AND _req.ended_at IS NULL AND _req.current_approver_user_id IS NOT NULL THEN
    SELECT 'Aguardando aprovação de: ' || full_name
      INTO _reason_blocked
    FROM public.profiles WHERE id = _req.current_approver_user_id;
  ELSIF _req.ended_at IS NOT NULL THEN
    _reason_blocked := 'Fluxo encerrado com status: ' || _req.status;
  END IF;

  -- ============================================================
  -- 9. RETORNO FINAL
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
      -- [Sprint 3.0] Ações dinâmicas por módulo — string[] em vez de objeto fixo
      -- O Motor não sabe o que cada string significa. O React interpreta.
      'allowed_actions', _allowed_actions
    ),
    'meta', jsonb_build_object(
      'reason_blocked', _reason_blocked,
      'last_action_at', _last_action_at
    )
  );
END;
$$;
