-- ============================================================
-- Sprint 8 — Módulo de Compras (MVP)
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA PRINCIPAL DE COMPRAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id),
  supplier text,
  category text NOT NULL,
  description text NOT NULL,
  justification text,
  cost_center text,
  priority text NOT NULL DEFAULT 'normal',
  estimated_value numeric(12,2) NOT NULL DEFAULT 0,
  approved_value numeric(12,2),
  purchase_number text,
  status text NOT NULL DEFAULT 'rascunho',
  approval_request_id uuid REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Usuários podem ver suas próprias compras"
  ON public.purchases FOR SELECT
  USING (auth.uid() = requester_user_id);

CREATE POLICY "Aprovadores e global podem ver todas as compras"
  ON public.purchases FOR SELECT
  USING (
    public.has_role(auth.uid(), 'diretoria') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'financeiro') OR
    public.has_role(auth.uid(), 'compras') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'master')
  );

CREATE POLICY "Usuários podem criar compras"
  ON public.purchases FOR INSERT
  WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "Apenas solicitante pode editar rascunhos ou retornados"
  ON public.purchases FOR UPDATE
  USING (
    auth.uid() = requester_user_id 
    AND status IN ('rascunho', 'retornado')
  )
  WITH CHECK (
    auth.uid() = requester_user_id 
    AND status IN ('rascunho', 'retornado')
  );

CREATE POLICY "Global pode editar qualquer compra"
  ON public.purchases FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'diretoria') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'financeiro') OR
    public.has_role(auth.uid(), 'compras') OR
    public.has_role(auth.uid(), 'master')
  );

-- ------------------------------------------------------------
-- 2. REGISTRO DO MÓDULO E REGRAS
-- ------------------------------------------------------------
INSERT INTO public.approval_modules (code, name) 
VALUES ('compras', 'Compras')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.module_action_rules (module_code, action_name, required_status, visibility_mode) VALUES
  ('compras', 'edit', 'rascunho', 'self'),
  ('compras', 'edit', 'retornado', 'self'),
  ('compras', 'generate_oc', 'aprovado', 'global'),
  ('compras', 'confirm_payment', 'aguardando_pagamento', 'global')
ON CONFLICT (module_code, action_name, required_status, visibility_mode) DO NOTHING;

