-- ============================================================
-- Sprint 1: Blindagem (Segurança e Concorrência)
-- ============================================================

-- ============================================================
-- 1) Hardening process_approval_action
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_approval_action(
  p_approval_request_id uuid,
  p_action text,
  p_comments text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow RECORD;
  _next RECORD;
  _prev RECORD;
  _old text;
  _new text;
  _module_code text;
BEGIN
  IF p_action NOT IN ('approve','reject','return') THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Ação inválida');
  END IF;

  -- Lock pessimista com NOWAIT para concorrência
  BEGIN
    SELECT * INTO STRICT _req FROM approval_requests WHERE id = p_approval_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.ended_at IS NOT NULL THEN 
    RETURN jsonb_build_object('code','ENGINE-403','message','Fluxo já encerrado'); 
  END IF;
  
  IF _req.current_approver_user_id != _uid THEN
    RETURN jsonb_build_object('code','AUTH-009','message','Você não é o aprovador da etapa atual');
  END IF;

  SELECT * INTO _flow FROM approval_flows WHERE id = _req.flow_id;
  _old := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments)='') THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da recusa');
    END IF;
    _new := 'rejected';
    UPDATE approval_request_steps SET status='rejected', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN
      RETURN jsonb_build_object('code','ENGINE-403','message','Este fluxo não permite devolução');
    END IF;
    IF p_comments IS NULL OR trim(p_comments)='' THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da devolução');
    END IF;

    IF COALESCE(_flow.return_mode,'requester') = 'previous_step' THEN
      SELECT * INTO _prev FROM approval_request_steps
        WHERE approval_request_id=p_approval_request_id AND step_order < _req.current_step_order
        ORDER BY step_order DESC LIMIT 1;
      IF _prev.id IS NOT NULL THEN
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_request_steps SET status='pending', action_at=NULL, comments=NULL
          WHERE id=_prev.id;
        _new := 'awaiting_step_'||_prev.step_order;
        UPDATE approval_requests
          SET current_step_order=_prev.step_order,
              current_approver_user_id=_prev.approver_user_id,
              status=_new
          WHERE id=p_approval_request_id;
        IF _flow.notify_next_approver THEN
          INSERT INTO notifications (user_id,title,message,metadata)
          VALUES (_prev.approver_user_id,'Solicitação devolvida para reanálise',
            COALESCE('Motivo: '||p_comments,'Devolvida'),
            jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
        END IF;
      ELSE
        _new := 'returned_to_requester';
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
      END IF;
    ELSE
      _new := 'returned_to_requester';
      UPDATE approval_request_steps SET status='pending', action_at=NULL
        WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
      UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
    END IF;

  ELSIF p_action = 'approve' THEN
    UPDATE approval_request_steps SET status='approved', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    SELECT * INTO _next FROM approval_request_steps
      WHERE approval_request_id=p_approval_request_id
        AND step_order > _req.current_step_order AND status='pending'
      ORDER BY step_order LIMIT 1;
    IF _next.id IS NOT NULL THEN
      _new := 'awaiting_step_'||_next.step_order;
      UPDATE approval_requests
        SET current_step_order=_next.step_order,
            current_approver_user_id=_next.approver_user_id,
            status=_new
        WHERE id=p_approval_request_id;
      IF _flow.notify_next_approver THEN
        INSERT INTO notifications (user_id,title,message,metadata)
        VALUES (_next.approver_user_id,'Nova aprovação pendente',
          'Solicitação aguardando sua aprovação',
          jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
      END IF;
    ELSE
      _new := 'approved';
      UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;
    END IF;
  END IF;

  INSERT INTO approval_history (approval_request_id,action,action_by,step_order,comments,old_status,new_status)
  VALUES (p_approval_request_id,p_action,_uid,_req.current_step_order,p_comments,_old,_new);

  INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details)
  VALUES (_uid,'approval_'||p_action,'approval_request',p_approval_request_id::text,
    jsonb_build_object('old_status',_old,'new_status',_new,'comments',p_comments));

  IF _req.requester_user_id != _uid THEN
    INSERT INTO notifications (user_id,title,message,metadata) VALUES (_req.requester_user_id,
      CASE p_action
        WHEN 'approve' THEN CASE WHEN _new='approved' THEN 'Solicitação aprovada' ELSE 'Etapa aprovada' END
        WHEN 'reject' THEN 'Solicitação recusada'
        WHEN 'return' THEN 'Solicitação devolvida para correção'
      END,
      CASE p_action
        WHEN 'approve' THEN 'Sua solicitação avançou no fluxo'
        WHEN 'reject' THEN COALESCE('Motivo: '||p_comments,'Recusada')
        WHEN 'return' THEN COALESCE('Motivo: '||p_comments||' — corrija e reenvie para retomar o fluxo','Devolvida para correção')
      END,
      jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
  END IF;

  SELECT am.code INTO _module_code FROM approval_modules am WHERE am.id = _req.module_id;

  IF _module_code IN ('abastecimento', 'reembolso', 'diaria') THEN
    IF _new = 'approved' THEN
      UPDATE fuel_requests SET status = 'aprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE fuel_requests SET status = 'reprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'reprovado', _uid);
    ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN
      UPDATE fuel_requests SET status = 'retornado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'status',_new);
END;
$$;


-- ============================================================
-- 2) Hardening fuel_set_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.fuel_set_status(
  _request_id uuid,
  _to_status public.fuel_status,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed jsonb;
  _valid_targets jsonb;
  _sector_id uuid;
  _reviewer uuid;
  _pending_return RECORD;
BEGIN
  BEGIN
    SELECT * INTO STRICT _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

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
    RETURN jsonb_build_object('code', 'ENGINE-400', 'message', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  -- HARDENING: Proibir Bypass Estrutural do Motor
  IF _to_status IN ('aprovado'::fuel_status, 'retornado'::fuel_status, 'reprovado'::fuel_status) THEN
    RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Ação não permitida para o estado atual do fluxo. Utilize o Approval Engine para esta transição.');
  END IF;

  IF _to_status IN ('enviado') THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Apenas o solicitante pode enviar');
    END IF;
  ELSIF _to_status IN ('em_aprovacao', 'em_revisao') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Sem permissão');
    END IF;
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status = 'aguardando_pagamento' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'compras')) THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Sem permissão para registrar OC');
    END IF;
  ELSIF _to_status = 'pago' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'financeiro')) THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Sem permissão para registrar pagamento');
    END IF;
  ELSIF _to_status IN ('aguardando_oc', 'concluido', 'encerrado') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      IF _req.requester_user_id != _uid THEN
        RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Sem permissão para esta ação');
      END IF;
    END IF;
  ELSIF _to_status = 'ativa' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('code', 'ENGINE-403', 'message', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  IF _to_status = 'enviado' THEN
    SELECT sector_id INTO _sector_id FROM public.profiles WHERE id = _req.requester_user_id;
    IF _sector_id IS NOT NULL THEN
      SELECT responsible_user_id INTO _reviewer
        FROM public.sectors WHERE id = _sector_id AND active = true LIMIT 1;
      IF _reviewer IS NOT NULL THEN
        UPDATE public.fuel_requests SET assigned_to_user_id = _reviewer WHERE id = _request_id;
      END IF;
    END IF;

    SELECT id, current_step_order INTO _pending_return
      FROM public.approval_requests
      WHERE reference_id = _request_id AND ended_at IS NULL AND status = 'returned_to_requester'
      ORDER BY created_at DESC LIMIT 1;
    IF _pending_return.id IS NOT NULL THEN
      UPDATE public.approval_requests SET status = 'awaiting_step_' || _pending_return.current_step_order WHERE id = _pending_return.id;
      UPDATE public.fuel_requests SET status = 'em_aprovacao'::fuel_status WHERE id = _request_id;
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
      jsonb_build_object('from', _req.status, 'to', _to_status, 'type', _req.type) || _metadata);

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

  IF _to_status = 'enviado' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Nova solicitação recebida',
      format('Nova solicitação de %s aguardando encaminhamento', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE) AND ura.user_id != _uid;
  END IF;

  IF _to_status = 'em_revisao_admin' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Fotos enviadas para revisão',
      'Colaborador enviou hodômetro e nota fiscal para conferência',
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE) AND ura.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;


