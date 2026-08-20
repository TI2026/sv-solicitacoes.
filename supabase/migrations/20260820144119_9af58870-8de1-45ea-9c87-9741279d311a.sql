-- ============================================================
-- MOTOR DE APROVAÇÃO V2 — ONDA C — parte 2
-- ============================================================

DO $do$
DECLARE d text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='_engine_process_v1' AND pronamespace='public'::regnamespace) THEN
    SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
     WHERE proname='process_approval_action' AND pronamespace='public'::regnamespace;
    EXECUTE replace(d, 'FUNCTION public.process_approval_action(', 'FUNCTION public._engine_process_v1(');
  END IF;
END
$do$;

REVOKE ALL ON FUNCTION public._engine_process_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_approval_action(
  p_approval_request_id uuid, p_action text, p_comments text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_ver    text;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_config'));

  SELECT flow_version INTO v_ver
  FROM public.approval_request_steps
  WHERE approval_request_id = p_approval_request_id
  ORDER BY step_order LIMIT 1;

  IF COALESCE(v_ver, 'v1') <> 'v2' THEN
    RETURN public._engine_process_v1(p_approval_request_id, p_action, p_comments);
  END IF;

  v_action := CASE lower(p_action)
                WHEN 'approve' THEN 'aprovar'
                WHEN 'reject'  THEN 'rejeitar'
                WHEN 'return'  THEN 'devolver'
                ELSE lower(p_action) END;

  IF v_action = 'aprovar' THEN
    SELECT COALESCE(ars.completion_action, 'aprovar') INTO v_action
    FROM public.approval_requests ar
    JOIN public.approval_request_steps ars
      ON ars.approval_request_id = ar.id AND ars.step_order = ar.current_step_order
    WHERE ar.id = p_approval_request_id;
  END IF;

  RETURN public._engine_process_v2(p_approval_request_id, v_action, p_comments, v_uid);
END $$;

REVOKE ALL ON FUNCTION public.process_approval_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_approval_action(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public._engine_sla_sweep()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD; v_reassigned int := 0; v_overdue int := 0;
BEGIN
  FOR r IN
    SELECT ars.*, ar.requester_user_id, ar.reference_id
    FROM public.approval_request_steps ars
    JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
    WHERE ars.status = 'pending'
      AND ars.flow_version = 'v2'
      AND ars.sla_deadline IS NOT NULL
      AND ars.sla_deadline < now()
      AND ar.status = 'awaiting_step'
    FOR UPDATE OF ars
  LOOP
    IF r.escalated_at IS NULL
       AND r.substitute_user_id IS NOT NULL
       AND r.substitute_user_id IS DISTINCT FROM r.approver_user_id
       AND r.substitute_user_id IS DISTINCT FROM r.requester_user_id
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.substitute_user_id AND p.active)
    THEN
      UPDATE public.approval_request_steps
         SET approver_user_id = r.substitute_user_id, escalated_at = now(),
             sla_deadline = CASE WHEN COALESCE(sla_hours,0) > 0
                                 THEN now() + make_interval(hours => sla_hours) END
       WHERE id = r.id;
      UPDATE public.approval_requests
         SET current_approver_user_id = r.substitute_user_id, updated_at = now()
       WHERE id = r.approval_request_id;

      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (r.substitute_user_id, 'Aprovação reatribuída por prazo',
              'Uma etapa vencida foi reatribuída a você.',
              jsonb_build_object('type','approval_sla_reassigned','approval_request_id', r.approval_request_id));
      v_reassigned := v_reassigned + 1;

    ELSIF NOT r.overdue THEN
      UPDATE public.approval_request_steps SET overdue = true WHERE id = r.id;
      INSERT INTO public.notifications (user_id, title, message, metadata)
      SELECT p.id, 'Etapa de aprovação vencida',
             'Uma etapa ultrapassou o prazo e continua pendente.',
             jsonb_build_object('type','approval_sla_overdue','approval_request_id', r.approval_request_id)
      FROM public.profiles p
      WHERE p.active AND public.is_master(p.id);
      v_overdue := v_overdue + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('reassigned', v_reassigned, 'overdue', v_overdue);
END $$;

REVOKE ALL ON FUNCTION public._engine_sla_sweep() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF public.approval_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT ar.* FROM public.approval_requests ar
  WHERE ar.current_approver_user_id = auth.uid()
    AND ar.ended_at IS NULL
    AND (ar.status = 'awaiting_step' OR ar.status LIKE 'awaiting_step_%')
  ORDER BY ar.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public._engine_reactivate_returned(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req RECORD; v_step RECORD; v_actor uuid; v_mod text; v_entry text;
BEGIN
  SELECT ar.*, am.code AS module_code INTO v_req
  FROM public.approval_requests ar
  JOIN public.approval_modules am ON am.id = ar.module_id
  WHERE ar.id = p_request_id FOR UPDATE OF ar;
  v_mod := public._engine_module_norm(v_req.module_code);

  SELECT * INTO v_step FROM public.approval_request_steps
  WHERE approval_request_id = p_request_id AND step_order = v_req.current_step_order
  FOR UPDATE;

  v_actor := public._engine_pick_actor(v_step.approver_user_id, v_step.primary_user_id,
                                       v_step.substitute_user_id, v_req.requester_user_id);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NO_ELIGIBLE_APPROVER'; END IF;

  UPDATE public.approval_request_steps
     SET status='pending', approver_user_id=v_actor, activated_at=now(), action_at=NULL,
         escalated_at=NULL, overdue=false,
         sla_deadline = CASE WHEN COALESCE(sla_hours,0) > 0 THEN now() + make_interval(hours => sla_hours) END
   WHERE id = v_step.id;

  UPDATE public.approval_requests
     SET status='awaiting_step', current_approver_user_id=v_actor, ended_at=NULL, updated_at=now()
   WHERE id = p_request_id;

  SELECT entity_status_on_entry INTO v_entry
  FROM public.approval_flow_steps WHERE id = v_step.flow_step_id;
  IF v_entry IS NOT NULL THEN
    PERFORM public._update_entity_status(v_mod, v_req.reference_id, v_entry);
  END IF;

  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (v_actor, 'Solicitação reenviada para sua análise',
          'O solicitante reenviou a etapa ' || COALESCE(v_step.step_name, v_step.step_order::text) || '.',
          jsonb_build_object('type','approval_resubmitted','approval_request_id', p_request_id,
                             'entity_id', v_req.reference_id, 'entity_type', v_mod));

  RETURN jsonb_build_object('activated', true, 'step_order', v_step.step_order, 'approver_user_id', v_actor);
END $$;

REVOKE ALL ON FUNCTION public._engine_reactivate_returned(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key text, p_entity_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_mod      text;
  v_ent      RECORD;
  v_req      RECORD;
  v_step     RECORD;
  v_master   boolean;
  v_action   text := lower(trim(p_action));
  v_notes    text := NULLIF(trim(COALESCE(p_payload->>'notes','')), '');
  v_res      jsonb;
  v_new      text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('code','401','message','Não autenticado'); END IF;

  v_mod := public._engine_module_norm(p_module_key);
  IF v_mod IS NULL THEN RETURN jsonb_build_object('code','400','message','Módulo inválido'); END IF;

  v_action := CASE v_action WHEN 'approve' THEN 'aprovar' WHEN 'reject' THEN 'rejeitar'
                            WHEN 'return' THEN 'devolver' WHEN 'submit' THEN 'enviar'
                            WHEN 'cancel' THEN 'cancelar' ELSE v_action END;

  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_config'));

  SELECT * INTO v_ent FROM public._engine_entity_read(v_mod, p_entity_id, true);
  IF v_ent.requester_user_id IS NULL AND v_ent.status IS NULL THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  v_master := public.is_master(v_uid);

  IF NOT public._engine_can_view(v_mod, p_entity_id, v_ent.requester_user_id, v_uid) THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  SELECT ar.* INTO v_req FROM public.approval_requests ar
  WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL
  ORDER BY ar.created_at DESC LIMIT 1;

  IF v_req.id IS NOT NULL THEN
    SELECT * INTO v_step FROM public.approval_request_steps
    WHERE approval_request_id = v_req.id AND step_order = v_req.current_step_order;
  END IF;

  IF v_action IN ('devolver','rejeitar')
     OR (v_req.id IS NOT NULL AND v_req.status = 'awaiting_step'
         AND v_action IN ('aprovar', COALESCE(v_step.completion_action,'aprovar'))) THEN
    IF v_req.id IS NULL THEN
      RETURN jsonb_build_object('code','409','message','Nenhum fluxo ativo para esta solicitação');
    END IF;
    v_res := public.process_approval_action(v_req.id, v_action, v_notes);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('code','200','message','Ação processada','data', v_res);
    END IF;
    RETURN jsonb_build_object('code', CASE v_res->>'error' WHEN 'CONFLICT' THEN '409' ELSE '400' END,
                              'message', COALESCE(v_res->>'detail', v_res->>'error', 'Falha na ação'),
                              'data', v_res);
  END IF;

  IF v_action = 'enviar' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar');
    END IF;
    IF v_req.id IS NOT NULL AND v_req.status = 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Solicitação já está em aprovação');
    END IF;
    IF v_mod = 'reembolso' AND NOT EXISTS (
      SELECT 1 FROM public.fuel_attachments fa WHERE fa.fuel_request_id = p_entity_id
    ) THEN
      RETURN jsonb_build_object('code','422','message','Anexe o comprovante antes de enviar o reembolso');
    END IF;
    v_res := public.start_approval_flow(v_mod, p_entity_id, v_ent.requester_user_id);
    IF COALESCE(v_res->>'error','') <> '' THEN
      RETURN jsonb_build_object('code','422','message', v_res->>'error', 'data', v_res);
    END IF;
    RETURN jsonb_build_object('code','200','message','Solicitação enviada','data', v_res);
  END IF;

  IF v_action = 'enviar_comprovantes' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar comprovantes');
    END IF;
    IF v_req.id IS NULL OR v_req.status NOT IN ('waiting_operational','returned') THEN
      RETURN jsonb_build_object('code','409','message','A solicitação não aguarda comprovantes');
    END IF;

    IF v_mod = 'abastecimento' THEN
      IF NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id AND type='hodometro')
         OR NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id AND type='nota_fiscal') THEN
        RETURN jsonb_build_object('code','422','message','Envie a foto do hodômetro e a nota fiscal');
      END IF;
    ELSIF v_mod = 'diaria' THEN
      IF NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id) THEN
        RETURN jsonb_build_object('code','422','message','Anexe ao menos um comprovante da diária');
      END IF;
    END IF;

    IF v_req.status = 'returned' THEN
      v_res := public._engine_reactivate_returned(v_req.id);
    ELSE
      v_res := public._engine_activate_next(v_req.id, v_req.current_step_order);
      IF NOT COALESCE((v_res->>'activated')::boolean, false) THEN
        UPDATE public.approval_requests SET status='completed', ended_at=now(),
               current_approver_user_id=NULL, updated_at=now() WHERE id = v_req.id;
      END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENGINE_V2_ENVIAR_COMPROVANTES', v_mod, p_entity_id::text,
            jsonb_build_object('approval_request_id', v_req.id, 'result', v_res));
    RETURN jsonb_build_object('code','200','message','Comprovantes enviados','data', v_res);
  END IF;

  IF v_action = 'cancelar' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Sem permissão para cancelar');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Informe o motivo do cancelamento (mín. 10 caracteres)');
    END IF;
    IF v_ent.status IN ('pago','concluido','entregue','desligamento_concluido','cancelado','arquivado') THEN
      RETURN jsonb_build_object('code','409','message','Solicitação não pode mais ser cancelada');
    END IF;

    IF v_req.id IS NOT NULL THEN
      UPDATE public.approval_request_steps
         SET status='cancelled', action_at=now()
       WHERE approval_request_id = v_req.id AND status IN ('pending','waiting');
      UPDATE public.approval_requests
         SET status='cancelled', ended_at=now(), current_approver_user_id=NULL, updated_at=now()
       WHERE id = v_req.id;
    END IF;

    PERFORM public._update_entity_status(v_mod, p_entity_id, 'cancelado');
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_mod, v_mod, p_entity_id, v_ent.status, 'cancelado', v_uid);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENGINE_V2_CANCELAR', v_mod, p_entity_id::text,
            jsonb_build_object('reason', v_notes, 'approval_request_id', v_req.id));
    RETURN jsonb_build_object('code','200','message','Solicitação cancelada');
  END IF;

  IF v_req.id IS NOT NULL AND v_req.status IN ('awaiting_step','waiting_operational') THEN
    RETURN jsonb_build_object('code','409','message','Ação indisponível enquanto o fluxo está em andamento');
  END IF;

  IF v_mod = 'compras' THEN
    IF v_action = 'gerar_oc' THEN
      IF v_ent.status <> 'aguardando_oc' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando OC');
      END IF;
      IF NULLIF(trim(COALESCE(p_payload->>'ocNumber','')),'') IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Informe o número da OC');
      END IF;
      UPDATE public.purchases
         SET purchase_number = p_payload->>'ocNumber',
             supplier        = COALESCE(NULLIF(p_payload->>'supplier',''), supplier),
             approved_value  = COALESCE(NULLIF(p_payload->>'approvedValue','')::numeric, approved_value),
             status = 'aguardando_pagamento', updated_at = now()
       WHERE id = p_entity_id;
      v_new := 'aguardando_pagamento';
    ELSIF v_action = 'pagar' THEN
      IF v_ent.status <> 'aguardando_pagamento' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando pagamento');
      END IF;
      v_new := 'aguardando_entrega';
    ELSIF v_action = 'informar_entrega' THEN
      IF v_ent.status <> 'aguardando_entrega' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando entrega');
      END IF;
      v_new := 'entregue';
    ELSIF v_action = 'concluir' THEN
      IF v_ent.status <> 'entregue' THEN
        RETURN jsonb_build_object('code','409','message','Confirme a entrega antes de concluir');
      END IF;
      v_new := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_ent.status NOT IN ('aguardando_entrega','entregue') THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new := 'divergencia';
    END IF;

  ELSIF v_mod = 'reembolso' THEN
    IF v_action = 'concluir' THEN
      IF v_ent.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Reembolso ainda não foi pago');
      END IF;
      v_new := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_ent.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new := 'em_revisao';
    END IF;
  END IF;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('code','400','message','Ação não permitida para este módulo/estado');
  END IF;

  IF v_action <> 'gerar_oc' THEN
    PERFORM public._update_entity_status(v_mod, p_entity_id, v_new);
  END IF;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES (v_mod, v_mod, p_entity_id, v_ent.status, v_new, v_uid);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'ENGINE_V2_' || upper(v_action), v_mod, p_entity_id::text,
          jsonb_build_object('from', v_ent.status, 'to', v_new, 'payload', p_payload));

  RETURN jsonb_build_object('code','200','message','Ação executada','data',
                            jsonb_build_object('status', v_new));
