-- ============================================================
-- Sprint 15 — Migration 002: RPCs operacionais de Compras
-- Implementa o ciclo completo pós-aprovação para o módulo Compras.
-- B2 Fix: creates RPCs específicas de purchases (não reutiliza fuel_requests).
-- IDEMPOTENTE via CREATE OR REPLACE.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. cancel_purchase_request()
-- Cancela uma compra. Solicitante pode cancelar antes da 1a aprovação.
-- Master/Diretoria podem cancelar antes de ação financeira irreversível.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_purchase_request(
  p_request_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _is_global boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Compra não encontrada.');
  END;

  _is_global := (
    public.has_role(_uid,'master'::app_role) OR
    public.has_role(_uid,'diretoria'::app_role)
  );

  -- Regras de cancelamento:
  -- Solicitante: apenas antes da 1a aprovação (status rascunho ou em_aprovacao)
  -- Global: até antes de ação financeira irreversível (não após aguardando_pagamento confirmado)
  IF NOT (
    (_req.requester_user_id = _uid AND _req.status IN ('rascunho','em_aprovacao','retornado')) OR
    (_is_global AND _req.status NOT IN ('concluido','cancelado','rejeitado','pago'))
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message',
      format('Não é possível cancelar compra no status "%s".', _req.status));
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Justificativa obrigatória para cancelamento.');
  END IF;

  -- Encerrar fluxo de aprovação ativo se existir
  UPDATE public.approval_requests
    SET ended_at = now(),
        status   = 'cancelled',
        updated_at = now()
    WHERE reference_id = p_request_id AND ended_at IS NULL;

  UPDATE public.purchases
    SET status = 'cancelado',
        updated_at = now()
    WHERE id = p_request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras', 'purchases', p_request_id, _req.status, 'cancelado', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'cancel', 'purchases', p_request_id::text,
    jsonb_build_object('reason', p_reason, 'from_status', _req.status));

  -- Notificar solicitante (se cancelado por outro)
  IF _req.requester_user_id <> _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      'Compra cancelada',
      'Sua solicitação de compra foi cancelada. Motivo: ' || p_reason,
      jsonb_build_object('entity_type','purchases','entity_id',p_request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'cancelado');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_request(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. advance_purchase_to_oc()
-- Etapa pós-aprovação: Compras registra OC e informa fornecedor/valor final.
-- Ator: perfil compras, financeiro, ou global.
-- Status: aprovado → aguardando_pagamento
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_purchase_to_oc(
  p_request_id     uuid,
  p_oc_number      text,
  p_supplier       text,
  p_approved_value numeric,
  p_notes          text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_delivery_date  date DEFAULT NULL,
  p_tracking_code  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  -- Verificar permissão
  IF NOT (
    public.has_role(_uid,'compras'::app_role) OR
    public.has_role(_uid,'financeiro'::app_role) OR
    public.has_role(_uid,'diretoria'::app_role) OR
    public.has_role(_uid,'administrativo'::app_role) OR
    public.has_role(_uid,'master'::app_role)
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para gerar OC.');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Compra não encontrada.');
  END;

  IF _req.status <> 'aprovado' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message',
      format('OC somente pode ser gerada com status "aprovado". Status atual: "%s".', _req.status));
  END IF;

  IF p_oc_number IS NULL OR trim(p_oc_number) = '' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Número da OC obrigatório.');
  END IF;

  IF p_approved_value IS NULL OR p_approved_value < 0 THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Valor final inválido.');
  END IF;

  UPDATE public.purchases SET
    status           = 'aguardando_pagamento',
    purchase_number  = p_oc_number,
    supplier         = p_supplier,
    approved_value   = p_approved_value,
    purchase_notes   = COALESCE(p_notes, purchase_notes),
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    delivery_date    = COALESCE(p_delivery_date, delivery_date),
    tracking_code    = COALESCE(p_tracking_code, tracking_code),
    updated_at       = now()
  WHERE id = p_request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras','purchases', p_request_id, 'aprovado', 'aguardando_pagamento', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'generate_oc', 'purchases', p_request_id::text,
    jsonb_build_object('oc_number', p_oc_number, 'supplier', p_supplier, 'approved_value', p_approved_value));

  -- Notificar solicitante
  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (_req.requester_user_id,
    'Compra: OC gerada',
    format('Ordem de Compra %s gerada. Fornecedor: %s. Valor: R$ %s', p_oc_number, p_supplier, p_approved_value),
    jsonb_build_object('entity_type','purchases','entity_id',p_request_id));

  RETURN jsonb_build_object('success', true, 'status', 'aguardando_pagamento', 'oc_number', p_oc_number);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_purchase_to_oc(uuid, text, text, numeric, text, text, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.advance_purchase_to_oc(uuid, text, text, numeric, text, text, date, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. confirm_purchase_payment()
-- Financeiro confirma que o pagamento foi realizado.
-- Status: aguardando_pagamento → aguardando_entrega
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_purchase_payment(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  IF NOT (
    public.has_role(_uid,'financeiro'::app_role) OR
    public.has_role(_uid,'compras'::app_role) OR
    public.has_role(_uid,'diretoria'::app_role) OR
    public.has_role(_uid,'master'::app_role)
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para confirmar pagamento.');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Compra não encontrada.');
  END;

  IF _req.status <> 'aguardando_pagamento' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message',
      format('Pagamento somente pode ser confirmado com status "aguardando_pagamento". Status atual: "%s".', _req.status));
  END IF;

  UPDATE public.purchases SET
    status        = 'aguardando_entrega',
    purchase_notes = COALESCE(p_notes, purchase_notes),
    updated_at    = now()
  WHERE id = p_request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras','purchases', p_request_id, 'aguardando_pagamento', 'aguardando_entrega', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'confirm_payment', 'purchases', p_request_id::text,
    jsonb_build_object('notes', p_notes));

  -- Notificar solicitante
  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (_req.requester_user_id,
    'Compra: Pagamento confirmado',
    'O pagamento da sua compra foi confirmado. Aguardando entrega.',
    jsonb_build_object('entity_type','purchases','entity_id',p_request_id));

  RETURN jsonb_build_object('success', true, 'status', 'aguardando_entrega');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_purchase_payment(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_payment(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. confirm_purchase_delivery()
-- Compras/Financeiro registra que a entrega foi realizada.
-- Status: aguardando_entrega → entregue
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_purchase_delivery(
  p_request_id      uuid,
  p_delivery_address text DEFAULT NULL,
  p_delivery_date    date DEFAULT NULL,
  p_notes            text DEFAULT NULL,
  p_tracking_code    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  IF NOT (
    public.has_role(_uid,'compras'::app_role) OR
    public.has_role(_uid,'financeiro'::app_role) OR
    public.has_role(_uid,'diretoria'::app_role) OR
    public.has_role(_uid,'administrativo'::app_role) OR
    public.has_role(_uid,'master'::app_role)
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para confirmar entrega.');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Compra não encontrada.');
  END;

  IF _req.status <> 'aguardando_entrega' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message',
      format('Entrega somente pode ser confirmada com status "aguardando_entrega". Status atual: "%s".', _req.status));
  END IF;

  UPDATE public.purchases SET
    status           = 'entregue',
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    delivery_date    = COALESCE(p_delivery_date, delivery_date),
    tracking_code    = COALESCE(p_tracking_code, tracking_code),
    purchase_notes   = COALESCE(p_notes, purchase_notes),
    updated_at       = now()
  WHERE id = p_request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras','purchases', p_request_id, 'aguardando_entrega', 'entregue', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'confirm_delivery', 'purchases', p_request_id::text,
    jsonb_build_object('delivery_address', p_delivery_address, 'delivery_date', p_delivery_date));

  -- Notificar solicitante para confirmar recebimento
  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (_req.requester_user_id,
    'Compra: Item entregue',
    'Seu pedido foi entregue. Por favor confirme o recebimento.',
    jsonb_build_object('entity_type','purchases','entity_id',p_request_id));

  RETURN jsonb_build_object('success', true, 'status', 'entregue');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_purchase_delivery(uuid, text, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_delivery(uuid, text, date, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. confirm_purchase_receipt()
-- Solicitante confirma o recebimento correto.
-- Status: entregue → concluido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_purchase_receipt(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Compra não encontrada.');
  END;

  -- Apenas solicitante ou global pode confirmar recebimento
  IF NOT (
    _req.requester_user_id = _uid OR
    public.has_role(_uid,'compras'::app_role) OR
    public.has_role(_uid,'financeiro'::app_role) OR
    public.has_role(_uid,'diretoria'::app_role) OR
    public.has_role(_uid,'administrativo'::app_role) OR
    public.has_role(_uid,'master'::app_role)
  ) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para confirmar recebimento.');
  END IF;

  IF _req.status <> 'entregue' THEN
    RETURN jsonb_build_object('code','ENGINE-400','message',
      format('Recebimento somente pode ser confirmado com status "entregue". Status atual: "%s".', _req.status));
  END IF;

  UPDATE public.purchases SET
    status         = 'concluido',
    confirmed_at   = now(),
    confirmed_by   = _uid,
    purchase_notes = COALESCE(p_notes, purchase_notes),
    updated_at     = now()
  WHERE id = p_request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('compras','purchases', p_request_id, 'entregue', 'concluido', _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'confirm_receipt', 'purchases', p_request_id::text,
    jsonb_build_object('notes', p_notes, 'confirmed_at', now()::text));

  RETURN jsonb_build_object('success', true, 'status', 'concluido');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_purchase_receipt(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_receipt(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. Atualizar module_action_rules para o ciclo completo de Compras
-- ────────────────────────────────────────────────────────────
INSERT INTO public.module_action_rules (module_code, action_name, required_status, visibility_mode) VALUES
  ('compras', 'edit',             'rascunho',            'self'),
  ('compras', 'edit',             'retornado',           'self'),
  ('compras', 'cancel',           'rascunho',            'self'),
  ('compras', 'cancel',           'em_aprovacao',        'self'),
  ('compras', 'cancel',           'retornado',           'self'),
  ('compras', 'cancel',           'rascunho',            'global'),
  ('compras', 'cancel',           'em_aprovacao',        'global'),
  ('compras', 'generate_oc',      'aprovado',            'global'),
  ('compras', 'confirm_payment',  'aguardando_pagamento','global'),
  ('compras', 'confirm_delivery', 'aguardando_entrega',  'global'),
  ('compras', 'confirm_receipt',  'entregue',            'self'),
  ('compras', 'confirm_receipt',  'entregue',            'global')
ON CONFLICT (module_code, action_name, required_status, visibility_mode) DO NOTHING;