-- ============================================================
-- 3) Restore register_oc_and_advance (garantir sua existência)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_oc_and_advance(
  _request_id uuid,
  _oc_number text,
  _oc_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res1 jsonb;
  _res2 jsonb;
BEGIN
  IF _oc_number IS NULL OR trim(_oc_number) = '' THEN
    RETURN jsonb_build_object('code', 'ENGINE-400', 'message', 'Número da OC é obrigatório');
  END IF;

  _res1 := public.fuel_set_status(_request_id, 'aguardando_oc'::fuel_status, NULL, '{}'::jsonb);
  IF _res1 ? 'code' AND _res1->>'code' != '200' THEN
    RETURN _res1;
  ELSIF _res1 ? 'error' THEN
    RETURN jsonb_build_object('code', 'ENGINE-400', 'message', _res1->>'error');
  END IF;

  _res2 := public.fuel_set_status(_request_id, 'aguardando_pagamento'::fuel_status, NULL, 
    jsonb_build_object(
      'oc_number', trim(_oc_number), 
      'oc_notes', CASE WHEN _oc_notes IS NOT NULL AND trim(_oc_notes) != '' THEN trim(_oc_notes) ELSE NULL END
    )
  );
  IF _res2 ? 'code' AND _res2->>'code' != '200' THEN
    RETURN _res2;
  ELSIF _res2 ? 'error' THEN
    RETURN jsonb_build_object('code', 'ENGINE-400', 'message', _res2->>'error');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'aguardando_pagamento');
END;
$$;


-- ============================================================
-- 4) Fechamento de RLS (approval_requests)
-- ============================================================

-- Remover policy vulnerável
DROP POLICY IF EXISTS "System manages approval_requests" ON public.approval_requests;

-- Certificar-se que a policy de leitura está correta (Já estava, apenas reforçando)
DROP POLICY IF EXISTS "View relevant approval_requests" ON public.approval_requests;
CREATE POLICY "View relevant approval_requests" ON public.approval_requests 
FOR SELECT TO authenticated
USING (
  requester_user_id = auth.uid() OR 
  current_approver_user_id = auth.uid() OR 
  has_role(auth.uid(), 'diretoria') OR 
  has_role(auth.uid(), 'administrativo')
);

-- (Os updates ocorrem exclusivamente pelas RPCs SECURITY DEFINER criadas acima)
