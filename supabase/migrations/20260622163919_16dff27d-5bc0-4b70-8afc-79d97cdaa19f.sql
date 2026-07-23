-- ============================================================
-- 1) process_approval_action: 'return' no longer ends the flow.
--    Keeps current step PENDING and preserves the approver so
--    the requester can fix and re-submit at the same step.
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
    RETURN jsonb_build_object('error','Ação inválida');
  END IF;

  SELECT * INTO _req FROM approval_requests WHERE id = p_approval_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Solicitação não encontrada'); END IF;
  IF _req.ended_at IS NOT NULL THEN RETURN jsonb_build_object('error','Fluxo já encerrado'); END IF;
  IF _req.current_approver_user_id != _uid THEN
    RETURN jsonb_build_object('error','Você não é o aprovador da etapa atual');
  END IF;

  SELECT * INTO _flow FROM approval_flows WHERE id = _req.flow_id;
  _old := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments)='') THEN
      RETURN jsonb_build_object('error','É obrigatório informar o motivo da recusa');
    END IF;
    _new := 'rejected';
    UPDATE approval_request_steps SET status='rejected', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN
      RETURN jsonb_build_object('error','Este fluxo não permite devolução');
    END IF;
    IF p_comments IS NULL OR trim(p_comments)='' THEN
      RETURN jsonb_build_object('error','É obrigatório informar o motivo da devolução');
    END IF;

    IF COALESCE(_flow.return_mode,'requester') = 'previous_step' THEN
      SELECT * INTO _prev FROM approval_request_steps
        WHERE approval_request_id=p_approval_request_id AND step_order < _req.current_step_order
        ORDER BY step_order DESC LIMIT 1;
      IF _prev.id IS NOT NULL THEN
        -- Reset both current and previous step to pending; comment goes on current step
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
        -- No previous step: behave as 'requester' mode
        _new := 'returned_to_requester';
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        -- KEEP current_approver_user_id so the flow resumes here when re-submitted
        UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
      END IF;
    ELSE
      -- requester mode: flow does NOT end. Current step goes back to pending.
      _new := 'returned_to_requester';
      UPDATE approval_request_steps SET status='pending', action_at=NULL
        WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
      -- KEEP current_approver_user_id so re-submit resumes on the same approver
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

  -- Atomic sync with fuel_requests for fleet modules
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
-- 2) fuel_set_status: atomic reviewer assignment + flow resume on re-submit
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

  -- HARD LOCK: cannot bypass approval engine for approve/return/reject
  IF _to_status IN ('aprovado'::fuel_status, 'retornado'::fuel_status, 'reprovado'::fuel_status) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.approval_requests
      WHERE reference_id = _request_id AND ended_at IS NULL
    ) INTO _has_active_approval;

    IF _has_active_approval THEN
      RETURN jsonb_build_object('error',
        'Esta solicitação possui fluxo de aprovação ativo. Use o motor de aprovação para aprovar, recusar ou devolver.');
    END IF;

    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  -- Other permission checks
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

  -- =========================================================
  -- ATOMIC: assign reviewer when moving to 'enviado'
  -- =========================================================
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

    -- Resume any approval_request that was returned to the requester
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
      -- Also flip fuel_request to em_aprovacao so it leaves 'enviado'
      UPDATE public.fuel_requests
        SET status = 'em_aprovacao'::fuel_status
        WHERE id = _request_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _request_id, _to_status::text, 'em_aprovacao', _uid);
    END IF;
  END IF;

  -- Track review metadata
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

  IF _to_status IN ('aprovado', 'retornado', 'reprovado', 'concluido', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid,
      CASE
        WHEN _to_status IN ('aprovado', 'concluido') THEN 'approved'::review_decision
        WHEN _to_status = 'retornado' THEN 'needs_revision'::review_decision
        ELSE 'rejected'::review_decision
      END, _reason);
  END IF;

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id, 'Solicitação atualizada',
      format('Sua solicitação foi movida para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  IF _to_status = 'enviado' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id, 'Nova solicitação recebida',
      format('Nova solicitação de %s aguardando encaminhamento', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur
    WHERE ur.role IN ('diretoria', 'administrativo') AND ur.user_id != _uid;
  END IF;

  IF _to_status = 'em_aprovacao' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id, 'Solicitação aguardando aprovação',
      format('Solicitação de %s encaminhada para sua aprovação', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur WHERE ur.role = 'diretoria' AND ur.user_id != _uid;
  END IF;

  IF _to_status = 'em_revisao_admin' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id, 'Fotos enviadas para revisão',
      'Colaborador enviou hodômetro e nota fiscal para conferência',
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur
    WHERE ur.role IN ('diretoria', 'administrativo') AND ur.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;

-- ============================================================
-- 3) start_approval_flow: clearer error message for null manager
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code text,
  p_reference_id uuid,
  p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _approver_rule text;
  _requester_sector uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
  _err_hint text;
BEGIN
  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active LIMIT 1;
  IF _module_id IS NULL THEN RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado'); END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE module_id = _module_id AND active
    ORDER BY updated_at DESC, created_at DESC LIMIT 1;
  IF _flow.id IS NULL THEN RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  SELECT sector_id INTO _requester_sector FROM public.profiles WHERE id = p_requester_user_id;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (_module_id, _flow.id, p_reference_id, p_requester_user_id, 'pending_resolution')
  RETURNING id INTO _request_id;

  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    _resolved_sector_id := NULL;
    _approver_rule := COALESCE(_step.approver_type, 'usuario_fixo');

    CASE _approver_rule
      WHEN 'usuario_fixo' THEN _resolved_user_id := _step.approver_user_id;
      WHEN 'responsavel_do_setor_do_solicitante' THEN
        IF _requester_sector IS NOT NULL THEN
          SELECT responsible_user_id INTO _resolved_user_id FROM public.sectors
            WHERE id = _requester_sector AND active LIMIT 1;
          _resolved_sector_id := _requester_sector;
        END IF;
      WHEN 'responsavel_do_setor_especifico' THEN
        IF _step.fixed_sector_id IS NOT NULL THEN
          SELECT responsible_user_id INTO _resolved_user_id FROM public.sectors
            WHERE id = _step.fixed_sector_id AND active LIMIT 1;
          _resolved_sector_id := _step.fixed_sector_id;
        END IF;
      WHEN 'gestor_imediato' THEN
        SELECT manager_user_id INTO _resolved_user_id FROM public.profiles WHERE id = p_requester_user_id LIMIT 1;
      ELSE _resolved_user_id := _step.approver_user_id;
    END CASE;

    IF _resolved_user_id IS NULL THEN
      DELETE FROM public.approval_request_steps WHERE approval_request_id = _request_id;
      DELETE FROM public.approval_requests WHERE id = _request_id;

      _err_hint := CASE _approver_rule
        WHEN 'gestor_imediato' THEN 'O solicitante não possui gestor imediato cadastrado. Cadastre o gestor no perfil em Permissões > Usuários.'
        WHEN 'responsavel_do_setor_do_solicitante' THEN 'O setor do solicitante não possui responsável ativo. Defina em Setores.'
        WHEN 'responsavel_do_setor_especifico' THEN 'O setor configurado para esta etapa não possui responsável ativo.'
        WHEN 'usuario_fixo' THEN 'A etapa fixa não tem usuário configurado.'
        ELSE 'Aprovador da etapa não pôde ser resolvido.'
      END;

      RETURN jsonb_build_object('error',
        format('Etapa %s do fluxo (%s): %s', _step.step_order, _approver_rule, _err_hint));
    END IF;

    INSERT INTO public.approval_request_steps (
      approval_request_id, flow_step_id, step_order,
      approver_user_id, approver_rule, resolved_sector_id, resolved_from_user_id
    ) VALUES (
      _request_id, _step.id, _step.step_order,
      _resolved_user_id, _approver_rule, _resolved_sector_id,
      CASE WHEN _approver_rule <> 'usuario_fixo' THEN p_requester_user_id ELSE NULL END
    );

    IF _first_approver IS NULL THEN
      _first_approver := _resolved_user_id;
      _first_order := _step.step_order;
    END IF;
  END LOOP;

  IF _first_approver IS NULL OR _first_order IS NULL THEN
    DELETE FROM public.approval_request_steps WHERE approval_request_id = _request_id;
    DELETE FROM public.approval_requests WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'Fluxo sem aprovador inicial resolvido');
  END IF;

  UPDATE public.approval_requests
    SET current_step_order = _first_order,
        current_approver_user_id = _first_approver,
        status = 'awaiting_step_' || _first_order
    WHERE id = _request_id;

  INSERT INTO public.approval_history (approval_request_id, action, action_by, step_order, new_status)
    VALUES (_request_id, 'flow_started', p_requester_user_id, _first_order, 'awaiting_step_' || _first_order);

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_first_approver, 'Nova aprovação pendente',
      'Você tem uma nova solicitação aguardando sua aprovação',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id, 'module', p_module_code));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$$;