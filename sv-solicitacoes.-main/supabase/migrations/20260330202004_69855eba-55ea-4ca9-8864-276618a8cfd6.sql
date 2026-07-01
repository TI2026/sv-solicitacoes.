
-- 1. Add new fuel_status enum values for diária complete flow
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'em_revisao';
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'aguardando_oc';
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'aguardando_pagamento';
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'pago';

-- 2. Add OC/payment tracking columns to fuel_requests
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS oc_number text,
  ADD COLUMN IF NOT EXISTS oc_notes text,
  ADD COLUMN IF NOT EXISTS oc_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS oc_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS paid_by uuid;

-- 3. Update fuel_set_status to support new diária flow
CREATE OR REPLACE FUNCTION public.fuel_set_status(
  _request_id uuid,
  _to_status fuel_status,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed jsonb;
  _valid_targets jsonb;
BEGIN
  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  IF _req.type = 'diaria' THEN
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_revisao"],
      "em_revisao":["em_aprovacao","retornado"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["aguardando_oc"],
      "aguardando_oc":["aguardando_pagamento"],
      "aguardando_pagamento":["pago"],
      "pago":["concluido"],
      "reprovado":["encerrado"],
      "ativa":["encerrado","em_revisao"]
    }'::jsonb;
  ELSIF _req.type = 'reembolso' THEN
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_aprovacao"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["concluido"],
      "reprovado":["encerrado"]
    }'::jsonb;
  ELSE
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_aprovacao"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["aguardando_fotos"],
      "aguardando_fotos":["em_revisao_admin"],
      "em_revisao_admin":["concluido","retornado"],
      "reprovado":["encerrado"]
    }'::jsonb;
  END IF;

  _valid_targets := _allowed -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  -- Permission checks
  IF _to_status IN ('enviado') THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode enviar');
    END IF;
  ELSIF _to_status IN ('em_aprovacao', 'em_revisao') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  ELSIF _to_status IN ('aprovado', 'retornado', 'reprovado') AND _req.status = 'em_aprovacao' THEN
    IF NOT has_role(_uid, 'diretoria') THEN
      RETURN jsonb_build_object('error', 'Apenas diretoria pode aprovar/reprovar');
    END IF;
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status IN ('aguardando_oc', 'aguardando_pagamento', 'pago', 'concluido', 'encerrado') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      IF _req.requester_user_id != _uid THEN
        RETURN jsonb_build_object('error', 'Sem permissão para concluir');
      END IF;
    END IF;
  ELSIF _to_status = 'ativa' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  -- Track review metadata
  IF _to_status = 'em_revisao' AND _metadata ? 'review_notes' THEN
    UPDATE public.fuel_requests SET reviewed_by = _uid, reviewed_at = now(), review_notes = _metadata->>'review_notes' WHERE id = _request_id;
  END IF;

  -- Track OC metadata
  IF _to_status = 'aguardando_pagamento' AND (_metadata ? 'oc_number' OR _metadata ? 'oc_notes') THEN
    UPDATE public.fuel_requests SET oc_number = COALESCE(_metadata->>'oc_number', oc_number), oc_notes = COALESCE(_metadata->>'oc_notes', oc_notes), oc_uploaded_by = _uid, oc_uploaded_at = now() WHERE id = _request_id;
  END IF;

  -- Track payment metadata
  IF _to_status = 'pago' THEN
    UPDATE public.fuel_requests SET paid_at = now(), paid_by = _uid, payment_notes = COALESCE(_metadata->>'payment_notes', payment_notes), payment_due_date = CASE WHEN _metadata ? 'payment_due_date' THEN (_metadata->>'payment_due_date')::date ELSE payment_due_date END WHERE id = _request_id;
  END IF;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('fleet', 'fuel_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'fuel_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason, 'type', _req.type) || _metadata);

  IF _to_status IN ('aprovado', 'retornado', 'reprovado', 'concluido', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid,
      CASE
        WHEN _to_status IN ('aprovado', 'concluido') THEN 'approved'::review_decision
        WHEN _to_status = 'retornado' THEN 'needs_revision'::review_decision
        ELSE 'rejected'::review_decision
      END,
      _reason);
  END IF;

  -- Notify requester when someone else changes status
  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      'Solicitação atualizada',
      format('Sua solicitação foi movida para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  -- Notify admins+directors when a new request is submitted (enviado)
  IF _to_status = 'enviado' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id,
      'Nova solicitação recebida',
      format('Nova solicitação de %s aguardando encaminhamento', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur
    WHERE ur.role IN ('diretoria', 'administrativo')
      AND ur.user_id != _uid;
  END IF;

  -- Notify directors when forwarded for approval (em_aprovacao)
  IF _to_status = 'em_aprovacao' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id,
      'Solicitação aguardando aprovação',
      format('Solicitação de %s encaminhada para sua aprovação', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur
    WHERE ur.role = 'diretoria'
      AND ur.user_id != _uid;
  END IF;

  -- Notify admins when photos submitted for review
  IF _to_status = 'em_revisao_admin' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id,
      'Fotos enviadas para revisão',
      'Colaborador enviou hodômetro e nota fiscal para conferência',
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur
    WHERE ur.role IN ('diretoria', 'administrativo')
      AND ur.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$function$;
