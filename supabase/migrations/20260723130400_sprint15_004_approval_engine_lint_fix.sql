-- ============================================================
-- SPRINT 15: Migration 004 - Fix Approval Engine Lint
-- ============================================================

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
    SET status = 'awaiting_step_' || _first_order,
        current_step_order = _first_order,
        current_approver_user_id = _first_approver
    WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (_first_approver, 'Nova aprovação pendente', 'Uma solicitação aguarda sua aprovação.',
    jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id));

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_approval_flow(text, uuid, uuid) TO authenticated;
