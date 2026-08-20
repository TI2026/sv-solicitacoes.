-- =====================================================================
-- Checkpoint 1 / Onda B-R2 + D-R2 (parte 1) — Motor de Aprovação V2
-- =====================================================================

-- 1) Colunas de snapshot em approval_request_steps -------------------
ALTER TABLE public.approval_request_steps
  ADD COLUMN IF NOT EXISTS flow_version         text,
  ADD COLUMN IF NOT EXISTS step_code            text,
  ADD COLUMN IF NOT EXISTS step_name            text,
  ADD COLUMN IF NOT EXISTS step_kind            text,
  ADD COLUMN IF NOT EXISTS completion_action    text,
  ADD COLUMN IF NOT EXISTS next_step_activation text,
  ADD COLUMN IF NOT EXISTS assignment_mode      text,
  ADD COLUMN IF NOT EXISTS source_sector_id     uuid,
  ADD COLUMN IF NOT EXISTS primary_user_id      uuid,
  ADD COLUMN IF NOT EXISTS substitute_user_id   uuid,
  ADD COLUMN IF NOT EXISTS sla_hours            integer,
  ADD COLUMN IF NOT EXISTS activated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS sla_deadline         timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS overdue              boolean NOT NULL DEFAULT false;

-- 2) save_approval_step_assignment: shared lock + setor completo -----
CREATE OR REPLACE FUNCTION public.save_approval_step_assignment(
  p_step_id uuid,
  p_assignment_mode text,
  p_primary_user_id uuid DEFAULT NULL::uuid,
  p_substitute_user_id uuid DEFAULT NULL::uuid,
  p_sector_id uuid DEFAULT NULL::uuid,
  p_sla_hours integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step   record;
  v_sector record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHENTICATED');
  END IF;
  IF NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  -- Trava compartilhada: nunca alterar configuração durante o cutover
  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_cutover'));

  SELECT s.*, f.version INTO v_step
    FROM public.approval_flow_steps s
    JOIN public.approval_flows f ON f.id = s.flow_id
   WHERE s.id = p_step_id
   FOR UPDATE OF s;

  IF v_step IS NULL THEN
    RETURN jsonb_build_object('error','STEP_NOT_FOUND');
  END IF;

  IF coalesce(v_step.version,'v1') <> 'v2' THEN
    RETURN jsonb_build_object('error','STEP_NOT_V2');
  END IF;

  IF p_assignment_mode NOT IN ('person','sector') THEN
    RETURN jsonb_build_object('error','INVALID_ASSIGNMENT_MODE');
  END IF;

  IF p_sla_hours IS NULL OR p_sla_hours < 1 OR p_sla_hours > 8760 THEN
    RETURN jsonb_build_object('error','INVALID_SLA');
  END IF;

  IF p_assignment_mode = 'person' THEN
    IF p_primary_user_id IS NULL THEN
      RETURN jsonb_build_object('error','PRIMARY_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_primary_user_id AND active) THEN
      RETURN jsonb_build_object('error','PRIMARY_INVALID_OR_INACTIVE');
    END IF;
    IF p_substitute_user_id IS NULL THEN
      RETURN jsonb_build_object('error','SUBSTITUTE_REQUIRED');
    END IF;
    IF p_substitute_user_id = p_primary_user_id THEN
      RETURN jsonb_build_object('error','SUBSTITUTE_EQUALS_PRIMARY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_substitute_user_id AND active) THEN
      RETURN jsonb_build_object('error','SUBSTITUTE_INVALID_OR_INACTIVE');
    END IF;

    UPDATE public.approval_flow_steps
       SET assignment_mode    = 'person',
           approver_type      = 'person',
           approver_user_id   = p_primary_user_id,
           substitute_user_id = p_substitute_user_id,
           fixed_sector_id    = NULL,
           approver_role_key  = NULL,
           default_sla_hours  = p_sla_hours
     WHERE id = p_step_id;
  ELSE
    IF p_sector_id IS NULL THEN
      RETURN jsonb_build_object('error','SECTOR_REQUIRED');
    END IF;

    SELECT * INTO v_sector FROM public.sectors WHERE id = p_sector_id AND active;
    IF v_sector IS NULL THEN
      RETURN jsonb_build_object('error','SECTOR_INVALID_OR_INACTIVE');
    END IF;

    IF v_sector.responsible_user_id IS NULL THEN
      RETURN jsonb_build_object('error','SECTOR_RESPONSIBLE_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_sector.responsible_user_id AND active) THEN
      RETURN jsonb_build_object('error','SECTOR_RESPONSIBLE_INVALID_OR_INACTIVE');
    END IF;
    IF v_sector.substitute_user_id IS NULL THEN
      RETURN jsonb_build_object('error','SECTOR_SUBSTITUTE_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_sector.substitute_user_id AND active) THEN
      RETURN jsonb_build_object('error','SECTOR_SUBSTITUTE_INVALID_OR_INACTIVE');
    END IF;
    IF v_sector.substitute_user_id = v_sector.responsible_user_id THEN
      RETURN jsonb_build_object('error','SECTOR_SUBSTITUTE_EQUALS_RESPONSIBLE');
    END IF;

    UPDATE public.approval_flow_steps
       SET assignment_mode    = 'sector',
           approver_type      = 'sector',
           fixed_sector_id    = p_sector_id,
           approver_user_id   = NULL,
           substitute_user_id = NULL,
           approver_role_key  = NULL,
           default_sla_hours  = p_sla_hours
     WHERE id = p_step_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approval_step_assignment_saved', 'approval_flow_steps', p_step_id::text,
          jsonb_build_object(
            'assignment_mode', p_assignment_mode,
            'primary_user_id', p_primary_user_id,
            'substitute_user_id', p_substitute_user_id,
            'sector_id', p_sector_id,
            'sla_hours', p_sla_hours));

  RETURN jsonb_build_object('success', true, 'step_id', p_step_id);
END;
$function$;

-- 3) start_approval_flow: shared lock, snapshot V2, reenvio atômico --
CREATE OR REPLACE FUNCTION public.start_approval_flow(p_module_code text, p_reference_id uuid, p_requester_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
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
  v_primary             uuid;
  v_substitute          uuid;
  v_first_approver      uuid  := NULL;
  v_first_order         int   := NULL;
  v_is_first_step       boolean := true;
  v_query               text;
  v_active              boolean;
  v_is_v2               boolean;
  v_sla                 int;
  v_returned            record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- PRIMEIRA ação transacional: trava compartilhada de cutover
  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_cutover'));

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

  IF v_entity_status NOT IN ('rascunho', 'retornado') THEN
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

  -- ---------- REENVIO: request devolvida reativa a MESMA etapa -------
  SELECT r.* INTO v_returned
    FROM public.approval_requests r
   WHERE r.reference_id = v_entity_id
     AND r.module_id    = v_module_id
     AND r.ended_at IS NULL
     AND r.status = 'returned'
   ORDER BY r.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_returned.id IS NOT NULL THEN
    SELECT * INTO v_step_rec
      FROM public.approval_request_steps
     WHERE approval_request_id = v_returned.id
       AND step_order = v_returned.current_step_order
     FOR UPDATE;

    IF v_step_rec.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Etapa devolvida não encontrada.');
    END IF;

    v_resolved_user_id := NULL;
    IF v_step_rec.primary_user_id IS NOT NULL
       AND v_step_rec.primary_user_id <> v_real_requester
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_step_rec.primary_user_id AND active) THEN
      v_resolved_user_id := v_step_rec.primary_user_id;
    ELSIF v_step_rec.substitute_user_id IS NOT NULL
       AND v_step_rec.substitute_user_id <> v_real_requester
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_step_rec.substitute_user_id AND active) THEN
      v_resolved_user_id := v_step_rec.substitute_user_id;
    ELSIF v_step_rec.approver_user_id IS NOT NULL
       AND v_step_rec.approver_user_id <> v_real_requester
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_step_rec.approver_user_id AND active) THEN
      v_resolved_user_id := v_step_rec.approver_user_id;
    END IF;

    IF v_resolved_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'WORKFLOW_NO_ELIGIBLE_APPROVER');
    END IF;

    UPDATE public.approval_request_steps
       SET status = 'pending',
           approver_user_id = v_resolved_user_id,
           action_at = NULL,
           activated_at = now(),
           overdue = false,
           escalated_at = NULL,
           sla_deadline = CASE WHEN COALESCE(sla_hours,0) > 0
                               THEN now() + make_interval(hours => sla_hours) END
     WHERE id = v_step_rec.id;

    UPDATE public.approval_requests
       SET status = 'awaiting_step',
           current_approver_user_id = v_resolved_user_id,
           updated_at = now()
     WHERE id = v_returned.id;

    v_query := format('UPDATE public.%I SET %I = %L, updated_at = now() WHERE id = $1',
      v_table, v_status_col, 'em_aprovacao');
    EXECUTE v_query USING v_entity_id;

    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_module_key, v_module_key, v_entity_id, v_entity_status, 'em_aprovacao', v_uid);

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'RESUBMIT_APPROVAL', v_module_key, v_entity_id::text,
      jsonb_build_object('request_id', v_returned.id,
                         'step_order', v_returned.current_step_order,
                         'approver', v_resolved_user_id));

    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (v_resolved_user_id, 'Solicitação reenviada para aprovação',
      'Uma solicitação corrigida voltou para sua aprovação (' || UPPER(v_module_key) || ').',
      jsonb_build_object('type','approval_assigned','approval_request_id', v_returned.id,
        'link','/' || (CASE WHEN v_module_key IN ('abastecimento','diaria','reembolso') THEN 'fleet' ELSE v_module_key END) || '/' || v_entity_id));

    RETURN jsonb_build_object('success', true, 'resubmitted', true,
                              'request_id', v_returned.id, 'approval_request_id', v_returned.id);
  END IF;

  -- ---------- NOVO FLUXO ---------------------------------------------
  SELECT * INTO v_flow_rec
  FROM public.approval_flows
  WHERE module_id = v_module_id AND active = true
  ORDER BY version DESC, created_at DESC
  LIMIT 1;

  IF v_flow_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum fluxo de aprovação ativo encontrado para o módulo.');
  END IF;

  v_is_v2 := COALESCE(v_flow_rec.version, 'v1') = 'v2';

  IF NOT EXISTS (
    SELECT 1 FROM public.approval_flow_steps WHERE flow_id = v_flow_rec.id AND active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo não possui etapas configuradas.');
  END IF;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (v_module_id, v_flow_rec.id, v_entity_id, v_real_requester, 'draft')
  RETURNING id INTO v_request_id;

  FOR v_step_rec IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = v_flow_rec.id AND active = true
    ORDER BY step_order ASC
  LOOP
    v_resolved_user_id   := NULL;
    v_resolved_sector_id := NULL;
    v_resolved_role_key  := NULL;
    v_primary            := NULL;
    v_substitute         := NULL;
    v_sla                := v_step_rec.default_sla_hours;

    IF v_is_v2 THEN
      IF COALESCE(v_step_rec.assignment_mode,'person') = 'sector' THEN
        SELECT s.id, s.responsible_user_id, s.substitute_user_id
          INTO v_resolved_sector_id, v_primary, v_substitute
          FROM public.sectors s
         WHERE s.id = v_step_rec.fixed_sector_id AND s.active;
      ELSE
        v_primary    := v_step_rec.approver_user_id;
        v_substitute := v_step_rec.substitute_user_id;
      END IF;

      IF v_primary IS NOT NULL
         AND v_primary <> v_real_requester
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_primary AND active) THEN
        v_resolved_user_id := v_primary;
      ELSIF v_substitute IS NOT NULL
         AND v_substitute <> v_real_requester
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_substitute AND active) THEN
        v_resolved_user_id := v_substitute;
      ELSE
        RAISE EXCEPTION 'WORKFLOW_NO_ELIGIBLE_APPROVER';
      END IF;
    ELSE
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
        RAISE EXCEPTION 'WORKFLOW_NO_ELIGIBLE_APPROVER';
      END IF;
    END IF;

    IF v_is_first_step THEN
      v_first_approver := v_resolved_user_id;
      v_first_order    := v_step_rec.step_order;
    END IF;

    INSERT INTO public.approval_request_steps (
      approval_request_id, flow_step_id, step_order, approver_user_id,
      status, approver_rule, resolved_sector_id, approver_role_key,
      flow_version, step_code, step_name, step_kind, completion_action,
      next_step_activation, assignment_mode, source_sector_id,
      primary_user_id, substitute_user_id, sla_hours,
      activated_at, sla_deadline
    ) VALUES (
      v_request_id, v_step_rec.id, v_step_rec.step_order, v_resolved_user_id,
      CASE WHEN v_is_first_step THEN 'pending' ELSE 'waiting' END,
      COALESCE(v_step_rec.approver_type, 'usuario_fixo'), v_resolved_sector_id, v_resolved_role_key,
      COALESCE(v_flow_rec.version, 'v1'), v_step_rec.step_code, v_step_rec.step_name,
      v_step_rec.step_kind, v_step_rec.completion_action,
      v_step_rec.next_step_activation,
      COALESCE(v_step_rec.assignment_mode, v_step_rec.approver_type),
      COALESCE(v_resolved_sector_id, v_step_rec.fixed_sector_id),
      v_primary, v_substitute, v_sla,
      CASE WHEN v_is_first_step THEN now() END,
      CASE WHEN v_is_first_step AND COALESCE(v_sla,0) > 0
           THEN now() + make_interval(hours => v_sla) END
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
END;
$function$;

-- 4) execute_entity_action: 'enviar' 100% delegado, sem pré-mutação ---
CREATE OR REPLACE FUNCTION public.execute_entity_action(p_module_key text, p_entity_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_ctx       public.entity_action_context;
  v_notes     TEXT;
  v_req_id    UUID;
  v_module    TEXT;
  v_result    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_module_key IS NULL OR p_entity_id IS NULL OR p_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parâmetros obrigatórios ausentes (module_key, entity_id, action)');
  END IF;

  IF p_action NOT IN ('enviar', 'aprovar', 'devolver', 'rejeitar', 'cancelar', 'editar') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação não reconhecida: ' || p_action);
  END IF;

  v_notes := p_payload->>'notes';

  BEGIN
    v_ctx := public.get_entity_action_context(p_module_key, p_entity_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro ao obter contexto da entidade: ' || SQLERRM);
  END;

  IF v_ctx.current_status = 'ERRO' THEN
    RETURN jsonb_build_object('success', false, 'error', array_to_string(v_ctx.blocked_reasons, '; '));
  END IF;

  IF NOT (v_ctx.allowed_actions ? p_action) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ação "' || p_action || '" não permitida para o status "' || v_ctx.current_status || '".',
      'blocked_reasons', to_json(v_ctx.blocked_reasons)
    );
  END IF;

  v_module := v_ctx.module_key;

  IF p_action = 'enviar' THEN
    -- Delegação pura: start_approval_flow é atômico (status, history, audit, notification).
    v_result := public.start_approval_flow(v_module, p_entity_id, v_uid);

    IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false,
        'error', COALESCE(v_result->>'error', 'Falha ao iniciar fluxo de aprovação'));
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'em_aprovacao',
                              'approval_request_id', v_result->'approval_request_id',
                              'resubmitted', COALESCE(v_result->'resubmitted', 'false'::jsonb));

  ELSIF p_action = 'cancelar' THEN
    PERFORM public._update_entity_status(v_module, p_entity_id, 'cancelado');

    UPDATE public.approval_requests
    SET status = 'cancelled', ended_at = now(), updated_at = now()
    WHERE reference_id = p_entity_id
      AND status NOT IN ('approved', 'rejected', 'cancelled', 'completed');

    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_module, v_module, p_entity_id, v_ctx.current_status, 'cancelado', v_uid);

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENTITY_CANCEL', v_module, p_entity_id::text,
      jsonb_build_object('from', v_ctx.current_status, 'notes', v_notes));

    RETURN jsonb_build_object('success', true, 'status', 'cancelado');

  ELSIF p_action IN ('aprovar', 'devolver', 'rejeitar') THEN
    DECLARE
      v_internal_action TEXT;
    BEGIN
      v_internal_action := CASE p_action
        WHEN 'aprovar'  THEN 'approve'
        WHEN 'devolver' THEN 'return'
        WHEN 'rejeitar' THEN 'reject'
      END;

      SELECT id INTO v_req_id
      FROM public.approval_requests
      WHERE reference_id = p_entity_id
        AND ended_at IS NULL
        AND status NOT IN ('approved', 'rejected', 'cancelled', 'completed')
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_req_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum fluxo de aprovação ativo encontrado para esta solicitação');
      END IF;

      v_result := public.process_approval_action(v_req_id, v_internal_action, v_notes);
      RETURN v_result;
    END;

  ELSIF p_action = 'editar' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENTITY_EDIT', v_module, p_entity_id::text,
      jsonb_build_object('status', v_ctx.current_status, 'notes', v_notes));
    RETURN jsonb_build_object('success', true, 'status', v_ctx.current_status, 'action', 'editar');

  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Ação não processada');
END;
$function$;

-- 5) is_master deixa de ser executável diretamente --------------------
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO service_role;