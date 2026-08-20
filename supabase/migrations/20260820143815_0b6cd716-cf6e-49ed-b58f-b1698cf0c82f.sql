-- ============================================================
-- MOTOR DE APROVAÇÃO V2 — ONDA C (núcleo funcional) — parte 1
-- ============================================================

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='approval_request_id') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE approval_request_id uuid CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='flow_id') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE flow_id uuid CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='current_step_code') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE current_step_code text CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='current_step_kind') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE current_step_kind text CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='next_step_code') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE next_step_code text CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.typrelid=a.attrelid
                 WHERE t.typname='entity_action_context' AND a.attname='can_edit') THEN
    ALTER TYPE public.entity_action_context ADD ATTRIBUTE can_edit boolean CASCADE;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public._engine_module_norm(p_module text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_module
    WHEN 'compras' THEN 'compras'
    WHEN 'purchases' THEN 'compras'
    WHEN 'abastecimento' THEN 'abastecimento'
    WHEN 'diaria' THEN 'diaria'
    WHEN 'reembolso' THEN 'reembolso'
    WHEN 'admissoes' THEN 'admissoes'
    WHEN 'admissions' THEN 'admissoes'
    WHEN 'desligamentos' THEN 'desligamentos'
    WHEN 'terminations' THEN 'desligamentos'
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public._engine_entity_read(p_module text, p_entity_id uuid, p_lock boolean DEFAULT false)
RETURNS TABLE(status text, requester_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tbl text; v_disc text; v_sql text;
BEGIN
  CASE public._engine_module_norm(p_module)
    WHEN 'compras'       THEN v_tbl := 'purchases';
    WHEN 'abastecimento' THEN v_tbl := 'fuel_requests'; v_disc := 'abastecimento';
    WHEN 'diaria'        THEN v_tbl := 'fuel_requests'; v_disc := 'diaria';
    WHEN 'reembolso'     THEN v_tbl := 'fuel_requests'; v_disc := 'reembolso';
    WHEN 'admissoes'     THEN v_tbl := 'admission_requests';
    WHEN 'desligamentos' THEN v_tbl := 'termination_requests';
    ELSE RETURN;
  END CASE;

  v_sql := format('SELECT status::text, requester_user_id FROM public.%I WHERE id = $1 %s %s',
                  v_tbl,
                  CASE WHEN v_disc IS NOT NULL THEN 'AND type::text = $2' ELSE '' END,
                  CASE WHEN p_lock THEN 'FOR UPDATE' ELSE '' END);

  IF v_disc IS NOT NULL THEN
    RETURN QUERY EXECUTE v_sql USING p_entity_id, v_disc;
  ELSE
    RETURN QUERY EXECUTE v_sql USING p_entity_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._engine_pick_actor(p_current uuid, p_primary uuid, p_substitute uuid, p_requester uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT c.x FROM (
      SELECT p_current AS x, 1 AS o
      UNION ALL SELECT p_primary, 2
      UNION ALL SELECT p_substitute, 3
  ) c
  WHERE c.x IS NOT NULL
    AND c.x IS DISTINCT FROM p_requester
    AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = c.x AND pr.active)
  ORDER BY c.o LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._engine_can_view(p_module text, p_entity_id uuid, p_requester uuid, p_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF p_uid = p_requester THEN RETURN true; END IF;
  IF public.is_master(p_uid) THEN RETURN true; END IF;
  IF public.has_role(p_uid, 'diretoria'::app_role)
     OR public.has_role(p_uid, 'administrativo'::app_role) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.approval_requests ar
    JOIN public.approval_request_steps ars ON ars.approval_request_id = ar.id
    WHERE ar.reference_id = p_entity_id
      AND (ars.approver_user_id = p_uid
           OR ars.primary_user_id = p_uid
           OR ars.substitute_user_id = p_uid
           OR ar.current_approver_user_id = p_uid)
  ) THEN RETURN true; END IF;

  IF p_module IN ('abastecimento','diaria','reembolso') AND EXISTS (
    SELECT 1 FROM public.fuel_requests f
    WHERE f.id = p_entity_id AND (f.assigned_to_user_id = p_uid OR f.reviewed_by = p_uid)
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.sectors s ON s.id = p.sector_id AND s.active
    WHERE p.id = p_requester AND (s.responsible_user_id = p_uid OR s.substitute_user_id = p_uid)
  ) THEN RETURN true; END IF;

  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public._engine_entity_read(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_can_view(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_pick_actor(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_module_norm(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._engine_activate_next(p_request_id uuid, p_from_order int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_req   RECORD;
  v_next  RECORD;
  v_actor uuid;
  v_mod   text;
  v_entry text;
BEGIN
  SELECT ar.*, am.code AS module_code INTO v_req
  FROM public.approval_requests ar
  JOIN public.approval_modules am ON am.id = ar.module_id
  WHERE ar.id = p_request_id;
  v_mod := public._engine_module_norm(v_req.module_code);

  SELECT * INTO v_next
  FROM public.approval_request_steps
  WHERE approval_request_id = p_request_id
    AND step_order > p_from_order
  ORDER BY step_order
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  v_actor := public._engine_pick_actor(v_next.approver_user_id, v_next.primary_user_id,
                                       v_next.substitute_user_id, v_req.requester_user_id);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_NO_ELIGIBLE_APPROVER';
  END IF;

  UPDATE public.approval_request_steps
     SET status = 'pending',
         approver_user_id = v_actor,
         activated_at = now(),
         escalated_at = NULL,
         overdue = false,
         action_at = NULL,
         sla_deadline = CASE WHEN COALESCE(sla_hours,0) > 0
                             THEN now() + make_interval(hours => sla_hours) END
   WHERE id = v_next.id;

  UPDATE public.approval_requests
     SET status = 'awaiting_step',
         current_step_order = v_next.step_order,
         current_approver_user_id = v_actor,
         ended_at = NULL,
         updated_at = now()
   WHERE id = p_request_id;

  SELECT afs.entity_status_on_entry INTO v_entry
  FROM public.approval_flow_steps afs WHERE afs.id = v_next.flow_step_id;
  IF v_entry IS NOT NULL THEN
    PERFORM public._update_entity_status(v_mod, v_req.reference_id, v_entry);
  END IF;

  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (v_actor,
          'Aprovação pendente — ' || COALESCE(v_next.step_name, 'Etapa ' || v_next.step_order),
          'Uma solicitação avançou para sua etapa (' || UPPER(v_mod) || ').',
          jsonb_build_object('type','approval_assigned',
                             'approval_request_id', p_request_id,
                             'step_order', v_next.step_order,
                             'entity_id', v_req.reference_id,
                             'entity_type', v_mod));

  RETURN jsonb_build_object('activated', true, 'step_order', v_next.step_order,
                            'step_code', v_next.step_code, 'approver_user_id', v_actor);
END $$;

CREATE OR REPLACE FUNCTION public._engine_process_v2(
  p_request_id uuid, p_action text, p_comments text, p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_req       RECORD;
  v_step      RECORD;
  v_mod       text;
  v_next      jsonb;
  v_entity    text;
  v_before    text;
  v_override  boolean := false;
  v_new_ent   text;
  v_closes    boolean;
BEGIN
  SELECT ar.*, am.code AS module_code INTO v_req
  FROM public.approval_requests ar
  JOIN public.approval_modules am ON am.id = ar.module_id
  WHERE ar.id = p_request_id
  FOR UPDATE OF ar NOWAIT;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_req.status IN ('rejected','cancelled','completed','approved') OR v_req.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CONFLICT',
      'detail', 'Fluxo já encerrado (' || v_req.status || ')');
  END IF;

  v_mod := public._engine_module_norm(v_req.module_code);
  SELECT status INTO v_before FROM public._engine_entity_read(v_mod, v_req.reference_id);

  SELECT * INTO v_step
  FROM public.approval_request_steps
  WHERE approval_request_id = p_request_id
    AND step_order = v_req.current_step_order
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'CONFLICT', 'detail', 'Etapa atual inexistente');
  END IF;

  IF v_step.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'CONFLICT',
      'detail', 'Etapa já processada (' || v_step.status || ')');
  END IF;

  IF v_step.approver_user_id IS DISTINCT FROM p_actor THEN
    IF public.is_master(p_actor) THEN
      IF p_comments IS NULL OR length(trim(p_comments)) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'MASTER_OVERRIDE_REASON_REQUIRED');
      END IF;
      v_override := true;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'NOT_CURRENT_APPROVER');
    END IF;
  END IF;

  SELECT closes_workflow INTO v_closes
  FROM public.approval_flow_steps WHERE id = v_step.flow_step_id;

  IF p_action = 'devolver' THEN
    IF p_comments IS NULL OR length(trim(p_comments)) < 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED');
    END IF;

    UPDATE public.approval_request_steps
       SET status='returned', action_at=now(), comments=p_comments
     WHERE id = v_step.id;

    UPDATE public.approval_requests
       SET status='returned', ended_at=NULL, current_approver_user_id=NULL, updated_at=now()
     WHERE id = p_request_id;

    v_new_ent := COALESCE(
      (SELECT return_entity_status FROM public.approval_flow_steps WHERE id = v_step.flow_step_id),
      'retornado');
    PERFORM public._update_entity_status(v_mod, v_req.reference_id, v_new_ent);

    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (v_req.requester_user_id, 'Solicitação devolvida para ajuste',
            'Motivo: ' || p_comments,
            jsonb_build_object('type','approval_returned','approval_request_id', p_request_id,
                               'entity_id', v_req.reference_id, 'entity_type', v_mod));

  ELSIF p_action = 'rejeitar' THEN
    IF p_comments IS NULL OR length(trim(p_comments)) < 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED');
    END IF;

    UPDATE public.approval_request_steps
       SET status='rejected', action_at=now(), comments=p_comments
     WHERE id = v_step.id;

    UPDATE public.approval_requests
       SET status='rejected', ended_at=now(), current_approver_user_id=NULL, updated_at=now()
     WHERE id = p_request_id;

    v_new_ent := COALESCE(
      (SELECT rejection_entity_status FROM public.approval_flow_steps WHERE id = v_step.flow_step_id),
      'reprovado');
    PERFORM public._update_entity_status(v_mod, v_req.reference_id, v_new_ent);

    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (v_req.requester_user_id, 'Solicitação reprovada', 'Motivo: ' || p_comments,
            jsonb_build_object('type','approval_rejected','approval_request_id', p_request_id,
                               'entity_id', v_req.reference_id, 'entity_type', v_mod));

  ELSE
    IF p_action IS DISTINCT FROM COALESCE(v_step.completion_action, 'aprovar') THEN
      RETURN jsonb_build_object('success', false, 'error', 'ACTION_NOT_ALLOWED',
        'detail', 'Ação esperada nesta etapa: ' || COALESCE(v_step.completion_action,'aprovar'));
    END IF;

    UPDATE public.approval_request_steps
       SET status='approved', action_at=now(), comments=p_comments
     WHERE id = v_step.id;

    SELECT entity_status_on_success INTO v_new_ent
    FROM public.approval_flow_steps WHERE id = v_step.flow_step_id;

    IF v_mod = 'desligamentos' AND COALESCE(v_closes,false) THEN
      PERFORM public._update_entity_status(v_mod, v_req.reference_id, 'aprovado');
      PERFORM public.termination_set_status(v_req.reference_id, 'desligamento_concluido'::termination_status,
                                            COALESCE(p_comments,'Offboarding concluído pelo motor V2'));
    ELSIF v_new_ent IS NOT NULL THEN
      PERFORM public._update_entity_status(v_mod, v_req.reference_id, v_new_ent);
    END IF;

    IF COALESCE(v_closes, false) THEN
      UPDATE public.approval_requests
         SET status='completed', ended_at=now(), current_approver_user_id=NULL, updated_at=now()
       WHERE id = p_request_id;

      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (v_req.requester_user_id, 'Fluxo de aprovação concluído',
              'Sua solicitação concluiu o fluxo de aprovação (' || UPPER(v_mod) || ').',
              jsonb_build_object('type','approval_completed','approval_request_id', p_request_id,
                                 'entity_id', v_req.reference_id, 'entity_type', v_mod));

    ELSIF COALESCE(v_step.next_step_activation,'immediate') = 'immediate' THEN
      v_next := public._engine_activate_next(p_request_id, v_step.step_order);
      IF NOT COALESCE((v_next->>'activated')::boolean, false) THEN
        UPDATE public.approval_requests
           SET status='completed', ended_at=now(), current_approver_user_id=NULL, updated_at=now()
         WHERE id = p_request_id;
      END IF;

    ELSE
      UPDATE public.approval_requests
         SET status='waiting_operational', current_approver_user_id=NULL,
             ended_at=NULL, updated_at=now()
       WHERE id = p_request_id;
    END IF;
  END IF;

  SELECT status INTO v_entity FROM public._engine_entity_read(v_mod, v_req.reference_id);

  IF v_entity IS DISTINCT FROM v_before THEN
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_mod, v_mod, v_req.reference_id, v_before, v_entity, p_actor);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_actor, 'ENGINE_V2_' || upper(p_action), v_mod, v_req.reference_id::text,
    jsonb_build_object(
      'approval_request_id', p_request_id,
      'step_order', v_step.step_order,
      'step_code', v_step.step_code,
      'action', p_action,
      'reason', p_comments,
      'master_override', v_override,
      'actor_user_id', p_actor,
      'original_approver_user_id', v_step.approver_user_id,
      'entity_status', v_entity,
      'timestamp', now()
    ));

  RETURN jsonb_build_object('success', true, 'action', p_action,
                            'approval_request_id', p_request_id,
                            'entity_status', v_entity,
                            'master_override', v_override,
                            'next', v_next);

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'CONFLICT',
      'detail', 'Solicitação sendo processada por outro usuário.');
END $$;

REVOKE ALL ON FUNCTION public._engine_activate_next(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_process_v2(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;