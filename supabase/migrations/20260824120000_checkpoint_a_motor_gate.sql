-- Checkpoint A / Motor Gate
-- Consolidates the effective V2 read contract without rewriting shared history.

-- Dynamic entity reader with explicit OUT assignments so missing entities
-- produce zero rows instead of indeterminate records.
CREATE OR REPLACE FUNCTION public._engine_entity_read(
  p_module text,
  p_entity_id uuid,
  p_lock boolean DEFAULT false
)
RETURNS TABLE(status text, requester_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_table text;
  v_discriminator text;
  v_sql text;
  v_status text;
  v_requester_user_id uuid;
BEGIN
  CASE public._engine_module_norm(p_module)
    WHEN 'compras'       THEN v_table := 'purchases';
    WHEN 'abastecimento' THEN v_table := 'fuel_requests'; v_discriminator := 'abastecimento';
    WHEN 'diaria'        THEN v_table := 'fuel_requests'; v_discriminator := 'diaria';
    WHEN 'reembolso'     THEN v_table := 'fuel_requests'; v_discriminator := 'reembolso';
    WHEN 'admissoes'     THEN v_table := 'admission_requests';
    WHEN 'desligamentos' THEN v_table := 'termination_requests';
    ELSE RETURN;
  END CASE;

  v_sql := format(
    'SELECT status::text, requester_user_id FROM public.%I WHERE id = $1 %s %s',
    v_table,
    CASE WHEN v_discriminator IS NOT NULL THEN 'AND type::text = $2' ELSE '' END,
    CASE WHEN p_lock THEN 'FOR UPDATE' ELSE '' END
  );

  IF v_discriminator IS NOT NULL THEN
    EXECUTE v_sql INTO v_status, v_requester_user_id USING p_entity_id, v_discriminator;
  ELSE
    EXECUTE v_sql INTO v_status, v_requester_user_id USING p_entity_id;
  END IF;

  IF v_status IS NOT NULL OR v_requester_user_id IS NOT NULL THEN
    status := v_status;
    requester_user_id := v_requester_user_id;
    RETURN NEXT;
  END IF;
END
$function$;

-- Visibility checks must isolate equal UUIDs belonging to different modules.
CREATE OR REPLACE FUNCTION public._engine_can_view(
  p_module text,
  p_entity_id uuid,
  p_requester uuid,
  p_uid uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_module text := public._engine_module_norm(p_module);
BEGIN
  IF p_uid IS NULL OR v_module IS NULL THEN RETURN false; END IF;
  IF p_uid = p_requester THEN RETURN true; END IF;
  IF public.is_master(p_uid) THEN RETURN true; END IF;
  IF public.has_role(p_uid, 'diretoria'::app_role)
     OR public.has_role(p_uid, 'administrativo'::app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
      JOIN public.approval_request_steps ars ON ars.approval_request_id = ar.id
     WHERE ar.reference_id = p_entity_id
       AND public._engine_module_norm(am.code) = v_module
       AND (
         ars.approver_user_id = p_uid
         OR ars.primary_user_id = p_uid
         OR ars.substitute_user_id = p_uid
         OR ar.current_approver_user_id = p_uid
       )
  ) THEN
    RETURN true;
  END IF;

  IF v_module IN ('abastecimento','diaria','reembolso') AND EXISTS (
    SELECT 1
      FROM public.fuel_requests f
     WHERE f.id = p_entity_id
       AND f.type::text = v_module
       AND (f.assigned_to_user_id = p_uid OR f.reviewed_by = p_uid)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.sectors s ON s.id = p.sector_id AND s.active
     WHERE p.id = p_requester
       AND (s.responsible_user_id = p_uid OR s.substitute_user_id = p_uid)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_entity_action_context(
  p_module_key text,
  p_entity_id uuid
)
RETURNS public.entity_action_context
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ctx public.entity_action_context;
  v_uid uuid := auth.uid();
  v_module text := public._engine_module_norm(p_module_key);
  v_module_id uuid;
  v_entity_status text;
  v_requester_user_id uuid;
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_request_steps%ROWTYPE;
  v_next public.approval_request_steps%ROWTYPE;
  v_has_request boolean := false;
  v_has_step boolean := false;
  v_has_next boolean := false;
  v_master boolean;
  v_is_requester boolean;
  v_actions text[] := ARRAY[]::text[];
  v_blocked text[] := ARRAY[]::text[];
BEGIN
  IF v_module IS NULL OR v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT e.status, e.requester_user_id
    INTO v_entity_status, v_requester_user_id
    FROM public._engine_entity_read(v_module, p_entity_id, false) e;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public._engine_can_view(
    v_module, p_entity_id, v_requester_user_id, v_uid
  ) THEN
    RETURN NULL;
  END IF;

  SELECT am.id
    INTO v_module_id
    FROM public.approval_modules am
   WHERE public._engine_module_norm(am.code) = v_module
     AND am.active
   ORDER BY am.created_at
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_master := public.is_master(v_uid);
  v_is_requester := v_uid = v_requester_user_id;

  SELECT ar.*
    INTO v_request
    FROM public.approval_requests ar
   WHERE ar.module_id = v_module_id
     AND ar.reference_id = p_entity_id
     AND ar.ended_at IS NULL
   ORDER BY ar.created_at DESC
   LIMIT 1;
  v_has_request := FOUND;

  IF v_has_request AND v_request.current_step_order IS NOT NULL THEN
    SELECT ars.*
      INTO v_step
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id
       AND ars.step_order = v_request.current_step_order
     LIMIT 1;
    v_has_step := FOUND;

    SELECT ars.*
      INTO v_next
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id
       AND ars.step_order > v_request.current_step_order
     ORDER BY ars.step_order
     LIMIT 1;
    v_has_next := FOUND;
  END IF;

  ctx.module_key := v_module;
  ctx.entity_id := p_entity_id;
  ctx.current_status := v_entity_status;
  ctx.requester_user_id := v_requester_user_id;
  ctx.approval_request_id := CASE WHEN v_has_request THEN v_request.id END;
  ctx.flow_id := CASE WHEN v_has_request THEN v_request.flow_id END;
  ctx.flow_version := CASE WHEN v_has_step THEN COALESCE(v_step.flow_version, 'v1') END;
  ctx.current_step := CASE WHEN v_has_step THEN v_step.step_name END;
  ctx.current_step_name := CASE WHEN v_has_step THEN v_step.step_name END;
  ctx.current_step_code := CASE WHEN v_has_step THEN v_step.step_code END;
  ctx.current_step_kind := CASE WHEN v_has_step THEN v_step.step_kind END;
  ctx.current_step_order := CASE WHEN v_has_request THEN v_request.current_step_order END;
  ctx.current_approver_user_id := CASE WHEN v_has_request THEN v_request.current_approver_user_id END;
  ctx.next_step := CASE WHEN v_has_next THEN v_next.step_name END;
  ctx.next_step_name := CASE WHEN v_has_next THEN v_next.step_name END;
  ctx.next_step_code := CASE WHEN v_has_next THEN v_next.step_code END;
  ctx.next_step_order := CASE WHEN v_has_next THEN v_next.step_order END;
  ctx.next_responsible_rule := CASE WHEN v_has_next THEN v_next.assignment_mode END;
  ctx.sla_deadline := CASE WHEN v_has_step THEN v_step.sla_deadline END;
  ctx.overdue := CASE WHEN v_has_step THEN COALESCE(v_step.overdue, false) ELSE false END;
  ctx.is_current_actor := CASE
    WHEN v_has_request AND v_request.status = 'awaiting_step'
      THEN v_request.current_approver_user_id = v_uid
    WHEN v_is_requester AND (
      NOT v_has_request OR v_request.status IN ('draft','returned','waiting_operational')
    ) THEN true
    ELSE false
  END;
  ctx.can_edit := v_is_requester
    AND v_entity_status IN ('rascunho','retornado')
    AND (NOT v_has_request OR v_request.status IN ('draft','returned'));

  IF v_has_request THEN
    SELECT count(*)::integer
      INTO ctx.total_steps
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id;
  END IF;
  IF COALESCE(ctx.total_steps, 0) = 0 AND v_has_request AND v_request.flow_id IS NOT NULL THEN
    SELECT count(*)::integer
      INTO ctx.total_steps
      FROM public.approval_flow_steps afs
     WHERE afs.flow_id = v_request.flow_id;
  END IF;

  SELECT p.full_name
    INTO ctx.requester_name
    FROM public.profiles p
   WHERE p.id = v_requester_user_id;
  IF v_has_request AND v_request.current_approver_user_id IS NOT NULL THEN
    SELECT p.full_name
      INTO ctx.current_approver_name
      FROM public.profiles p
     WHERE p.id = v_request.current_approver_user_id;
  END IF;

  IF v_has_request
     AND v_request.status = 'awaiting_step'
     AND (v_request.current_approver_user_id = v_uid OR v_master) THEN
    v_actions := array_cat(
      v_actions,
      ARRAY[
        CASE WHEN v_has_step THEN COALESCE(v_step.completion_action, 'aprovar') ELSE 'aprovar' END,
        'devolver',
        'rejeitar'
      ]::text[]
    );
    IF v_request.current_approver_user_id IS DISTINCT FROM v_uid THEN
      v_blocked := array_append(v_blocked, 'master_override');
    END IF;
  ELSIF v_has_request AND v_request.status = 'awaiting_step' THEN
    v_blocked := array_append(
      v_blocked,
      'Aguardando ' || COALESCE(
        CASE WHEN v_has_step THEN v_step.step_name END,
        'etapa ' || v_request.current_step_order
      )
    );
  END IF;

  IF v_is_requester OR v_master THEN
    IF v_entity_status IN ('rascunho','retornado')
       AND (NOT v_has_request OR v_request.status IN ('returned','draft')) THEN
      v_actions := array_append(v_actions, 'enviar');
    END IF;
    IF v_has_request AND v_request.status = 'waiting_operational' THEN
      v_actions := array_append(v_actions, 'enviar_comprovantes');
    ELSIF v_has_request
       AND v_request.status = 'returned'
       AND v_module IN ('abastecimento','diaria') THEN
      v_actions := array_append(v_actions, 'enviar_comprovantes');
    END IF;
    IF v_entity_status NOT IN (
      'pago','concluido','entregue','desligamento_concluido','cancelado','arquivado'
    ) THEN
      v_actions := array_append(v_actions, 'cancelar');
    END IF;
  ELSIF (NOT v_has_request OR v_request.status = 'draft')
        AND v_entity_status = 'rascunho' THEN
    v_blocked := array_append(v_blocked, 'Apenas o solicitante pode atuar no estágio inicial.');
  END IF;

  IF NOT v_has_request OR v_request.status NOT IN ('awaiting_step','waiting_operational') THEN
    IF v_module = 'compras' AND (
      v_master OR v_is_requester
      OR public.has_role(v_uid, 'financeiro'::app_role)
      OR public.has_role(v_uid, 'compras'::app_role)
      OR public.has_role(v_uid, 'administrativo'::app_role)
      OR public.has_role(v_uid, 'diretoria'::app_role)
    ) THEN
      v_actions := array_cat(
        v_actions,
        CASE v_entity_status
          WHEN 'aguardando_oc' THEN ARRAY['gerar_oc']::text[]
          WHEN 'aguardando_pagamento' THEN ARRAY['pagar']::text[]
          WHEN 'aguardando_entrega' THEN ARRAY['informar_entrega','relatar_divergencia']::text[]
          WHEN 'entregue' THEN ARRAY['concluir','relatar_divergencia']::text[]
          ELSE ARRAY[]::text[]
        END
      );
    ELSIF v_module = 'reembolso'
       AND v_entity_status = 'pago'
       AND (v_is_requester OR v_master) THEN
      v_actions := array_cat(v_actions, ARRAY['concluir','relatar_divergencia']::text[]);
    END IF;
  END IF;

  SELECT COALESCE(array_agg(d.action ORDER BY d.first_position), ARRAY[]::text[])
    INTO v_actions
    FROM (
      SELECT u.action, min(u.position) AS first_position
        FROM unnest(v_actions) WITH ORDINALITY AS u(action, position)
       GROUP BY u.action
    ) d;

  ctx.allowed_actions := to_jsonb(v_actions);
  ctx.blocked_reasons := v_blocked;

  IF cardinality(v_actions) = 0 THEN
    ctx.waiting_label := CASE
      WHEN v_has_request AND v_request.status = 'awaiting_step'
        THEN 'Aguardando ' || COALESCE(
          CASE WHEN v_has_step THEN v_step.step_name END,
          'responsável pela etapa'
        )
      WHEN v_has_request AND v_request.status = 'waiting_operational'
        THEN 'Aguardando envio de comprovantes pelo solicitante'
      WHEN v_has_request AND v_request.status = 'returned'
        THEN 'Aguardando correção do solicitante'
      WHEN v_entity_status IN ('concluido','pago','desligamento_concluido','arquivado')
        THEN 'Processo concluído'
      WHEN v_entity_status = 'cancelado' THEN 'Solicitação cancelada'
      WHEN v_entity_status = 'reprovado' THEN 'Solicitação reprovada'
      ELSE NULL
    END;
  END IF;

  RETURN ctx;
END
$function$;

-- Module-aware executor. The behavior is unchanged except that active request
-- lookup is isolated by module_id + reference_id.
CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key text,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_module text;
  v_module_id uuid;
  v_entity record;
  v_request public.approval_requests%ROWTYPE;
  v_step public.approval_request_steps%ROWTYPE;
  v_has_request boolean := false;
  v_master boolean;
  v_action text := lower(trim(p_action));
  v_notes text := NULLIF(trim(COALESCE(p_payload->>'notes','')), '');
  v_result jsonb;
  v_new_status text;
  v_admission_next text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;

  v_module := public._engine_module_norm(p_module_key);
  IF v_module IS NULL THEN
    RETURN jsonb_build_object('code','400','message','Módulo inválido');
  END IF;

  SELECT am.id
    INTO v_module_id
    FROM public.approval_modules am
   WHERE public._engine_module_norm(am.code) = v_module
     AND am.active
   ORDER BY am.created_at
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code','400','message','Módulo inativo ou não configurado');
  END IF;

  v_action := CASE v_action
    WHEN 'approve' THEN 'aprovar'
    WHEN 'reject' THEN 'rejeitar'
    WHEN 'return' THEN 'devolver'
    WHEN 'submit' THEN 'enviar'
    WHEN 'cancel' THEN 'cancelar'
    ELSE v_action
  END;

  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_config'));

  SELECT * INTO v_entity
    FROM public._engine_entity_read(v_module, p_entity_id, true);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  v_master := public.is_master(v_uid);
  IF NOT public._engine_can_view(
    v_module, p_entity_id, v_entity.requester_user_id, v_uid
  ) THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  SELECT ar.*
    INTO v_request
    FROM public.approval_requests ar
   WHERE ar.module_id = v_module_id
     AND ar.reference_id = p_entity_id
     AND ar.ended_at IS NULL
   ORDER BY ar.created_at DESC
   LIMIT 1;
  v_has_request := FOUND;

  IF v_has_request AND v_request.current_step_order IS NOT NULL THEN
    SELECT ars.* INTO v_step
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id
       AND ars.step_order = v_request.current_step_order
     LIMIT 1;
  END IF;

  IF v_action IN ('devolver','rejeitar')
     OR (
       v_has_request
       AND v_request.status = 'awaiting_step'
       AND v_action IN ('aprovar', COALESCE(v_step.completion_action,'aprovar'))
     ) THEN
    IF NOT v_has_request THEN
      RETURN jsonb_build_object('code','409','message','Nenhum fluxo ativo para esta solicitação');
    END IF;
    v_result := public.process_approval_action(v_request.id, v_action, v_notes);
    IF COALESCE((v_result->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('code','200','message','Ação processada','data', v_result);
    END IF;
    RETURN jsonb_build_object(
      'code', CASE v_result->>'error' WHEN 'CONFLICT' THEN '409' ELSE '400' END,
      'message', COALESCE(v_result->>'detail', v_result->>'error', 'Falha na ação'),
      'data', v_result
    );
  END IF;

  IF v_action = 'enviar' THEN
    IF v_uid IS DISTINCT FROM v_entity.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar');
    END IF;
    IF v_has_request AND v_request.status = 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Solicitação já está em aprovação');
    END IF;
    IF v_module = 'reembolso' AND NOT EXISTS (
      SELECT 1 FROM public.fuel_attachments fa WHERE fa.fuel_request_id = p_entity_id
    ) THEN
      RETURN jsonb_build_object('code','422','message','Anexe o comprovante antes de enviar o reembolso');
    END IF;
    v_result := public.start_approval_flow(v_module, p_entity_id, v_entity.requester_user_id);
    IF COALESCE(v_result->>'error','') <> '' THEN
      RETURN jsonb_build_object('code','422','message', v_result->>'error', 'data', v_result);
    END IF;
    RETURN jsonb_build_object('code','200','message','Solicitação enviada','data', v_result);
  END IF;

  IF v_action = 'enviar_comprovantes' THEN
    IF v_uid IS DISTINCT FROM v_entity.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar comprovantes');
    END IF;
    IF NOT v_has_request OR v_request.status NOT IN ('waiting_operational','returned') THEN
      RETURN jsonb_build_object('code','409','message','A solicitação não aguarda comprovantes');
    END IF;

    IF v_module = 'abastecimento' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.fuel_attachments
         WHERE fuel_request_id = p_entity_id AND type = 'hodometro'
      ) OR NOT EXISTS (
        SELECT 1 FROM public.fuel_attachments
         WHERE fuel_request_id = p_entity_id AND type = 'nota_fiscal'
      ) THEN
        RETURN jsonb_build_object('code','422','message','Envie a foto do hodômetro e a nota fiscal');
      END IF;
    ELSIF v_module = 'diaria' AND NOT EXISTS (
      SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id = p_entity_id
    ) THEN
      RETURN jsonb_build_object('code','422','message','Anexe ao menos um comprovante da diária');
    END IF;

    IF v_request.status = 'returned' THEN
      v_result := public._engine_reactivate_returned(v_request.id);
    ELSE
      v_result := public._engine_activate_next(v_request.id, v_request.current_step_order);
      IF NOT COALESCE((v_result->>'activated')::boolean, false) THEN
        UPDATE public.approval_requests
           SET status = 'completed',
               ended_at = now(),
               current_approver_user_id = NULL,
               updated_at = now()
         WHERE id = v_request.id;
      END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      v_uid,
      'ENGINE_V2_ENVIAR_COMPROVANTES',
      v_module,
      p_entity_id::text,
      jsonb_build_object('approval_request_id', v_request.id, 'result', v_result)
    );
    RETURN jsonb_build_object('code','200','message','Comprovantes enviados','data', v_result);
  END IF;

  IF v_action = 'cancelar' THEN
    IF v_uid IS DISTINCT FROM v_entity.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Sem permissão para cancelar');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Informe o motivo do cancelamento (mín. 10 caracteres)');
    END IF;
    IF v_entity.status IN (
      'pago','concluido','entregue','desligamento_concluido','cancelado','arquivado'
    ) THEN
      RETURN jsonb_build_object('code','409','message','Solicitação não pode mais ser cancelada');
    END IF;

    IF v_has_request THEN
      UPDATE public.approval_request_steps
         SET status = 'cancelled', action_at = now()
       WHERE approval_request_id = v_request.id
         AND status IN ('pending','waiting');
      UPDATE public.approval_requests
         SET status = 'cancelled',
             ended_at = now(),
             current_approver_user_id = NULL,
             updated_at = now()
       WHERE id = v_request.id;
    END IF;

    PERFORM public._update_entity_status(v_module, p_entity_id, 'cancelado');
    INSERT INTO public.status_history (
      module, entity_type, entity_id, from_status, to_status, changed_by
    ) VALUES (
      v_module, v_module, p_entity_id, v_entity.status, 'cancelado', v_uid
    );
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      v_uid,
      'ENGINE_V2_CANCELAR',
      v_module,
      p_entity_id::text,
      jsonb_build_object(
        'reason', v_notes,
        'approval_request_id', CASE WHEN v_has_request THEN v_request.id END
      )
    );
    RETURN jsonb_build_object('code','200','message','Solicitação cancelada');
  END IF;

  -- Admissões keeps its post-approval operational lifecycle.
  IF v_module = 'admissoes' AND v_action = 'avancar_etapa' THEN
    v_admission_next := NULLIF(trim(COALESCE(p_payload->>'to_status','')), '');
    IF v_admission_next IS NULL THEN
      RETURN jsonb_build_object('code','422','message','Informe a etapa de destino');
    END IF;
    IF v_admission_next NOT IN (
      'em_triagem','aguardando_documentos','documentos_em_analise',
      'aguardando_exame','exame_realizado','aguardando_registro',
      'registros_concluidos','concluido'
    ) THEN
      RETURN jsonb_build_object('code','400','message','Etapa operacional inválida');
    END IF;
    IF v_has_request AND v_request.status = 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Ação indisponível enquanto o fluxo está em andamento');
    END IF;
    v_result := public.admission_set_status(
      p_entity_id,
      v_admission_next::admission_status,
      v_notes,
      p_payload
    );
    IF COALESCE(v_result->>'error','') <> '' THEN
      RETURN jsonb_build_object('code','422','message', v_result->>'error', 'data', v_result);
    END IF;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      v_uid,
      'ENGINE_V2_AVANCAR_ETAPA',
      v_module,
      p_entity_id::text,
      jsonb_build_object('from', v_entity.status, 'to', v_admission_next)
    );
    RETURN jsonb_build_object('code','200','message','Etapa atualizada','data', v_result);
  END IF;

  IF v_has_request AND v_request.status IN ('awaiting_step','waiting_operational') THEN
    RETURN jsonb_build_object('code','409','message','Ação indisponível enquanto o fluxo está em andamento');
  END IF;

  IF v_module = 'compras' THEN
    IF v_action = 'gerar_oc' THEN
      IF v_entity.status <> 'aguardando_oc' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando OC');
      END IF;
      IF NULLIF(trim(COALESCE(p_payload->>'ocNumber','')),'') IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Informe o número da OC');
      END IF;
      UPDATE public.purchases
         SET purchase_number = p_payload->>'ocNumber',
             supplier = COALESCE(NULLIF(p_payload->>'supplier',''), supplier),
             approved_value = COALESCE(
               NULLIF(p_payload->>'approvedValue','')::numeric,
               approved_value
             ),
             status = 'aguardando_pagamento',
             updated_at = now()
       WHERE id = p_entity_id;
      v_new_status := 'aguardando_pagamento';
    ELSIF v_action = 'pagar' THEN
      IF v_entity.status <> 'aguardando_pagamento' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando pagamento');
      END IF;
      v_new_status := 'aguardando_entrega';
    ELSIF v_action = 'informar_entrega' THEN
      IF v_entity.status <> 'aguardando_entrega' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando entrega');
      END IF;
      v_new_status := 'entregue';
    ELSIF v_action = 'concluir' THEN
      IF v_entity.status <> 'entregue' THEN
        RETURN jsonb_build_object('code','409','message','Confirme a entrega antes de concluir');
      END IF;
      v_new_status := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_entity.status NOT IN ('aguardando_entrega','entregue') THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new_status := 'divergencia';
    END IF;
  ELSIF v_module = 'reembolso' THEN
    IF v_action = 'concluir' THEN
      IF v_entity.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Reembolso ainda não foi pago');
      END IF;
      v_new_status := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_entity.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new_status := 'em_revisao';
    END IF;
  END IF;

  IF v_new_status IS NULL THEN
    RETURN jsonb_build_object('code','400','message','Ação não permitida para este módulo/estado');
  END IF;

  IF v_action <> 'gerar_oc' THEN
    PERFORM public._update_entity_status(v_module, p_entity_id, v_new_status);
  END IF;

  INSERT INTO public.status_history (
    module, entity_type, entity_id, from_status, to_status, changed_by
  ) VALUES (
    v_module, v_module, p_entity_id, v_entity.status, v_new_status, v_uid
  );
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'ENGINE_V2_' || upper(v_action),
    v_module,
    p_entity_id::text,
    jsonb_build_object('from', v_entity.status, 'to', v_new_status, 'payload', p_payload)
  );

  RETURN jsonb_build_object(
    'code','200',
    'message','Ação executada',
    'data', jsonb_build_object('status', v_new_status)
  );
