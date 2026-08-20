-- =====================================================================
-- MOTOR V2 — ONDA B: Configuração, Health Check e preparação de cutover
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_master(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _uid AND (r.is_master OR r.key = 'master')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid AND ur.role = 'master'
  );
$$;

-- ---------------------------------------------------------------------
-- save_approval_step_assignment — único caminho de escrita da configuração
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_approval_step_assignment(
  p_step_id uuid,
  p_assignment_mode text,
  p_primary_user_id uuid DEFAULT NULL,
  p_substitute_user_id uuid DEFAULT NULL,
  p_sector_id uuid DEFAULT NULL,
  p_sla_hours integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHENTICATED');
  END IF;
  IF NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  SELECT s.*, f.version INTO v_step
    FROM public.approval_flow_steps s
    JOIN public.approval_flows f ON f.id = s.flow_id
   WHERE s.id = p_step_id
   FOR UPDATE OF s;

  IF v_step IS NULL THEN
    RETURN jsonb_build_object('error','STEP_NOT_FOUND');
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
    IF p_substitute_user_id IS NOT NULL THEN
      IF p_substitute_user_id = p_primary_user_id THEN
        RETURN jsonb_build_object('error','SUBSTITUTE_EQUALS_PRIMARY');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_substitute_user_id AND active) THEN
        RETURN jsonb_build_object('error','SUBSTITUTE_INVALID_OR_INACTIVE');
      END IF;
    END IF;

    UPDATE public.approval_flow_steps
       SET assignment_mode = 'person',
           approver_type = 'person',
           approver_user_id = p_primary_user_id,
           substitute_user_id = p_substitute_user_id,
           fixed_sector_id = NULL,
           approver_role_key = NULL,
           default_sla_hours = p_sla_hours
     WHERE id = p_step_id;
  ELSE
    IF p_sector_id IS NULL THEN
      RETURN jsonb_build_object('error','SECTOR_REQUIRED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE id = p_sector_id AND active) THEN
      RETURN jsonb_build_object('error','SECTOR_INVALID_OR_INACTIVE');
    END IF;

    UPDATE public.approval_flow_steps
       SET assignment_mode = 'sector',
           approver_type = 'sector',
           fixed_sector_id = p_sector_id,
           approver_user_id = NULL,
           substitute_user_id = NULL,
           approver_role_key = NULL,
           default_sla_hours = p_sla_hours
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
$$;

REVOKE ALL ON FUNCTION public.save_approval_step_assignment(uuid,text,uuid,uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_approval_step_assignment(uuid,text,uuid,uuid,uuid,integer) TO authenticated;

-- ---------------------------------------------------------------------
-- get_approval_configuration_health
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_approval_configuration_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_steps jsonb;
  v_modules jsonb;
  v_overall text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHENTICATED');
  END IF;

  WITH step_health AS (
    SELECT
      m.code  AS module_code,
      m.name  AS module_name,
      f.id    AS flow_id,
      f.name  AS flow_name,
      f.active AS flow_active,
      s.id    AS step_id,
      s.step_order,
      s.step_code,
      s.step_name,
      s.step_kind,
      s.completion_action,
      coalesce(s.assignment_mode,'person') AS assignment_mode,
      s.approver_user_id  AS primary_user_id,
      pp.full_name        AS primary_user_name,
      s.substitute_user_id,
      ps.full_name        AS substitute_user_name,
      s.fixed_sector_id   AS sector_id,
      sec.name            AS sector_name,
      sec.responsible_user_id AS sector_responsible_user_id,
      sr.full_name            AS sector_responsible_name,
      sec.substitute_user_id  AS sector_substitute_user_id,
      ss.full_name            AS sector_substitute_name,
      s.default_sla_hours AS sla_hours,
      CASE
        WHEN coalesce(s.assignment_mode,'person') = 'person' THEN
          CASE
            WHEN s.approver_user_id IS NULL THEN 'blocked'
            WHEN pp.id IS NULL OR pp.active IS NOT TRUE THEN 'blocked'
            WHEN s.substitute_user_id IS NOT NULL AND (ps.id IS NULL OR ps.active IS NOT TRUE) THEN 'blocked'
            WHEN s.substitute_user_id IS NULL THEN 'warning'
            ELSE 'ready'
          END
        ELSE
          CASE
            WHEN s.fixed_sector_id IS NULL THEN 'blocked'
            WHEN sec.id IS NULL OR sec.active IS NOT TRUE THEN 'blocked'
            WHEN sec.responsible_user_id IS NULL THEN 'blocked'
            WHEN sr.id IS NULL OR sr.active IS NOT TRUE THEN 'blocked'
            WHEN sec.substitute_user_id IS NULL THEN 'warning'
            WHEN ss.id IS NULL OR ss.active IS NOT TRUE THEN 'warning'
            ELSE 'ready'
          END
      END AS status,
      CASE
        WHEN coalesce(s.assignment_mode,'person') = 'person' THEN
          CASE
            WHEN s.approver_user_id IS NULL THEN 'Etapa sem responsável configurado.'
            WHEN pp.id IS NULL OR pp.active IS NOT TRUE THEN 'Responsável inexistente ou inativo.'
            WHEN s.substitute_user_id IS NOT NULL AND (ps.id IS NULL OR ps.active IS NOT TRUE) THEN 'Substituto inexistente ou inativo.'
            WHEN s.substitute_user_id IS NULL THEN 'Sem substituto configurado (risco de bloqueio por SLA).'
            ELSE NULL
          END
        ELSE
          CASE
            WHEN s.fixed_sector_id IS NULL THEN 'Etapa sem setor configurado.'
            WHEN sec.id IS NULL OR sec.active IS NOT TRUE THEN 'Setor inexistente ou inativo.'
            WHEN sec.responsible_user_id IS NULL THEN 'Setor não possui responsável válido.'
            WHEN sr.id IS NULL OR sr.active IS NOT TRUE THEN 'Responsável do setor inativo.'
            WHEN sec.substitute_user_id IS NULL THEN 'Setor sem substituto configurado.'
            WHEN ss.id IS NULL OR ss.active IS NOT TRUE THEN 'Substituto do setor inativo.'
            ELSE NULL
          END
      END AS reason
    FROM public.approval_flows f
    JOIN public.approval_modules m ON m.id = f.module_id
    JOIN public.approval_flow_steps s ON s.flow_id = f.id
    LEFT JOIN public.profiles pp ON pp.id = s.approver_user_id
    LEFT JOIN public.profiles ps ON ps.id = s.substitute_user_id
    LEFT JOIN public.sectors  sec ON sec.id = s.fixed_sector_id
    LEFT JOIN public.profiles sr ON sr.id = sec.responsible_user_id
    LEFT JOIN public.profiles ss ON ss.id = sec.substitute_user_id
    WHERE f.version = 'v2'
  )
  SELECT
    jsonb_agg(to_jsonb(sh) ORDER BY sh.module_code, sh.step_order),
    (SELECT jsonb_agg(x ORDER BY x->>'module_code') FROM (
       SELECT jsonb_build_object(
         'module_code', module_code,
         'module_name', module_name,
         'flow_id', flow_id,
         'flow_name', flow_name,
         'flow_active', flow_active,
         'steps_total', count(*),
         'status', CASE
                     WHEN bool_or(status = 'blocked') THEN 'blocked'
                     WHEN bool_or(status = 'warning') THEN 'warning'
                     ELSE 'ready' END
       ) AS x
       FROM step_health GROUP BY module_code, module_name, flow_id, flow_name, flow_active
     ) t)
  INTO v_steps, v_modules
  FROM step_health sh;

  SELECT CASE
           WHEN (SELECT count(*) FROM public.approval_flows WHERE version = 'v2') <> 6
             OR jsonb_array_length(coalesce(v_steps,'[]'::jsonb)) <> 17 THEN 'blocked'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_steps) e WHERE e->>'status' = 'blocked') THEN 'blocked'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_steps) e WHERE e->>'status' = 'warning') THEN 'warning'
           ELSE 'ready'
         END
  INTO v_overall;

  RETURN jsonb_build_object(
    'overall', v_overall,
    'flows_total', (SELECT count(*) FROM public.approval_flows WHERE version = 'v2'),
    'steps_total', jsonb_array_length(coalesce(v_steps,'[]'::jsonb)),
    'modules', coalesce(v_modules,'[]'::jsonb),
    'steps', coalesce(v_steps,'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_approval_configuration_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_approval_configuration_health() TO authenticated;

-- ---------------------------------------------------------------------
-- get_v2_cutover_status — auditoria (E1), somente leitura
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_v2_cutover_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_health jsonb;
  v_active_v1 jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  v_health := public.get_approval_configuration_health();

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'approval_request_id', ar.id,
           'module_code', m.code,
           'entity_id', ar.reference_id,
           'flow_name', f.name,
           'flow_version', f.version,
           'requester_user_id', ar.requester_user_id,
           'current_step_order', ar.current_step_order,
           'current_approver_user_id', ar.current_approver_user_id,
           'created_at', ar.created_at,
           'status', ar.status
         ) ORDER BY ar.created_at), '[]'::jsonb)
    INTO v_active_v1
    FROM public.approval_requests ar
    JOIN public.approval_modules m ON m.id = ar.module_id
    JOIN public.approval_flows f ON f.id = ar.flow_id
   WHERE ar.ended_at IS NULL
     AND coalesce(f.version,'v1') <> 'v2';

  RETURN jsonb_build_object(
    'health', v_health,
    'active_v1_requests', v_active_v1,
    'active_v1_count', jsonb_array_length(v_active_v1),
    'can_activate', (v_health->>'overall' = 'ready' AND jsonb_array_length(v_active_v1) = 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_v2_cutover_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_v2_cutover_status() TO authenticated;

-- ---------------------------------------------------------------------
-- activate_approval_v2 — atômica, Master-only, com todos os gates
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_approval_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  v_status := public.get_v2_cutover_status();

  IF (v_status->'health'->>'overall') <> 'ready' THEN
    RETURN jsonb_build_object('error','CUTOVER_BLOCKED_CONFIGURATION', 'health', v_status->'health');
  END IF;

  IF (v_status->>'active_v1_count')::int > 0 THEN
    RETURN jsonb_build_object('error','CUTOVER_BLOCKED_ACTIVE_V1_REQUESTS',
                              'active_v1_requests', v_status->'active_v1_requests');
  END IF;

  UPDATE public.approval_flows SET active = false, updated_at = now()
   WHERE coalesce(version,'v1') <> 'v2' AND active;

  UPDATE public.approval_flows SET active = true, updated_at = now()
   WHERE version = 'v2';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approval_v2_activated', 'approval_flows', NULL,
          jsonb_build_object('activated_at', now()));

  RETURN jsonb_build_object('success', true, 'activated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.activate_approval_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_approval_v2() TO authenticated;

-- ---------------------------------------------------------------------
-- Configuração imutável: sem escrita direta na tabela de etapas
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.approval_flow_steps FROM authenticated, anon;