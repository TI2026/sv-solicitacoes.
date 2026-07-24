
-- Sprint 13.9 · Frente 1: Motor de Aprovação (backend)

CREATE OR REPLACE FUNCTION public.start_approval_flow(p_module_code text, p_reference_id uuid, p_requester_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
  _uid uuid := auth.uid();
  _resolved_count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;
  IF _uid <> p_requester_user_id
     AND NOT (has_role(_uid,'diretoria'::app_role)
              OR has_role(_uid,'administrativo'::app_role)
              OR has_role(_uid,'master'::app_role)
              OR has_role(_uid,'rh'::app_role)) THEN
    RETURN jsonb_build_object('error', 'Não autorizado a iniciar fluxo em nome de outro usuário');
  END IF;

  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_reference_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('error', 'Já existe um fluxo de aprovação ativo para esta solicitação');
  END IF;

  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active LIMIT 1;
  IF _module_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado');
  END IF;

  SELECT * INTO _flow FROM public.approval_flows
    WHERE module_id = _module_id AND active
    ORDER BY updated_at DESC, created_at DESC LIMIT 1;
  IF _flow.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo');
  END IF;

  -- Guard defensivo: fluxo ativo precisa realmente pertencer ao módulo solicitado
  IF _flow.module_id IS DISTINCT FROM _module_id THEN
    RETURN jsonb_build_object('error', 'Fluxo ativo não pertence ao módulo solicitado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  -- Pré-validação: percorrer etapas e confirmar que ao menos uma resolve aprovador ativo
  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    CASE _step.approver_type
      WHEN 'specific_user' THEN
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
        END IF;
      ELSE
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      _resolved_count := _resolved_count + 1;
    END IF;
  END LOOP;

  IF _resolved_count = 0 THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovador resolvível para o solicitante');
  END IF;

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

    CASE _step.approver_type
      WHEN 'specific_user' THEN
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _step.sector_id;
        END IF;
      ELSE
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      INSERT INTO public.approval_request_steps (
        approval_request_id, flow_step_id, step_order, approver_user_id,
        is_required, status, timeout_hours
      ) VALUES (
        _request_id, _step.id, _step.step_order, _resolved_user_id,
        _step.is_required, 'pending', _step.timeout_hours
      );
      IF _first_approver IS NULL THEN
        _first_approver := _resolved_user_id;
        _first_order := _step.step_order;
      END IF;
    END IF;
  END LOOP;

  IF _first_approver IS NULL THEN
    DELETE FROM public.approval_requests WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'Nenhum aprovador válido encontrado');
  END IF;

  UPDATE public.approval_requests
    SET status = 'awaiting_step_' || _first_order,
        current_step_order = _first_order,
        current_approver_user_id = _first_approver
    WHERE id = _request_id;

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_first_approver, 'Nova aprovação pendente', 'Uma solicitação aguarda sua aprovação.',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.process_approval_action(p_approval_request_id uuid, p_action text, p_comments text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Histórico sempre gravado
  INSERT INTO approval_history (approval_request_id,action,action_by,step_order,comments,old_status,new_status)
  VALUES (p_approval_request_id,p_action,_uid,_req.current_step_order,p_comments,_old,_new);

  INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details)
  VALUES (_uid,'approval_'||p_action,'approval_request',p_approval_request_id::text,
    jsonb_build_object('old_status',_old,'new_status',_new,'comments',p_comments));

  -- Notificação ao solicitante SEMPRE (independente de notify_next_approver)
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
      jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id,'action',p_action,'comments',p_comments));
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
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE fuel_requests SET status = 'retornado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'compras' THEN
    IF _new = 'approved' THEN
      UPDATE purchases SET status = 'aprovado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE purchases SET status = 'rejeitado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'rejeitado', _uid);
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE purchases SET status = 'retornado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'admissions' THEN
    IF _new = 'approved' THEN
      UPDATE admission_requests SET status = 'registros_concluidos'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'registros_concluidos', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE admission_requests SET status = 'cancelado'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'cancelado', _uid);
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE admission_requests SET status = 'rascunho'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'rascunho', _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'status',_new);
END;
$function$;
