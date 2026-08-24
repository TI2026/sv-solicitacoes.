-- CHECKPOINT B — notification metadata, eventos operacionais e SLA único.

CREATE OR REPLACE FUNCTION public.workflow_entity_link(p_module text, p_entity_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public._engine_module_norm(p_module)
    WHEN 'compras' THEN '/purchases/' || p_entity_id::text
    WHEN 'admissoes' THEN '/admissions/' || p_entity_id::text
    WHEN 'desligamentos' THEN '/desligamentos/' || p_entity_id::text
    WHEN 'diaria' THEN '/diarias/' || p_entity_id::text
    WHEN 'reembolso' THEN '/reembolsos/' || p_entity_id::text
    WHEN 'abastecimento' THEN '/fleet/' || p_entity_id::text
    ELSE '/pendencias'
  END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_workflow_event
ON public.notifications ((metadata->>'event_key'))
WHERE metadata ? 'event_key';

CREATE OR REPLACE FUNCTION public.enrich_workflow_notification_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_entity_id uuid;
  v_module text;
  v_status text;
  v_step_code text;
BEGIN
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  BEGIN
    v_request_id := NULLIF(NEW.metadata->>'approval_request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_request_id := NULL;
  END;

  IF v_request_id IS NOT NULL THEN
    SELECT ar.reference_id, public._engine_module_norm(am.code), ar.status,
           ars.step_code
      INTO v_entity_id, v_module, v_status, v_step_code
    FROM public.approval_requests ar
    JOIN public.approval_modules am ON am.id = ar.module_id
    LEFT JOIN public.approval_request_steps ars
      ON ars.approval_request_id = ar.id
     AND ars.step_order = COALESCE(
       NULLIF(NEW.metadata->>'step_order', '')::integer,
       ar.current_step_order
     )
    WHERE ar.id = v_request_id;
  ELSE
    BEGIN
      v_entity_id := NULLIF(NEW.metadata->>'entity_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id := NULL;
    END;
    v_module := public._engine_module_norm(
      COALESCE(NEW.metadata->>'module_key', NEW.metadata->>'entity_type')
    );
    v_status := NEW.metadata->>'status';
    v_step_code := NEW.metadata->>'step_code';
  END IF;

  IF v_entity_id IS NOT NULL AND v_module IS NOT NULL THEN
    NEW.metadata := NEW.metadata || jsonb_strip_nulls(jsonb_build_object(
      'module_key', v_module,
      'entity_id', v_entity_id,
      'approval_request_id', v_request_id,
      'step_code', v_step_code,
      'action', COALESCE(NEW.metadata->>'action', NEW.metadata->>'type'),
      'status', v_status,
      'link', public.workflow_entity_link(v_module, v_entity_id)
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enrich_workflow_notification_metadata ON public.notifications;
CREATE TRIGGER tr_enrich_workflow_notification_metadata
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enrich_workflow_notification_metadata();

CREATE OR REPLACE FUNCTION public.notify_workflow_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text;
  v_link text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT public._engine_module_norm(am.code)
    INTO v_module FROM public.approval_modules am WHERE am.id = NEW.module_id;
  v_link := public.workflow_entity_link(v_module, NEW.reference_id);

  IF NEW.status = 'waiting_operational' THEN
    INSERT INTO public.notifications(user_id, title, message, metadata)
    VALUES (
      NEW.requester_user_id,
      'Ação operacional necessária',
      'O fluxo aguarda seus dados ou comprovantes para continuar.',
      jsonb_build_object(
        'event_key', 'waiting:' || NEW.id::text || ':' || COALESCE(NEW.current_step_order, 0)::text,
        'type', 'approval_waiting_operational', 'action', 'enviar_comprovantes',
        'approval_request_id', NEW.id, 'module_key', v_module,
        'entity_id', NEW.reference_id, 'status', NEW.status, 'link', v_link
      )
    ) ON CONFLICT DO NOTHING;
  ELSIF NEW.status = 'cancelled' THEN
    INSERT INTO public.notifications(user_id, title, message, metadata)
    VALUES (
      NEW.requester_user_id,
      'Solicitação cancelada',
      'O workflow desta solicitação foi cancelado.',
      jsonb_build_object(
        'event_key', 'cancelled:requester:' || NEW.id::text,
        'type', 'approval_cancelled', 'action', 'cancelar',
        'approval_request_id', NEW.id, 'module_key', v_module,
        'entity_id', NEW.reference_id, 'status', NEW.status, 'link', v_link
      )
    ) ON CONFLICT DO NOTHING;

    IF OLD.current_approver_user_id IS NOT NULL
       AND OLD.current_approver_user_id IS DISTINCT FROM NEW.requester_user_id THEN
      INSERT INTO public.notifications(user_id, title, message, metadata)
      VALUES (
        OLD.current_approver_user_id,
        'Aprovação cancelada',
        'A solicitação que aguardava sua análise foi cancelada.',
        jsonb_build_object(
          'event_key', 'cancelled:actor:' || NEW.id::text || ':' || OLD.current_approver_user_id::text,
          'type', 'approval_cancelled', 'action', 'cancelar',
          'approval_request_id', NEW.id, 'module_key', v_module,
          'entity_id', NEW.reference_id, 'status', NEW.status, 'link', v_link
        )
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notify_workflow_operational_state ON public.approval_requests;
CREATE TRIGGER tr_notify_workflow_operational_state
AFTER UPDATE OF status ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_workflow_operational_state();

CREATE OR REPLACE FUNCTION public._engine_sla_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_reassigned integer := 0;
  v_overdue integer := 0;
  v_module text;
BEGIN
  FOR r IN
    SELECT ars.*, ar.requester_user_id, ar.reference_id, ar.module_id
    FROM public.approval_request_steps ars
    JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
    WHERE ars.status = 'pending'
      AND ars.flow_version = 'v2'
      AND ars.sla_deadline IS NOT NULL
      AND ars.sla_deadline < now()
      AND ar.status = 'awaiting_step'
    FOR UPDATE OF ars
  LOOP
    SELECT public._engine_module_norm(code) INTO v_module
    FROM public.approval_modules WHERE id = r.module_id;

    IF r.escalated_at IS NULL
       AND r.substitute_user_id IS NOT NULL
       AND r.substitute_user_id IS DISTINCT FROM r.approver_user_id
       AND r.substitute_user_id IS DISTINCT FROM r.requester_user_id
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.substitute_user_id AND p.active)
    THEN
      UPDATE public.approval_request_steps
         SET approver_user_id = r.substitute_user_id,
             escalated_at = now(),
             sla_deadline = CASE WHEN COALESCE(sla_hours,0) > 0
                                 THEN now() + make_interval(hours => sla_hours) END
       WHERE id = r.id;
      UPDATE public.approval_requests
         SET current_approver_user_id = r.substitute_user_id, updated_at = now()
       WHERE id = r.approval_request_id;

      INSERT INTO public.notifications(user_id, title, message, metadata)
      VALUES (
        r.substitute_user_id, 'Aprovação reatribuída por prazo',
        'Uma etapa vencida foi reatribuída a você.',
        jsonb_build_object(
          'event_key', 'sla-reassigned:' || r.id::text,
          'type', 'approval_sla_reassigned', 'action', 'APPROVAL_SLA_REASSIGNED',
          'approval_request_id', r.approval_request_id, 'step_code', r.step_code,
          'module_key', v_module, 'entity_id', r.reference_id,
          'status', 'awaiting_step',
          'link', public.workflow_entity_link(v_module, r.reference_id)
        )
      ) ON CONFLICT DO NOTHING;
      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
      VALUES (NULL, 'APPROVAL_SLA_REASSIGNED', v_module, r.reference_id::text,
              jsonb_build_object('approval_request_id', r.approval_request_id,
                                 'step_id', r.id, 'substitute_user_id', r.substitute_user_id));
      v_reassigned := v_reassigned + 1;

    ELSIF NOT r.overdue THEN
      UPDATE public.approval_request_steps SET overdue = true WHERE id = r.id;
      INSERT INTO public.notifications(user_id, title, message, metadata)
      SELECT p.id, 'Etapa de aprovação vencida',
             'Uma etapa ultrapassou o prazo e continua pendente.',
             jsonb_build_object(
               'event_key', 'sla-overdue:' || r.id::text || ':' || p.id::text,
               'type', 'approval_sla_overdue', 'action', 'APPROVAL_SLA_OVERDUE',
               'approval_request_id', r.approval_request_id, 'step_code', r.step_code,
               'module_key', v_module, 'entity_id', r.reference_id,
               'status', 'awaiting_step',
               'link', public.workflow_entity_link(v_module, r.reference_id)
             )
      FROM public.profiles p
      WHERE p.active AND public.is_master(p.id)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
      VALUES (NULL, 'APPROVAL_SLA_OVERDUE', v_module, r.reference_id::text,
              jsonb_build_object('approval_request_id', r.approval_request_id,
                                 'step_id', r.id));
      v_overdue := v_overdue + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('reassigned', v_reassigned, 'overdue', v_overdue);
END;
$$;

-- Um único scheduler V2, a cada 15 minutos.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE command = 'SELECT public._engine_sla_sweep();' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'approval-v2-sla-sweep',
    '*/15 * * * *',
    'SELECT public._engine_sla_sweep();'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.workflow_entity_link(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enrich_workflow_notification_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_workflow_operational_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_sla_sweep() FROM PUBLIC, anon, authenticated;