END
$function$;

-- Fix the permissions cache array construction without implicit text -> uuid[] casts.
CREATE OR REPLACE FUNCTION public.rebuild_user_permissions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id uuid;
  v_role_ids uuid[] := ARRAY[]::uuid[];
  v_current_id uuid;
  v_is_master boolean;
  v_depth integer := 0;
BEGIN
  DELETE FROM public.user_effective_permissions WHERE user_id = p_user_id;

  SELECT ura.role_id INTO v_role_id
    FROM public.user_role_assignments ura
   WHERE ura.user_id = p_user_id
   LIMIT 1;
  IF v_role_id IS NULL THEN RETURN; END IF;

  SELECT r.is_master INTO v_is_master FROM public.roles r WHERE r.id = v_role_id;
  IF v_is_master THEN
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, pm.id, pa.id, true
      FROM public.permission_modules pm
      CROSS JOIN public.permission_actions pa
     WHERE pm.active AND pa.active
    ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = true;
    RETURN;
  END IF;

  v_current_id := v_role_id;
  WHILE v_current_id IS NOT NULL AND v_depth < 20 LOOP
    v_role_ids := array_append(v_role_ids, v_current_id);
    SELECT r.parent_role_id INTO v_current_id FROM public.roles r WHERE r.id = v_current_id;
    v_depth := v_depth + 1;
  END LOOP;

  SELECT array_agg(x.role_id ORDER BY x.ordinality DESC)
    INTO v_role_ids
    FROM unnest(v_role_ids) WITH ORDINALITY AS x(role_id, ordinality);

  FOREACH v_current_id IN ARRAY v_role_ids LOOP
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, rpm.module_id, rpm.action_id, rpm.allowed
      FROM public.role_permission_matrix rpm
     WHERE rpm.role_id = v_current_id
    ON CONFLICT (user_id, module_id, action_id)
    DO UPDATE SET allowed = EXCLUDED.allowed;
  END LOOP;

  INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
  SELECT p_user_id, upo.module_id, upo.action_id, upo.allowed
    FROM public.user_permission_overrides upo
   WHERE upo.user_id = p_user_id
  ON CONFLICT (user_id, module_id, action_id)
  DO UPDATE SET allowed = EXCLUDED.allowed;
