CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code        text,
  p_reference_id       uuid,
  p_requester_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid                 uuid := auth.uid();
  v_module_key          text := p_module_code;
  v_entity_id           uuid := p_reference_id;
  v_real_requester      uuid;
  v_is_master_or_admin  boolean;
  v_module_id           uuid;
  v_table               text;
  v_discriminator_col   text;
  v_discriminator_val   text;
  v_status_col          text;
  v_requester_col       text;
  v_entity_status       text;
  v_entity_requester    uuid;
  v_flow_rec            record;
  v_step_rec            record;
  v_request_id          uuid;
  v_resolved_user_id    uuid;
  v_resolved_sector_id  uuid;
  v_resolved_role_key   text;
  v_first_approver      uuid  := NULL;
  v_first_order         int   := NULL;
  v_is_first_step       boolean := true;
  v_query               text;
  v_active              boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT COALESCE(active, true) INTO v_active FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_active, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário inativo.');
  END IF;

  IF p_requester_user_id <> v_uid THEN
    v_is_master_or_admin :=
      public.has_role(v_uid, 'master'::app_role) OR
      public.has_role(v_uid, 'administrativo'::app_role);
    IF NOT v_is_master_or_admin THEN
      RETURN jsonb_build_object('success', false,
        'error', 'Sem permissão para iniciar fluxo em nome de outro usuário.');
    END IF;
    v_real_requester := p_requester_user_id;
  ELSE
    v_real_requester := v_uid;
  END IF;

  v_discriminator_col := NULL;
  v_discriminator_val := NULL;

  CASE v_module_key
    WHEN 'compras', 'purchases' THEN
      v_module_key := 'compras'; v_table := 'purchases';
      v_status_col := 'status'; v_requester_col := 'requester_user_id';
    WHEN 'abastecimento' THEN
      v_table := 'fuel_requests'; v_status_col := 'status'; v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type'; v_discriminator_val := 'abastecimento';
    WHEN 'diaria' THEN
      v_table := 'fuel_requests'; v_status_col := 'status'; v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type'; v_discriminator_val := 'diaria';
    WHEN 'reembolso' THEN
      v_table := 'fuel_requests'; v_status_col := 'status'; v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type'; v_discriminator_val := 'reembolso';
    WHEN 'admissoes', 'admissions' THEN
      v_module_key := 'admissoes'; v_table := 'admission_requests';
      v_status_col := 'status'; v_requester_col := 'requester_user_id';
    WHEN 'desligamentos', 'terminations' THEN
      v_module_key := 'desligamentos'; v_table := 'termination_requests';
      v_status_col := 'status'; v_requester_col := 'requester_user_id';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Módulo desconhecido: ' || v_module_key);
  END CASE;

  SELECT id INTO v_module_id
  FROM public.approval_modules
  WHERE code = v_module_key AND active = true;

  IF v_module_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Módulo inativo ou não configurado.');
  END IF;

  IF v_discriminator_col IS NOT NULL THEN
    v_query := format('SELECT %I::text, %I FROM public.%I WHERE id = $1 AND %I = $2 FOR UPDATE',
      v_status_col, v_requester_col, v_table, v_discriminator_col);
    EXECUTE v_query INTO v_entity_status, v_entity_requester USING v_entity_id, v_discriminator_val;
  ELSE
    v_query := format('SELECT %I::text, %I FROM public.%I WHERE id = $1 FOR UPDATE',
      v_status_col, v_requester_col, v_table);
    EXECUTE v_query INTO v_entity_status, v_entity_requester USING v_entity_id;
  END IF;

  IF v_entity_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entidade não encontrada ou discriminator incompatível.');
  END IF;

  IF v_entity_requester <> v_real_requester THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o solicitante original pode iniciar o fluxo.');
  END IF;

  IF v_entity_status NOT IN ('rascunho', 'retornado', 'em_aprovacao') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Status atual (' || v_entity_status || ') não permite envio para aprovação.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE reference_id = v_entity_id
      AND module_id    = v_module_id
      AND ended_at     IS NULL
      AND status NOT IN ('approved', 'rejected', 'cancelled', 'returned', 'completed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um fluxo de aprovação ativo para esta entidade.');
  END IF;

  SELECT * INTO v_flow_rec
  FROM public.approval_flows
  WHERE module_id = v_module_id AND active = true
  ORDER BY version DESC, created_at DESC
  LIMIT 1;

  IF v_flow_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum fluxo de aprovação ativo encontrado para o módulo.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.approval_flow_steps WHERE flow_id = v_flow_rec.id AND active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo não possui etapas configuradas.');
  END IF;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (v_module_id, v_flow_rec.id, v_entity_id, v_real_requester, 'pending_resolution')
  RETURNING id INTO v_request_id;

  FOR v_step_rec IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = v_flow_rec.id AND active = true
    ORDER BY step_order ASC
  LOOP
    v_resolved_user_id   := NULL;
    v_resolved_sector_id := NULL;
    v_resolved_role_key  := NULL;

    CASE COALESCE(v_step_rec.approver_type, 'usuario_fixo')
      WHEN 'usuario_fixo' THEN
        v_resolved_user_id := v_step_rec.approver_user_id;

      WHEN 'responsavel_do_setor_do_solicitante' THEN
        SELECT s.id, s.responsible_user_id INTO v_resolved_sector_id, v_resolved_user_id
        FROM public.profiles p
        JOIN public.sectors s ON s.id = p.sector_id AND s.active = true
        WHERE p.id = v_real_requester;

        IF v_resolved_user_id IS NULL OR v_resolved_user_id = v_real_requester THEN
          SELECT s.substitute_user_id INTO v_resolved_user_id
          FROM public.profiles p
          JOIN public.sectors s ON s.id = p.sector_id AND s.active = true
          WHERE p.id = v_real_requester;
        END IF;

      WHEN 'responsavel_do_setor_especifico' THEN
        IF v_step_rec.fixed_sector_id IS NOT NULL THEN
          SELECT responsible_user_id INTO v_resolved_user_id
          FROM public.sectors WHERE id = v_step_rec.fixed_sector_id AND active = true;
          IF v_resolved_user_id IS NULL THEN
            SELECT substitute_user_id INTO v_resolved_user_id
            FROM public.sectors WHERE id = v_step_rec.fixed_sector_id AND active = true;
          END IF;
          v_resolved_sector_id := v_step_rec.fixed_sector_id;
        END IF;

      WHEN 'gestor_imediato' THEN
        SELECT manager_user_id INTO v_resolved_user_id
        FROM public.profiles WHERE id = v_real_requester;

      WHEN 'cargo_perfil' THEN
        IF v_step_rec.approver_role_key IS NOT NULL THEN
          SELECT ura.user_id INTO v_resolved_user_id
          FROM public.user_role_assignments ura
          JOIN public.roles r    ON r.id = ura.role_id AND r.key = v_step_rec.approver_role_key
          JOIN public.profiles p ON p.id = ura.user_id AND COALESCE(p.active, true)
          WHERE p.sector_id = (SELECT sector_id FROM public.profiles WHERE id = v_real_requester)
            AND p.id <> v_real_requester
          ORDER BY p.full_name ASC LIMIT 1;

          IF v_resolved_user_id IS NULL THEN
            SELECT ura.user_id INTO v_resolved_user_id
            FROM public.user_role_assignments ura
            JOIN public.roles r    ON r.id = ura.role_id AND r.key = v_step_rec.approver_role_key
            JOIN public.profiles p ON p.id = ura.user_id AND COALESCE(p.active, true)
            WHERE p.id <> v_real_requester
            ORDER BY p.full_name ASC LIMIT 1;
          END IF;

          v_resolved_role_key := v_step_rec.approver_role_key;
        END IF;

      ELSE
        v_resolved_user_id := v_step_rec.approver_user_id;
    END CASE;

    IF v_resolved_user_id IS NULL AND v_step_rec.substitute_user_id IS NOT NULL THEN
      v_resolved_user_id := v_step_rec.substitute_user_id;
    END IF;

    IF v_resolved_user_id IS NOT NULL THEN
      SELECT COALESCE(active, true) INTO v_active FROM public.profiles WHERE id = v_resolved_user_id;
      IF NOT COALESCE(v_active, false) THEN v_resolved_user_id := NULL; END IF;
      IF v_resolved_user_id = v_real_requester THEN v_resolved_user_id := NULL; END IF;
    END IF;

    IF v_resolved_user_id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível resolver o aprovador para a etapa % (%)',
        v_step_rec.step_order, COALESCE(v_step_rec.step_name, v_step_rec.step_code, 'Desconhecida');
    END IF;

    IF v_is_first_step THEN
      v_first_approver := v_resolved_user_id;
      v_first_order    := v_step_rec.step_order;
    END IF;

    INSERT INTO public.approval_request_steps (
      approval_request_id, flow_step_id, step_order, approver_user_id,
      status, approver_rule, resolved_sector_id, approver_role_key
    ) VALUES (
      v_request_id, v_step_rec.id, v_step_rec.step_order, v_resolved_user_id,
      CASE WHEN v_is_first_step THEN 'pending' ELSE 'waiting' END,
      COALESCE(v_step_rec.approver_type, 'usuario_fixo'), v_resolved_sector_id, v_resolved_role_key
    );

    v_is_first_step := false;
  END LOOP;

  UPDATE public.approval_requests
  SET status = 'awaiting_step',
      current_step_order = v_first_order,
      current_approver_user_id = v_first_approver,
      updated_at = now()
  WHERE id = v_request_id;

  v_query := format('UPDATE public.%I SET %I = %L, updated_at = now() WHERE id = $1',
    v_table, v_status_col, 'em_aprovacao');
  EXECUTE v_query USING v_entity_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES (v_module_key, v_module_key, v_entity_id, v_entity_status, 'em_aprovacao', v_uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'START_APPROVAL', v_module_key, v_entity_id::text,
    jsonb_build_object(
      'flow_id', v_flow_rec.id,
      'flow_version', COALESCE(v_flow_rec.version, 'v1'),
      'first_approver', v_first_approver,
      'first_order', v_first_order,
      'request_id', v_request_id
    ));

  IF v_first_approver IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      v_first_approver,
      'Nova aprovação pendente',
      'Você tem uma nova solicitação aguardando aprovação (' || UPPER(v_module_key) || ').',
      jsonb_build_object(
        'type', 'approval_assigned',
        'approval_request_id', v_request_id,
        'link', '/' || (CASE WHEN v_module_key IN ('abastecimento','diaria','reembolso') THEN 'fleet' ELSE v_module_key END) || '/' || v_entity_id
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'approval_request_id', v_request_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL  ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_approval_flow(text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF public.approval_requests
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.approval_requests
  WHERE current_approver_user_id = auth.uid()
    AND (status = 'awaiting_step' OR status LIKE 'awaiting_step_%')
    AND ended_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_approval_queue() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;