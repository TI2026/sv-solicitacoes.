-- CHECKPOINT B — snapshot autoritativo do runtime V2.
-- Cada request V2 referencia uma cópia inativa e imutável do fluxo/steps.
-- O motor existente continua lendo por flow_step_id, mas deixa de depender da
-- configuração live. Requests V1 não são tocadas.

CREATE OR REPLACE FUNCTION public._snapshot_v2_flow_before_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.approval_flows%ROWTYPE;
  v_snapshot_id uuid;
BEGIN
  SELECT * INTO v_source FROM public.approval_flows WHERE id = NEW.flow_id;
  IF NOT FOUND OR COALESCE(v_source.version, 'v1') <> 'v2' OR NOT v_source.active THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.approval_flows(
    module_id, name, approval_type, active, require_rejection_reason,
    allow_return_for_adjustment, notify_next_approver, created_by,
    return_mode, version
  ) VALUES (
    v_source.module_id,
    v_source.name || ' [snapshot ' || left(gen_random_uuid()::text, 8) || ']',
    v_source.approval_type,
    false,
    v_source.require_rejection_reason,
    v_source.allow_return_for_adjustment,
    v_source.notify_next_approver,
    v_source.created_by,
    v_source.return_mode,
    'v2-snapshot'
  ) RETURNING id INTO v_snapshot_id;

  INSERT INTO public.approval_flow_steps(
    flow_id, step_order, approver_user_id, is_required, active,
    approver_type, fixed_sector_id, approver_role_key, step_code, step_name,
    purpose, default_sla_hours, substitute_user_id, step_kind,
    completion_action, entity_status_on_entry, entity_status_on_success,
    return_entity_status, rejection_entity_status, next_step_activation,
    approval_request_status_after, closes_workflow, assignment_mode
  )
  SELECT
    v_snapshot_id, step_order, approver_user_id, is_required, false,
    approver_type, fixed_sector_id, approver_role_key, step_code, step_name,
    purpose, default_sla_hours, substitute_user_id, step_kind,
    completion_action, entity_status_on_entry, entity_status_on_success,
    return_entity_status, rejection_entity_status, next_step_activation,
    approval_request_status_after, closes_workflow, assignment_mode
  FROM public.approval_flow_steps
  WHERE flow_id = v_source.id
  ORDER BY step_order;

  NEW.flow_id := v_snapshot_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._snapshot_v2_step_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_flow uuid;
  v_step_order integer;
  v_snapshot_step uuid;
BEGIN
  IF COALESCE(NEW.flow_version, 'v1') <> 'v2' OR NEW.flow_step_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT flow_id INTO v_snapshot_flow
  FROM public.approval_requests WHERE id = NEW.approval_request_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.approval_flows
    WHERE id = v_snapshot_flow AND version = 'v2-snapshot'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT step_order INTO v_step_order
  FROM public.approval_flow_steps WHERE id = NEW.flow_step_id;

  SELECT id INTO v_snapshot_step
  FROM public.approval_flow_steps
  WHERE flow_id = v_snapshot_flow AND step_order = v_step_order;

  IF v_snapshot_step IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW_SNAPSHOT_STEP_MISSING';
  END IF;
  NEW.flow_step_id := v_snapshot_step;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_snapshot_v2_flow_before_request ON public.approval_requests;
CREATE TRIGGER tr_snapshot_v2_flow_before_request
BEFORE INSERT ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public._snapshot_v2_flow_before_request();

DROP TRIGGER IF EXISTS tr_snapshot_v2_step_reference ON public.approval_request_steps;
CREATE TRIGGER tr_snapshot_v2_step_reference
BEFORE INSERT ON public.approval_request_steps
FOR EACH ROW EXECUTE FUNCTION public._snapshot_v2_step_reference();

-- Congela requests V2 já em andamento no momento da aplicação.
DO $$
DECLARE
  r record;
  v_snapshot_id uuid;
BEGIN
  FOR r IN
    SELECT ar.id AS request_id, af.*
    FROM public.approval_requests ar
    JOIN public.approval_flows af ON af.id = ar.flow_id
    WHERE ar.ended_at IS NULL
      AND af.active
      AND EXISTS (
        SELECT 1 FROM public.approval_request_steps ars
        WHERE ars.approval_request_id = ar.id AND ars.flow_version = 'v2'
      )
  LOOP
    INSERT INTO public.approval_flows(
      module_id, name, approval_type, active, require_rejection_reason,
      allow_return_for_adjustment, notify_next_approver, created_by,
      return_mode, version
    ) VALUES (
      r.module_id, r.name || ' [snapshot ' || left(r.request_id::text, 8) || ']',
      r.approval_type, false, r.require_rejection_reason,
      r.allow_return_for_adjustment, r.notify_next_approver, r.created_by,
      r.return_mode, 'v2-snapshot'
    ) RETURNING id INTO v_snapshot_id;

    INSERT INTO public.approval_flow_steps(
      flow_id, step_order, approver_user_id, is_required, active,
      approver_type, fixed_sector_id, approver_role_key, step_code, step_name,
      purpose, default_sla_hours, substitute_user_id, step_kind,
      completion_action, entity_status_on_entry, entity_status_on_success,
      return_entity_status, rejection_entity_status, next_step_activation,
      approval_request_status_after, closes_workflow, assignment_mode
    )
    SELECT
      v_snapshot_id, step_order, approver_user_id, is_required, false,
      approver_type, fixed_sector_id, approver_role_key, step_code, step_name,
      purpose, default_sla_hours, substitute_user_id, step_kind,
      completion_action, entity_status_on_entry, entity_status_on_success,
      return_entity_status, rejection_entity_status, next_step_activation,
      approval_request_status_after, closes_workflow, assignment_mode
    FROM public.approval_flow_steps
    WHERE flow_id = r.id
    ORDER BY step_order;

    UPDATE public.approval_request_steps ars
       SET flow_step_id = snap.id
      FROM public.approval_flow_steps source,
           public.approval_flow_steps snap
     WHERE ars.approval_request_id = r.request_id
       AND source.id = ars.flow_step_id
       AND snap.flow_id = v_snapshot_id
       AND snap.step_order = source.step_order;

    UPDATE public.approval_requests SET flow_id = v_snapshot_id WHERE id = r.request_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._snapshot_v2_flow_before_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._snapshot_v2_step_reference() FROM PUBLIC, anon, authenticated;