-- ------------------------------------------------------------
-- 3. ATUALIZAÇÃO DO get_domain_status()
-- ------------------------------------------------------------
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

    WHEN p_module_code = 'compras' THEN
      RETURN QUERY
        SELECT c.status::text, c.requester_user_id
        FROM   public.purchases c
        WHERE  c.id = p_reference_id
        LIMIT  1;

    ELSE
      -- Módulo desconhecido → retorno vazio
      RETURN;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_domain_status(text, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. FUNÇÃO ATÔMICA submit_purchase_request()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_purchase_request(
  p_request_id   uuid
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
  -- 1. LOCK + VALIDAÇÃO DA SOLICITAÇÃO
  BEGIN
    SELECT * INTO STRICT _req
    FROM   public.purchases
    WHERE  id = p_request_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação de compra não encontrada.');
  END;

  IF _req.status NOT IN ('rascunho', 'retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400','message', format('Transição inválida: "%s" não pode ser enviado para aprovação.', _req.status));
  END IF;

  IF _req.requester_user_id != _uid THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Apenas o solicitante pode enviar esta solicitação.');
  END IF;

  -- 2. VERIFICAR FLUXO DUPLICADO
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE reference_id = p_request_id AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-409', 'message','Já existe um fluxo de aprovação ativo.');
  END IF;

  -- 3. LOCALIZAR MÓDULO E FLUXO ATIVO
  SELECT * INTO _module FROM public.approval_modules WHERE code = 'compras' LIMIT 1;
  IF _module IS NULL THEN
    RETURN jsonb_build_object('code','ENGINE-404', 'message','Módulo de compras não configurado.');
  END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE module_id = _module.id AND active = true ORDER BY created_at DESC LIMIT 1;
  IF _flow IS NULL THEN
    RETURN jsonb_build_object('code','ENGINE-404', 'message','Nenhum fluxo de aprovação ativo para compras.');
  END IF;

  -- 4. CRIAR APPROVAL REQUEST
  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status, current_step_order)
  VALUES (_module.id, _flow.id, p_request_id, _uid, 'awaiting_step_1', 1)
  RETURNING id INTO _ar_id;

  -- Atualizar FK em purchases
  UPDATE public.purchases SET approval_request_id = _ar_id WHERE id = p_request_id;

  -- 5. CRIAR APPROVAL REQUEST STEPS
  INSERT INTO public.approval_request_steps (approval_request_id, flow_step_id, step_order, approver_user_id, resolved_sector_id, status)
  SELECT _ar_id, afs.id, afs.step_order, afs.approver_user_id, afs.sector_id, 'pending'
  FROM public.approval_flow_steps afs
  WHERE afs.flow_id = _flow.id AND afs.active = true
  ORDER BY afs.step_order;

  -- 6. DEFINIR APROVADOR ATUAL
  SELECT * INTO _first_step FROM public.approval_request_steps WHERE approval_request_id = _ar_id AND step_order = 1 LIMIT 1;
  
  UPDATE public.approval_requests
  SET current_approver_user_id = _first_step.approver_user_id
  WHERE id = _ar_id;

  -- 7. ATUALIZAR STATUS DO DOMÍNIO
  UPDATE public.purchases SET status = 'em_aprovacao' WHERE id = p_request_id;

  -- 8. REGISTRAR HISTÓRICO
  INSERT INTO public.approval_history (approval_request_id, action, action_by, step_order, old_status, new_status)
  VALUES (_ar_id, 'flow_started', _uid, 1, _req.status, 'em_aprovacao');

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras', 'purchases', p_request_id, _req.status, 'em_aprovacao', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'submit_for_approval', 'purchases', p_request_id::text, jsonb_build_object('flow_id', _flow.id));

  -- 9. NOTIFICAR PRIMEIRO APROVADOR
  IF _flow.notify_next_approver = true AND _first_step.approver_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      _first_step.approver_user_id,
      'Nova Compra aguardando aprovação',
      'Uma nova solicitação de compra precisa de sua aprovação.',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _ar_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _ar_id, 'status', 'em_aprovacao');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_purchase_request(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5. ATUALIZAÇÃO DO get_dashboard_metrics()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_fuel_total INT;
  v_fuel_pendentes INT;
  v_fuel_aprovados INT;
  v_fuel_valor_total NUMERIC;
  v_fuel_aguardando_oc INT;
  v_fuel_aguardando_pagamento INT;
  v_fuel_em_revisao_admin INT;
  v_fuel_by_status JSONB;
  v_fuel_by_type JSONB;

  v_adm_total INT;
  v_adm_em_andamento INT;
  v_adm_aguardando_registros INT;
  v_adm_active_cost NUMERIC;
  v_adm_by_status JSONB;

  v_purchases_total INT;
  v_purchases_abertas INT;
  v_purchases_aprovadas INT;
  v_purchases_valor_total NUMERIC;

  v_result JSONB;
BEGIN
  -- 1. Agregações para fuel_requests
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('aprovado', 'reprovado', 'encerrado', 'concluido')),
    COUNT(id) FILTER (WHERE status IN ('encerrado', 'aprovado', 'concluido')),
    COALESCE(SUM(valor), 0),
    COUNT(id) FILTER (WHERE status = 'aguardando_oc'),
    COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
    COUNT(id) FILTER (WHERE status = 'em_revisao_admin')
  INTO 
    v_fuel_total, v_fuel_pendentes, v_fuel_aprovados, v_fuel_valor_total, 
    v_fuel_aguardando_oc, v_fuel_aguardando_pagamento, v_fuel_em_revisao_admin
  FROM fuel_requests 
  WHERE deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY status
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', type, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_type
  FROM (
    SELECT COALESCE(type, 'abastecimento') as type, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY COALESCE(type, 'abastecimento')
  ) t;

  -- 2. Agregações para admission_requests
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('concluido', 'cancelado')),
    COUNT(id) FILTER (WHERE status = 'registros_concluidos'),
    COALESCE(SUM(salario_previsto) FILTER (WHERE status NOT IN ('concluido', 'cancelado')), 0)
  INTO 
    v_adm_total, v_adm_em_andamento, v_adm_aguardando_registros, v_adm_active_cost
  FROM admission_requests;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_adm_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM admission_requests 
    GROUP BY status
  ) sa;

  -- 3. Agregações para purchases
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('aprovado', 'cancelado', 'rejeitado', 'rascunho')),
    COUNT(id) FILTER (WHERE status = 'aprovado'),
    COALESCE(SUM(estimated_value) FILTER (WHERE status NOT IN ('cancelado', 'rejeitado')), 0)
  INTO 
    v_purchases_total, v_purchases_abertas, v_purchases_aprovadas, v_purchases_valor_total
  FROM purchases;

  -- 4. Constrói o JSON final
  v_result := jsonb_build_object(
    'fuel', jsonb_build_object(
      'total', v_fuel_total,
      'pendentes', v_fuel_pendentes,
      'aprovados', v_fuel_aprovados,
      'valor_total', v_fuel_valor_total,
      'aguardando_oc', v_fuel_aguardando_oc,
      'aguardando_pagamento', v_fuel_aguardando_pagamento,
      'em_revisao_admin', v_fuel_em_revisao_admin,
      'by_status', v_fuel_by_status,
      'by_type', v_fuel_by_type
    ),
    'admission', jsonb_build_object(
      'total', v_adm_total,
      'em_andamento', v_adm_em_andamento,
      'aguardando_registros', v_adm_aguardando_registros,
      'active_cost', v_adm_active_cost,
      'by_status', v_adm_by_status
    ),
    'purchase', jsonb_build_object(
      'total', v_purchases_total,
      'abertas', v_purchases_abertas,
      'aprovadas', v_purchases_aprovadas,
      'valor_total', v_purchases_valor_total
    )
  );

  RETURN v_result;
END;
$$;
