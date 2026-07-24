CREATE OR REPLACE FUNCTION public.fuel_set_status(_request_id uuid, _to_status fuel_status, _reason text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
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
  _has_active_approval boolean := false;
  _sector_id uuid;
  _reviewer uuid;
  _pending_return RECORD;
BEGIN
  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Solicitação não encontrada'); END IF;

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

  IF _to_status IN ('aprovado'::fuel_status, 'retornado'::fuel_status, 'reprovado'::fuel_status) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.approval_requests
      WHERE reference_id = _request_id AND ended_at IS NULL
    ) INTO _has_active_approval;

    IF _has_active_approval THEN
      RETURN jsonb_build_object('error',
        'Esta solicitação possui fluxo de aprovação ativo. Use o motor de aprovação para aprovar, recusar ou devolver.');
    END IF;

    RETURN jsonb_build_object('error',
      'Não é possível aprovar, recusar ou devolver diretamente. Inicie o fluxo de aprovação para esta solicitação.');
  END IF;

  -- Validação de permissões por transição
  IF _to_status IN ('enviado') THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode enviar');
    END IF;
  ELSIF _to_status IN ('em_aprovacao', 'em_revisao') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status = 'aguardando_pagamento' THEN
    -- Compras (além de admin/diretoria/master) pode registrar OC
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'compras')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para registrar OC');
    END IF;
  ELSIF _to_status = 'pago' THEN
    -- Financeiro (além de admin/diretoria/master) pode confirmar pagamento
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'financeiro')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para registrar pagamento');
    END IF;
  ELSIF _to_status IN ('aguardando_oc', 'concluido', 'encerrado') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      IF _req.requester_user_id != _uid THEN
        RETURN jsonb_build_object('error', 'Sem permissão para esta ação');
      END IF;
    END IF;
  ELSIF _to_status = 'ativa' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  IF _to_status = 'enviado' THEN
    SELECT sector_id INTO _sector_id FROM public.profiles WHERE id = _req.requester_user_id;
    IF _sector_id IS NOT NULL THEN
      SELECT responsible_user_id INTO _reviewer
        FROM public.sectors WHERE id = _sector_id AND active = true LIMIT 1;
      IF _reviewer IS NOT NULL THEN
        UPDATE public.fuel_requests
          SET assigned_to_user_id = _reviewer
          WHERE id = _request_id;
      END IF;
    END IF;

    SELECT id, current_step_order INTO _pending_return
      FROM public.approval_requests
      WHERE reference_id = _request_id
        AND ended_at IS NULL
        AND status = 'returned_to_requester'
      ORDER BY created_at DESC LIMIT 1;
    IF _pending_return.id IS NOT NULL THEN
      UPDATE public.approval_requests
        SET status = 'awaiting_step_' || _pending_return.current_step_order
        WHERE id = _pending_return.id;
      UPDATE public.fuel_requests
        SET status = 'em_aprovacao'::fuel_status
        WHERE id = _request_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _request_id, _to_status::text, 'em_aprovacao', _uid);
    END IF;
  END IF;

  IF _to_status = 'em_revisao' AND _metadata ? 'review_notes' THEN
    UPDATE public.fuel_requests SET reviewed_by = _uid, reviewed_at = now(), review_notes = _metadata->>'review_notes' WHERE id = _request_id;
  END IF;
  IF _to_status = 'aguardando_pagamento' AND (_metadata ? 'oc_number' OR _metadata ? 'oc_notes') THEN
    UPDATE public.fuel_requests SET oc_number = COALESCE(_metadata->>'oc_number', oc_number), oc_notes = COALESCE(_metadata->>'oc_notes', oc_notes), oc_uploaded_by = _uid, oc_uploaded_at = now() WHERE id = _request_id;
  END IF;
  IF _to_status = 'pago' THEN
    UPDATE public.fuel_requests SET paid_at = now(), paid_by = _uid, payment_notes = COALESCE(_metadata->>'payment_notes', payment_notes), payment_due_date = CASE WHEN _metadata ? 'payment_due_date' THEN (_metadata->>'payment_due_date')::date ELSE payment_due_date END WHERE id = _request_id;
  END IF;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES ('fleet', 'fuel_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'status_change', 'fuel_requests', _request_id::text,
      jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason, 'type', _req.type) || _metadata);

  IF _to_status IN ('concluido', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid, 'approved'::review_decision, _reason);
  END IF;

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id, 'Solicitação atualizada',
      format('Sua solicitação foi movida para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  -- Notificação de novas solicitações enviadas (apenas user_role_assignments — sem legado)
  IF _to_status = 'enviado' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Nova solicitação recebida',
      format('Nova solicitação de %s aguardando encaminhamento', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE)
      AND ura.user_id != _uid;
  END IF;

  -- IMPORTANTE: bloco duplicado de notificação para 'em_aprovacao' REMOVIDO.
  -- O aprovador correto da etapa é notificado pelo start_approval_flow / process_approval_action.

  IF _to_status = 'em_revisao_admin' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Fotos enviadas para revisão',
      'Colaborador enviou hodômetro e nota fiscal para conferência',
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE)
      AND ura.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$function$;