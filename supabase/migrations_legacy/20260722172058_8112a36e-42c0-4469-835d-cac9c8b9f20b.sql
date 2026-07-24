
-- 1) Reenvio com retomada de fluxo devolvido (paridade com fuel_set_status)
CREATE OR REPLACE FUNCTION public.submit_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow_res jsonb;
  _pending_return RECORD;
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
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.requester_user_id <> _uid THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Apenas o solicitante pode enviar');
  END IF;

  IF _req.status NOT IN ('rascunho','retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400',
      'message', format('Transição inválida a partir do status "%s"', _req.status));
  END IF;

  -- Se existe fluxo devolvido ao solicitante, retomá-lo em vez de criar novo
  SELECT id, current_step_order, current_approver_user_id
    INTO _pending_return
    FROM public.approval_requests
    WHERE reference_id = p_request_id
      AND ended_at IS NULL
      AND status = 'returned_to_requester'
    ORDER BY created_at DESC LIMIT 1;

  IF _pending_return.id IS NOT NULL THEN
    UPDATE public.approval_requests
      SET status = 'awaiting_step_' || _pending_return.current_step_order
      WHERE id = _pending_return.id;

    UPDATE public.purchases
      SET status = 'em_aprovacao',
          approval_request_id = _pending_return.id
      WHERE id = p_request_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (_uid, 'resubmit_after_return', 'purchases', p_request_id::text,
        jsonb_build_object('approval_request_id', _pending_return.id,
                           'resumed_step', _pending_return.current_step_order));

    IF _pending_return.current_approver_user_id IS NOT NULL
       AND _pending_return.current_approver_user_id <> _uid THEN
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (_pending_return.current_approver_user_id,
        'Solicitação reenviada para sua aprovação',
        'Um solicitante corrigiu e reenviou uma solicitação de compra.',
        jsonb_build_object('entity_type','approval_request','entity_id',_pending_return.id));
    END IF;

    RETURN jsonb_build_object('success', true,
      'approval_request_id', _pending_return.id,
      'status', 'em_aprovacao',
      'resumed', true);
  END IF;

  -- Guard: não iniciar novo fluxo se já existir um ativo
  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_request_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('code','ENGINE-409','message','Já existe fluxo ativo');
  END IF;

  _flow_res := public.start_approval_flow('compras', p_request_id, _uid);

  IF _flow_res ? 'error' THEN
    RETURN jsonb_build_object('code','ENGINE-500','message', _flow_res->>'error');
  END IF;

  UPDATE public.purchases
    SET status = 'em_aprovacao',
        approval_request_id = (_flow_res->>'approval_request_id')::uuid
    WHERE id = p_request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'submit_for_approval', 'purchases', p_request_id::text,
    jsonb_build_object('approval_request_id', _flow_res->>'approval_request_id'));

  RETURN jsonb_build_object('success', true,
    'approval_request_id', _flow_res->>'approval_request_id',
    'status', 'em_aprovacao');
END;
$function$;

-- 2) Cancelamento oficial via RPC (fecha fluxo, gera histórico e notifica aprovador atual)
CREATE OR REPLACE FUNCTION public.cancel_purchase_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _active RECORD;
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
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.requester_user_id <> _uid
     AND NOT (has_role(_uid,'diretoria'::app_role)
              OR has_role(_uid,'administrativo'::app_role)
              OR has_role(_uid,'master'::app_role)) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para cancelar');
  END IF;

  IF _req.status NOT IN ('rascunho','retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400',
      'message', format('Não é possível cancelar a partir do status "%s"', _req.status));
  END IF;

  -- Encerrar qualquer fluxo ativo remanescente
  FOR _active IN
    SELECT id, current_approver_user_id
      FROM public.approval_requests
      WHERE reference_id = p_request_id AND ended_at IS NULL
  LOOP
    UPDATE public.approval_requests
      SET status = 'canceled', ended_at = now()
      WHERE id = _active.id;

    INSERT INTO public.approval_history
      (approval_request_id, action, action_by, comments, old_status, new_status)
    VALUES
      (_active.id, 'cancel', _uid, p_reason, 'returned_to_requester', 'canceled');

    IF _active.current_approver_user_id IS NOT NULL
       AND _active.current_approver_user_id <> _uid THEN
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (_active.current_approver_user_id,
        'Solicitação cancelada',
        'O solicitante cancelou a solicitação de compra.',
        jsonb_build_object('entity_type','approval_request','entity_id',_active.id));
    END IF;
  END LOOP;

  UPDATE public.purchases
    SET status = 'cancelado',
        approval_request_id = NULL
    WHERE id = p_request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'cancel', 'purchases', p_request_id::text,
    jsonb_build_object('from', _req.status, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'cancelado');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_purchase_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_purchase_request(uuid) TO authenticated;
