-- ── Sprint Final 1 — Onda H: Action Context completo (sem placeholders) ──

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
                 JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='entity_action_context'
                   AND a.attname='total_steps' AND a.attnum>0) THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE total_steps integer CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
                 JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='entity_action_context'
                   AND a.attname='requester_name' AND a.attnum>0) THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE requester_name text CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
                 JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='entity_action_context'
                   AND a.attname='current_approver_name' AND a.attnum>0) THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE current_approver_name text CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
                 JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='entity_action_context'
                   AND a.attname='waiting_label' AND a.attnum>0) THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE waiting_label text CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_entity_action_context(p_module_key text, p_entity_id uuid)
 RETURNS entity_action_context
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ── Total real de etapas: snapshot da request; fallback no template do flow ──
  IF v_req.id IS NOT NULL THEN
    SELECT count(*)::int INTO ctx.total_steps
    FROM public.approval_request_steps WHERE approval_request_id = v_req.id;
  END IF;
  IF COALESCE(ctx.total_steps,0) = 0 AND v_req.flow_id IS NOT NULL THEN
    SELECT count(*)::int INTO ctx.total_steps
    FROM public.approval_flow_steps WHERE flow_id = v_req.flow_id;
  END IF;

  -- ── Nomes reais (fonte curada: profiles) ──
  SELECT p.full_name INTO ctx.requester_name
  FROM public.profiles p WHERE p.id = v_ent.requester_user_id;
  IF v_req.current_approver_user_id IS NOT NULL THEN
    SELECT p.full_name INTO ctx.current_approver_name
    FROM public.profiles p WHERE p.id = v_req.current_approver_user_id;
  END IF;

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

  -- ── Rótulo informativo de espera (UX: nunca tela vazia) ──
  IF array_length(v_acts,1) IS NULL OR array_length(v_acts,1) = 0 THEN
    ctx.waiting_label := CASE
      WHEN v_req.id IS NOT NULL AND v_req.status = 'awaiting_step'
        THEN 'Aguardando ' || COALESCE(v_step.step_name, 'responsável pela etapa')
      WHEN v_req.id IS NOT NULL AND v_req.status = 'waiting_operational'
        THEN 'Aguardando envio de comprovantes pelo solicitante'
      WHEN v_req.id IS NOT NULL AND v_req.status = 'returned'
        THEN 'Aguardando correção do solicitante'
      WHEN v_ent.status IN ('concluido','pago','desligamento_concluido','arquivado')
        THEN 'Processo concluído'
      WHEN v_ent.status = 'cancelado' THEN 'Solicitação cancelada'
      WHEN v_ent.status = 'reprovado' THEN 'Solicitação reprovada'
      ELSE NULL END;
  END IF;

  RETURN ctx;
END $function$;

-- ── Realtime publication (idempotente, apenas o que falta) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'approval_requests','approval_request_steps','notifications',
    'status_history','purchases','fuel_requests',
    'admission_requests','termination_requests'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=t AND c.relkind='r')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;