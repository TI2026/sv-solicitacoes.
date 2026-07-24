
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
  _reference_owner uuid;
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

  -- Ownership check: reference record must belong to the requester
  IF p_module_code IN ('abastecimento','reembolso','diaria') THEN
    SELECT requester_user_id INTO _reference_owner FROM public.fuel_requests WHERE id = p_reference_id;
  ELSIF p_module_code = 'compras' THEN
    SELECT requester_user_id INTO _reference_owner FROM public.purchases WHERE id = p_reference_id;
  ELSIF p_module_code = 'admissions' THEN
    SELECT requester_user_id INTO _reference_owner FROM public.admission_requests WHERE id = p_reference_id;
  ELSE
    _reference_owner := p_requester_user_id; -- unknown module: skip strict check
  END IF;

  IF _reference_owner IS NULL THEN
    RETURN jsonb_build_object('error', 'Registro de referência não encontrado');
  END IF;

  IF _reference_owner <> p_requester_user_id THEN
    RETURN jsonb_build_object('error', 'Solicitante informado não corresponde ao dono do registro');
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

  IF _flow.module_id IS DISTINCT FROM _module_id THEN
    RETURN jsonb_build_object('error', 'Fluxo ativo não pertence ao módulo solicitado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

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
      ELSE
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      INSERT INTO public.approval_request_steps (
        approval_request_id, flow_step_id, step_order, approver_user_id,
        is_required, status
      ) VALUES (
        _request_id, _step.id, _step.step_order, _resolved_user_id,
        _step.is_required, 'pending'
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