END
$function$;

-- Remove the unused declaration reported by plpgsql_check; behavior is unchanged.
CREATE OR REPLACE FUNCTION public.admin_purge_test_data(
  _scope text,
  _confirm boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_master boolean;
  v_fuel_ids uuid[];
  v_admission_ids uuid[];
  v_candidate_ids uuid[];
  v_approval_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
     WHERE ura.user_id = v_uid AND r.is_master
  ) INTO v_is_master;

  IF NOT v_is_master THEN
    RETURN jsonb_build_object('error', 'Apenas usuário Master pode executar limpeza de dados');
  END IF;
  IF _scope NOT IN ('SOLICITACOES', 'ADMISSOES', 'ALL_TEST') THEN
    RETURN jsonb_build_object('error', 'Escopo inválido. Use: SOLICITACOES, ADMISSOES ou ALL_TEST');
  END IF;

  IF _scope IN ('SOLICITACOES', 'ALL_TEST') THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_fuel_ids FROM public.fuel_requests;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO v_approval_ids
      FROM public.approval_requests
     WHERE reference_id = ANY(v_fuel_ids);

    v_counts := v_counts || jsonb_build_object(
      'fuel_attachments', (SELECT count(*) FROM public.fuel_attachments WHERE fuel_request_id = ANY(v_fuel_ids)),
      'fuel_reviews', (SELECT count(*) FROM public.fuel_reviews WHERE fuel_request_id = ANY(v_fuel_ids)),
      'approval_history', (SELECT count(*) FROM public.approval_history WHERE approval_request_id = ANY(v_approval_ids)),
      'approval_request_steps', (SELECT count(*) FROM public.approval_request_steps WHERE approval_request_id = ANY(v_approval_ids)),
      'approval_requests', cardinality(v_approval_ids),
      'fuel_requests', cardinality(v_fuel_ids)
    );

    IF _confirm THEN
      DELETE FROM public.approval_history WHERE approval_request_id = ANY(v_approval_ids);
      DELETE FROM public.approval_request_steps WHERE approval_request_id = ANY(v_approval_ids);
      DELETE FROM public.approval_requests WHERE id = ANY(v_approval_ids);
      DELETE FROM public.fuel_attachments WHERE fuel_request_id = ANY(v_fuel_ids);
      DELETE FROM public.fuel_reviews WHERE fuel_request_id = ANY(v_fuel_ids);
      DELETE FROM public.status_history WHERE module = 'fleet';
      DELETE FROM public.notifications WHERE metadata->>'entity_type' IN ('fuel_requests', 'approval_request');
      DELETE FROM public.fuel_requests WHERE id = ANY(v_fuel_ids);
    END IF;
  END IF;

  IF _scope IN ('ADMISSOES', 'ALL_TEST') THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO v_admission_ids FROM public.admission_requests;
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO v_candidate_ids
      FROM public.candidates
     WHERE admission_request_id = ANY(v_admission_ids);

    IF _confirm THEN
      DELETE FROM public.document_reviews
       WHERE candidate_document_id IN (
         SELECT id FROM public.candidate_documents WHERE candidate_id = ANY(v_candidate_ids)
       );
      DELETE FROM public.candidate_documents WHERE candidate_id = ANY(v_candidate_ids);
      DELETE FROM public.medical_exams WHERE candidate_id = ANY(v_candidate_ids);
      DELETE FROM public.system_registrations WHERE candidate_id = ANY(v_candidate_ids);
      DELETE FROM public.public_tokens WHERE candidate_id = ANY(v_candidate_ids);
      DELETE FROM public.admission_files WHERE admission_request_id = ANY(v_admission_ids);
      DELETE FROM public.admission_public_links WHERE admission_request_id = ANY(v_admission_ids);
      DELETE FROM public.candidates WHERE admission_request_id = ANY(v_admission_ids);
      DELETE FROM public.status_history WHERE module = 'admissions';
      DELETE FROM public.notifications WHERE metadata->>'entity_type' = 'admission_requests';
      DELETE FROM public.admission_requests WHERE id = ANY(v_admission_ids);
    END IF;
  END IF;

  IF _confirm THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      v_uid,
      'purge_test_data',
      'system',
      _scope,
      jsonb_build_object('scope', _scope, 'counts', v_counts, 'confirmed', true, 'is_master', true)
    );
  END IF;

  RETURN jsonb_build_object('preview', NOT _confirm, 'scope', _scope, 'counts', v_counts);
END
$function$;

-- The UUID-only overload predates the module-aware V2 entry point and is not
-- referenced by the frontend or the V1 compatibility engine.
DROP FUNCTION IF EXISTS public.execute_entity_action(uuid, text, text, jsonb);

-- Public RPC contract: three authenticated entry points. Engine helpers stay private.
REVOKE ALL ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_entity_action_context(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;

REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_approval_action(uuid, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public._engine_entity_read(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_can_view(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
