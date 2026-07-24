-- =========================================================================
-- FASE 1 — Permissões, Approval Engine, Governança
-- =========================================================================

-- 1) profiles.active (default true) ---------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(active) WHERE active = true;

-- 2) approval_flow_steps: CHECK do approver_type + permitir approver_user_id NULL
ALTER TABLE public.approval_flow_steps
  ALTER COLUMN approver_user_id DROP NOT NULL;

ALTER TABLE public.approval_flow_steps
  ADD COLUMN IF NOT EXISTS approver_role_key text;

ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_approver_type_check;

ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_approver_type_check
  CHECK (approver_type IN (
    'usuario_fixo',
    'gestor_imediato',
    'responsavel_do_setor_do_solicitante',
    'responsavel_do_setor_especifico',
    'cargo_perfil'
  ));

-- Coerência por tipo
ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_required_fields_check;

ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_required_fields_check CHECK (
    (approver_type = 'usuario_fixo' AND approver_user_id IS NOT NULL)
    OR (approver_type = 'responsavel_do_setor_especifico' AND fixed_sector_id IS NOT NULL)
    OR (approver_type = 'cargo_perfil' AND approver_role_key IS NOT NULL)
    OR (approver_type IN ('gestor_imediato','responsavel_do_setor_do_solicitante'))
  );

-- 3) approval_request_steps: snapshot do papel e setor (para cargo_perfil)
ALTER TABLE public.approval_request_steps
  ADD COLUMN IF NOT EXISTS approver_role_key text;

-- 4) start_approval_flow: resolve cargo_perfil (cargo + mesmo setor do solicitante)
--    + ignora usuários inativos + fallback para sectors.substitute_user_id
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

