CREATE OR REPLACE FUNCTION public._engine_can_view(
  p_module text, p_entity_id uuid, p_requester uuid, p_uid uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

  IF v_module = 'compras'
     AND (public.has_role(p_uid, 'financeiro'::app_role)
          OR public.has_role(p_uid, 'compras'::app_role)) THEN
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

CREATE OR REPLACE FUNCTION public._engine_entity_table(p_module text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE public._engine_module_norm(p_module)
    WHEN 'compras' THEN 'purchases'
    WHEN 'abastecimento' THEN 'fuel_requests'
    WHEN 'diaria' THEN 'fuel_requests'
    WHEN 'reembolso' THEN 'fuel_requests'
    WHEN 'admissoes' THEN 'admission_requests'
    WHEN 'desligamentos' THEN 'termination_requests'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.status_history_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_table text := public._engine_entity_table(NEW.module);
BEGIN
  IF NEW.from_status IS NOT DISTINCT FROM NEW.to_status THEN
    RETURN NULL;
  END IF;

  IF v_table IS NOT NULL THEN
    NEW.entity_type := v_table;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.status_history sh
     WHERE sh.entity_id = NEW.entity_id
       AND sh.to_status = NEW.to_status
       AND sh.from_status IS NOT DISTINCT FROM NEW.from_status
       AND sh.created_at >= transaction_timestamp()
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_status_history_normalize ON public.status_history;
CREATE TRIGGER trg_status_history_normalize
BEFORE INSERT ON public.status_history
FOR EACH ROW EXECUTE FUNCTION public.status_history_normalize();

DELETE FROM public.notifications a
 USING public.notifications b
 WHERE a.ctid > b.ctid
   AND a.user_id = b.user_id
   AND a.metadata->>'event_key' IS NOT NULL
   AND a.metadata->>'event_key' = b.metadata->>'event_key';

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_user_event_key
  ON public.notifications (user_id, (metadata->>'event_key'))
  WHERE metadata->>'event_key' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_requester_step_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mod text;
  v_step RECORD;
BEGIN
  IF NEW.status <> 'awaiting_step' OR NEW.current_approver_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = NEW.status
     AND OLD.current_step_order IS NOT DISTINCT FROM NEW.current_step_order THEN
    RETURN NEW;
  END IF;
  IF NEW.requester_user_id = NEW.current_approver_user_id THEN
    RETURN NEW;
  END IF;

  SELECT am.code INTO v_mod
    FROM public.approval_modules am WHERE am.id = NEW.module_id;
  v_mod := public._engine_module_norm(v_mod);

  SELECT ars.step_code, ars.step_name INTO v_step
    FROM public.approval_request_steps ars
   WHERE ars.approval_request_id = NEW.id
     AND ars.step_order = NEW.current_step_order;

  INSERT INTO public.notifications (user_id, title, message, metadata)
  VALUES (
    NEW.requester_user_id,
    'Solicitação avançou de etapa',
    'Sua solicitação está na etapa "'
      || COALESCE(v_step.step_name, 'Etapa ' || NEW.current_step_order)
      || '" (' || UPPER(COALESCE(v_mod, 'workflow')) || ').',
    jsonb_build_object(
      'event_key', 'approval-step-activated:' || NEW.id::text || ':' || NEW.current_step_order::text,
      'type', 'approval_step_activated',
      'action', 'acompanhar',
      'approval_request_id', NEW.id,
      'step_order', NEW.current_step_order,
      'step_code', v_step.step_code,
      'module_key', v_mod,
      'entity_id', NEW.reference_id,
      'entity_type', v_mod,
      'status', NEW.status
    )
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_requester_step_activated ON public.approval_requests;
CREATE TRIGGER trg_notify_requester_step_activated
AFTER INSERT OR UPDATE OF status, current_step_order ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_requester_step_activated();

CREATE OR REPLACE FUNCTION public.guard_entity_delete_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_module text := TG_ARGV[0];
  v_module_id uuid;
BEGIN
  IF v_module = 'fuel_requests' THEN
    v_module := OLD.type::text;
  END IF;

  SELECT id INTO v_module_id FROM public.approval_modules WHERE code = v_module;
  IF v_module_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.approval_requests ar
     WHERE ar.reference_id = OLD.id
       AND ar.module_id = v_module_id
       AND ar.ended_at IS NULL
       AND ar.status NOT IN ('rejected','cancelled','completed','approved')
  ) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_DELETE_DENIED'
      USING HINT = 'Cancele ou conclua o fluxo antes de excluir a solicitação.';
  END IF;

  DELETE FROM public.approval_requests ar
   WHERE ar.reference_id = OLD.id
     AND ar.module_id = v_module_id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_delete_purchases ON public.purchases;
CREATE TRIGGER trg_guard_delete_purchases
BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.guard_entity_delete_workflow('compras');

DROP TRIGGER IF EXISTS trg_guard_delete_fuel ON public.fuel_requests;
CREATE TRIGGER trg_guard_delete_fuel
BEFORE DELETE ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_entity_delete_workflow('fuel_requests');

DROP TRIGGER IF EXISTS trg_guard_delete_admissions ON public.admission_requests;
CREATE TRIGGER trg_guard_delete_admissions
BEFORE DELETE ON public.admission_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_entity_delete_workflow('admissoes');

DROP TRIGGER IF EXISTS trg_guard_delete_terminations ON public.termination_requests;
CREATE TRIGGER trg_guard_delete_terminations
BEFORE DELETE ON public.termination_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_entity_delete_workflow('desligamentos');

CREATE OR REPLACE FUNCTION public._engine_process_v2(
  p_request_id uuid, p_action text, p_comments text, p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
            jsonb_build_object('event_key','approval-returned:' || p_request_id::text || ':' || v_step.step_order::text,
                               'type','approval_returned','approval_request_id', p_request_id,
                               'entity_id', v_req.reference_id, 'entity_type', v_mod))
    ON CONFLICT DO NOTHING;

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
            jsonb_build_object('event_key','approval-rejected:' || p_request_id::text || ':' || v_step.step_order::text,
                               'type','approval_rejected','approval_request_id', p_request_id,
                               'entity_id', v_req.reference_id, 'entity_type', v_mod))
    ON CONFLICT DO NOTHING;

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
              jsonb_build_object('event_key','approval-completed:' || p_request_id::text,
                                 'type','approval_completed','approval_request_id', p_request_id,
                                 'entity_id', v_req.reference_id, 'entity_type', v_mod))
      ON CONFLICT DO NOTHING;

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

  INSERT INTO public.approval_history (
    approval_request_id, action, action_by, step_order, comments, old_status, new_status
  ) VALUES (
    p_request_id, p_action, p_actor, v_step.step_order, p_comments, v_before, v_entity
  );

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
END $function$;