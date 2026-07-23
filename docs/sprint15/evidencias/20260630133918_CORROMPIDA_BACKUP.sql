-- [P1-03] Correção: UNIQUE INDEX para garantir consistência no banco
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_one_active_per_reference
  ON public.approval_requests(reference_id)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code text, p_reference_id uuid, p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _resolved_role_key text;
  _approver_rule text;
  _requester_sector uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
  _err_hint text;
  _is_active boolean;
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
    _resolved_role_key := NULL;
    _approver_rule := COALESCE(_step.approver_type, 'usuario_fixo');

    CASE _approver_rule
      WHEN 'usuario_fixo' THEN
        _resolved_user_id := _step.approver_user_id;

      WHEN 'responsavel_do_setor_do_solicitante' THEN
        IF _requester_sector IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _requester_sector AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _requester_sector AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _requester_sector;
        END IF;

      WHEN 'responsavel_do_setor_especifico' THEN
        IF _step.fixed_sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.fixed_sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.fixed_sector_id AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _step.fixed_sector_id;
        END IF;

      WHEN 'gestor_imediato' THEN
        SELECT mp.id INTO _resolved_user_id
          FROM public.profiles p
          JOIN public.profiles mp ON mp.id = p.manager_user_id AND COALESCE(mp.active,true)
          WHERE p.id = p_requester_user_id LIMIT 1;

      WHEN 'cargo_perfil' THEN
        -- cargo + MESMO SETOR DO SOLICITANTE, apenas usuários ativos
        IF _step.approver_role_key IS NOT NULL AND _requester_sector IS NOT NULL THEN
          SELECT ura.user_id INTO _resolved_user_id
            FROM public.user_role_assignments ura
            JOIN public.roles r ON r.id = ura.role_id AND r.key = _step.approver_role_key
            JOIN public.profiles p ON p.id = ura.user_id
              AND COALESCE(p.active,true)
              AND p.sector_id = _requester_sector
              AND p.id <> p_requester_user_id
            ORDER BY p.full_name NULLS LAST
            LIMIT 1;
          _resolved_role_key := _step.approver_role_key;
          _resolved_sector_id := _requester_sector;
        END IF;

      ELSE _resolved_user_id := _step.approver_user_id;
    END CASE;

    -- Bloqueia aprovador inativo (qualquer regra)
    IF _resolved_user_id IS NOT NULL THEN
      SELECT COALESCE(active, true) INTO _is_active FROM public.profiles WHERE id = _resolved_user_id;
      IF NOT _is_active THEN _resolved_user_id := NULL; END IF;
    END IF;

    IF _resolved_user_id IS NULL THEN
      DELETE FROM public.approval_request_steps WHERE approval_request_id = _request_id;
      DELETE FROM public.approval_requests WHERE id = _request_id;

      _err_hint := CASE _approver_rule
        WHEN 'gestor_imediato' THEN 'O solicitante não possui gestor imediato ativo cadastrado.'
        WHEN 'responsavel_do_setor_do_solicitante' THEN 'O setor do solicitante não possui responsável (ou substituto) ativo.'
        WHEN 'responsavel_do_setor_especifico' THEN 'O setor configurado para esta etapa não possui responsável (ou substituto) ativo.'
        WHEN 'usuario_fixo' THEN 'A etapa fixa não tem usuário ativo configurado.'
        WHEN 'cargo_perfil' THEN 'Nenhum usuário ativo com o cargo configurado está lotado no setor do solicitante.'
        ELSE 'Aprovador da etapa não pôde ser resolvido.'
      END;

      RETURN jsonb_build_object('error',
        format('Etapa %s do fluxo (%s): %s', _step.step_order, _approver_rule, _err_hint));
    END IF;

    INSERT INTO public.approval_request_steps (
      approval_request_id, flow_step_id, step_order,
      approver_user_id, approver_rule, approver_role_key,
      resolved_sector_id, resolved_from_user_id
    ) VALUES (
      _request_id, _step.id, _step.step_order,
      _resolved_user_id, _approver_rule, _resolved_role_key,
      _resolved_sector_id,
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
$function$;

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
É obrigatório informar o motivo da recusa');
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
É obrigatório informar o motivo da devolução');
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
        WHEN 'return' THEN COALESCE('Motivo: '||p_comments||' - corrija e reenvie para retomar o fluxo','Devolvida para correção')
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
-- === ROLLBACK ===
-- DROP INDEX IF EXISTS public.idx_approval_requests_one_active_per_reference;
-- Reverter as funções start_approval_flow e process_approval_action para as versões anteriores (presentes nas migrations 20260623181031 e 20260622163923 respectivamente).
-- Precondição para rollback: Nenhuma