-- 5) replace_approval_flow_steps: persiste approver_role_key e valida combos
CREATE OR REPLACE FUNCTION public.replace_approval_flow_steps(p_flow_id uuid, p_steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _step jsonb; _idx int := 0; _uid uuid := auth.uid();
  _type text; _user uuid; _sector uuid; _role text;
BEGIN
  IF p_flow_id IS NULL THEN RETURN jsonb_build_object('error', 'flow_id obrigatório'); END IF;

  IF NOT (
    has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')
    OR EXISTS (SELECT 1 FROM public.user_role_assignments ura
               JOIN public.roles r ON r.id = ura.role_id
               WHERE ura.user_id = _uid AND r.is_master = TRUE)
  ) THEN
    RETURN jsonb_build_object('error', 'Sem permissão para editar fluxo de aprovação');
  END IF;

  -- Validação prévia
  IF p_steps IS NOT NULL AND jsonb_typeof(p_steps) = 'array' THEN
    FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      _idx := _idx + 1;
      _type   := COALESCE(_step->>'approver_type', 'usuario_fixo');
      _user   := NULLIF(_step->>'approver_user_id','')::uuid;
      _sector := NULLIF(_step->>'fixed_sector_id','')::uuid;
      _role   := NULLIF(_step->>'approver_role_key','');

      IF _type NOT IN ('usuario_fixo','gestor_imediato','responsavel_do_setor_do_solicitante',
                       'responsavel_do_setor_especifico','cargo_perfil') THEN
        RETURN jsonb_build_object('error', format('Etapa %s: tipo de aprovador inválido (%s)', _idx, _type));
      END IF;
      IF _type='usuario_fixo' AND _user IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: usuário fixo é obrigatório', _idx)); END IF;
      IF _type='responsavel_do_setor_especifico' AND _sector IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: setor específico é obrigatório', _idx)); END IF;
      IF _type='cargo_perfil' AND _role IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: cargo (role) é obrigatório', _idx)); END IF;
      IF _type='cargo_perfil' AND _role = 'colaborador' THEN
        RETURN jsonb_build_object('error', format('Etapa %s: cargo "colaborador" não pode ser aprovador', _idx)); END IF;
      IF _type='usuario_fixo' AND _user IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.profiles WHERE id = _user AND COALESCE(active,true)
      ) THEN
        RETURN jsonb_build_object('error', format('Etapa %s: usuário fixo está inativo', _idx)); END IF;
    END LOOP;
  ELSE
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  IF _idx < 1 THEN
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  DELETE FROM public.approval_flow_steps WHERE flow_id = p_flow_id;

  _idx := 0;
  FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    _idx := _idx + 1;
    INSERT INTO public.approval_flow_steps (
      flow_id, step_order, approver_type, approver_user_id,
      fixed_sector_id, approver_role_key, active
    ) VALUES (
      p_flow_id, _idx,
      COALESCE(_step->>'approver_type', 'usuario_fixo'),
      NULLIF(_step->>'approver_user_id', '')::uuid,
      NULLIF(_step->>'fixed_sector_id', '')::uuid,
      NULLIF(_step->>'approver_role_key', ''),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', _idx);
END;
$function$;

-- 6) admin_purge_test_data: restringir a MASTER apenas
CREATE OR REPLACE FUNCTION public.admin_purge_test_data(_scope text, _confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean;
  _result jsonb := '{}'::jsonb;
  _fuel_ids uuid[];
  _admission_ids uuid[];
  _candidate_ids uuid[];
  _approval_ids uuid[];
  _counts jsonb := '{}'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _uid AND r.is_master = TRUE
  ) INTO _is_master;

  IF NOT _is_master THEN
    RETURN jsonb_build_object('error', 'Apenas usuário Master pode executar limpeza de dados');
  END IF;

  IF _scope NOT IN ('SOLICITACOES', 'ADMISSOES', 'ALL_TEST') THEN
    RETURN jsonb_build_object('error', 'Escopo inválido. Use: SOLICITACOES, ADMISSOES ou ALL_TEST');
  END IF;

  IF _scope IN ('SOLICITACOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _fuel_ids FROM fuel_requests;
    IF _fuel_ids IS NULL THEN _fuel_ids := '{}'; END IF;
    SELECT array_agg(id) INTO _approval_ids FROM approval_requests WHERE reference_id = ANY(_fuel_ids);
    IF _approval_ids IS NULL THEN _approval_ids := '{}'; END IF;

    _counts := _counts || jsonb_build_object(
      'fuel_attachments', (SELECT count(*) FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids)),
      'fuel_reviews', (SELECT count(*) FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids)),
      'approval_history', (SELECT count(*) FROM approval_history WHERE approval_request_id = ANY(_approval_ids)),
      'approval_request_steps', (SELECT count(*) FROM approval_request_steps WHERE approval_request_id = ANY(_approval_ids)),
      'approval_requests', coalesce(array_length(_approval_ids, 1), 0),
      'fuel_requests', coalesce(array_length(_fuel_ids, 1), 0)
    );

    IF _confirm THEN
      DELETE FROM approval_history WHERE approval_request_id = ANY(_approval_ids);
      DELETE FROM approval_request_steps WHERE approval_request_id = ANY(_approval_ids);
      DELETE FROM approval_requests WHERE id = ANY(_approval_ids);
      DELETE FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM status_history WHERE module = 'fleet';
      DELETE FROM notifications WHERE metadata->>'entity_type' IN ('fuel_requests', 'approval_request');
      DELETE FROM fuel_requests WHERE id = ANY(_fuel_ids);
    END IF;
  END IF;

  IF _scope IN ('ADMISSOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _admission_ids FROM admission_requests;
    IF _admission_ids IS NULL THEN _admission_ids := '{}'; END IF;
    SELECT array_agg(id) INTO _candidate_ids FROM candidates WHERE admission_request_id = ANY(_admission_ids);
    IF _candidate_ids IS NULL THEN _candidate_ids := '{}'; END IF;

    IF _confirm THEN
      DELETE FROM document_reviews WHERE candidate_document_id IN (SELECT id FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids));
      DELETE FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM medical_exams WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM system_registrations WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM public_tokens WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM admission_files WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM admission_public_links WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM candidates WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM status_history WHERE module = 'admissions';
      DELETE FROM notifications WHERE metadata->>'entity_type' = 'admission_requests';
      DELETE FROM admission_requests WHERE id = ANY(_admission_ids);
    END IF;
  END IF;

  IF _confirm THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'purge_test_data', 'system', _scope,
      jsonb_build_object('scope', _scope, 'counts', _counts, 'confirmed', true, 'is_master', true));
  END IF;

  RETURN jsonb_build_object('preview', NOT _confirm, 'scope', _scope, 'counts', _counts);
END;
$function$;