END $$;

REVOKE ALL ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_entity_action_context(p_module_key text, p_entity_id uuid)
RETURNS public.entity_action_context
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  ctx      public.entity_action_context;
  v_uid    uuid := auth.uid();
  v_mod    text;
  v_ent    RECORD;
  v_req    RECORD;
  v_step   RECORD;
  v_next   RECORD;
  v_master boolean;
  v_acts   text[] := '{}';
  v_block  text[] := '{}';
  v_is_req boolean;
BEGIN
  v_mod := public._engine_module_norm(p_module_key);
  IF v_mod IS NULL OR v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_ent FROM public._engine_entity_read(v_mod, p_entity_id, false);
  IF v_ent.status IS NULL AND v_ent.requester_user_id IS NULL THEN RETURN NULL; END IF;

  IF NOT public._engine_can_view(v_mod, p_entity_id, v_ent.requester_user_id, v_uid) THEN
    RETURN NULL;
  END IF;

  v_master := public.is_master(v_uid);
  v_is_req := (v_uid = v_ent.requester_user_id);

  SELECT ar.* INTO v_req FROM public.approval_requests ar
  WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL
  ORDER BY ar.created_at DESC LIMIT 1;

  IF v_req.id IS NOT NULL THEN
    SELECT * INTO v_step FROM public.approval_request_steps
    WHERE approval_request_id = v_req.id AND step_order = v_req.current_step_order;
    SELECT * INTO v_next FROM public.approval_request_steps
    WHERE approval_request_id = v_req.id AND step_order > COALESCE(v_req.current_step_order,0)
    ORDER BY step_order LIMIT 1;
  END IF;

  ctx.module_key               := v_mod;
  ctx.entity_id                := p_entity_id;
  ctx.current_status           := v_ent.status;
  ctx.requester_user_id        := v_ent.requester_user_id;
  ctx.approval_request_id      := v_req.id;
  ctx.flow_id                  := v_req.flow_id;
  ctx.flow_version             := COALESCE(v_step.flow_version, 'v1');
  ctx.current_step             := v_step.step_name;
  ctx.current_step_name        := v_step.step_name;
  ctx.current_step_code        := v_step.step_code;
  ctx.current_step_kind        := v_step.step_kind;
  ctx.current_step_order       := v_req.current_step_order;
  ctx.current_approver_user_id := v_req.current_approver_user_id;
  ctx.next_step                := v_next.step_name;
  ctx.next_step_name           := v_next.step_name;
  ctx.next_step_code           := v_next.step_code;
  ctx.next_step_order          := v_next.step_order;
  ctx.next_responsible_rule    := v_next.assignment_mode;
  ctx.sla_deadline             := v_step.sla_deadline;
  ctx.overdue                  := COALESCE(v_step.overdue, false);
  ctx.is_current_actor         := (v_req.current_approver_user_id = v_uid);
  ctx.can_edit                 := (v_is_req AND v_ent.status IN ('rascunho','retornado'));

  IF v_req.id IS NOT NULL AND v_req.status = 'awaiting_step'
     AND (v_req.current_approver_user_id = v_uid OR v_master) THEN
    v_acts := v_acts || COALESCE(v_step.completion_action, 'aprovar') || 'devolver' || 'rejeitar';
    IF v_req.current_approver_user_id IS DISTINCT FROM v_uid THEN
      v_block := v_block || 'master_override';
    END IF;
  ELSIF v_req.id IS NOT NULL AND v_req.status = 'awaiting_step' THEN
    v_block := v_block || ('Aguardando ' || COALESCE(v_step.step_name, 'etapa ' || v_req.current_step_order));
  END IF;

  IF v_is_req OR v_master THEN
    IF v_ent.status IN ('rascunho','retornado')
       AND (v_req.id IS NULL OR v_req.status IN ('returned','draft')) THEN
      v_acts := v_acts || 'enviar';
    END IF;
    IF v_req.id IS NOT NULL AND v_req.status = 'waiting_operational' THEN
      v_acts := v_acts || 'enviar_comprovantes';
    ELSIF v_req.id IS NOT NULL AND v_req.status = 'returned' AND v_mod IN ('abastecimento','diaria') THEN
      v_acts := v_acts || 'enviar_comprovantes';
    END IF;
    IF v_ent.status NOT IN ('pago','concluido','entregue','desligamento_concluido','cancelado','arquivado') THEN
      v_acts := v_acts || 'cancelar';
    END IF;
  END IF;

  IF v_req.id IS NULL OR v_req.status NOT IN ('awaiting_step','waiting_operational') THEN
    IF v_mod = 'compras' AND (v_master OR v_is_req
        OR public.has_role(v_uid,'financeiro'::app_role) OR public.has_role(v_uid,'compras'::app_role)
        OR public.has_role(v_uid,'administrativo'::app_role) OR public.has_role(v_uid,'diretoria'::app_role)) THEN
      v_acts := v_acts || CASE v_ent.status
                            WHEN 'aguardando_oc'        THEN ARRAY['gerar_oc']
                            WHEN 'aguardando_pagamento' THEN ARRAY['pagar']
                            WHEN 'aguardando_entrega'   THEN ARRAY['informar_entrega','relatar_divergencia']
                            WHEN 'entregue'             THEN ARRAY['concluir','relatar_divergencia']
                            ELSE '{}'::text[] END;
    ELSIF v_mod = 'reembolso' AND v_ent.status = 'pago' AND (v_is_req OR v_master) THEN
      v_acts := v_acts || ARRAY['concluir','relatar_divergencia'];
    END IF;
  END IF;

  SELECT ARRAY(SELECT DISTINCT unnest(v_acts)) INTO v_acts;
  ctx.allowed_actions  := to_jsonb(v_acts);
  ctx.blocked_reasons  := v_block;
  RETURN ctx;
END $$;

REVOKE ALL ON FUNCTION public.get_entity_action_context(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(text, uuid) TO authenticated;