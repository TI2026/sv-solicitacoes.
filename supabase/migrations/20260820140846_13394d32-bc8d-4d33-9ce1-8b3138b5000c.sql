-- ============================================================
-- Checkpoint 1 — Onda B-R1 / D (incremental, não altera migrations publicadas)
-- ============================================================

-- 1) SAVE: somente V2 + substituto obrigatório -----------------
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

  -- V1 é imutável para esta RPC
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
$function$;

-- 2) Catálogo canônico das 17 etapas ---------------------------
CREATE OR REPLACE VIEW public.v_approval_v2_canonical_steps AS
SELECT * FROM (VALUES
  ('compras',1,'aprovacao_necessidade','approval','aprovar'),
  ('compras',2,'aprovacao_financeira','approval','aprovar'),
  ('abastecimento',1,'autorizacao_abastecimento','approval','aprovar'),
  ('abastecimento',2,'pagamento_abastecimento','payment','pagar'),
  ('abastecimento',3,'conferencia_abastecimento','review','concluir_revisao'),
  ('diaria',1,'autorizacao_diaria','approval','aprovar'),
  ('diaria',2,'verificacao_diaria','verification','confirmar_horas'),
  ('diaria',3,'pagamento_diaria','payment','pagar'),
  ('reembolso',1,'aprovacao_reembolso','approval','aprovar'),
  ('reembolso',2,'revisao_financeira','review','concluir_revisao'),
  ('reembolso',3,'pagamento_reembolso','payment','pagar'),
  ('admissoes',1,'aprovacao_vaga','approval','aprovar'),
  ('admissoes',2,'processamento_rh','hr_processing','concluir_triagem'),
  ('admissoes',3,'validacao_final_rh','review','concluir'),
  ('desligamentos',1,'autorizacao_desligamento','approval','aprovar'),
  ('desligamentos',2,'processamento_rh','hr_processing','concluir_processamento_rh'),
  ('desligamentos',3,'checklist_offboarding','review','concluir')
) AS t(module_code, step_order, step_code, step_kind, completion_action);

REVOKE ALL ON public.v_approval_v2_canonical_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_approval_v2_canonical_steps TO service_role;

-- 3) HEALTH: master-only + substituto obrigatório + identidade --
CREATE OR REPLACE FUNCTION public.get_approval_configuration_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_steps jsonb;
  v_modules jsonb;
  v_overall text;
  v_missing jsonb;
  v_extra jsonb;
  v_divergent jsonb;
  v_template_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHENTICATED');
  END IF;
  IF NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  WITH actual AS (
    SELECT m.code AS module_code, s.step_order, s.step_code, s.step_kind, s.completion_action
      FROM public.approval_flows f
      JOIN public.approval_modules m ON m.id = f.module_id
      JOIN public.approval_flow_steps s ON s.flow_id = f.id
     WHERE f.version = 'v2'
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('module_code',c.module_code,'step_order',c.step_order,'step_code',c.step_code))
                FROM public.v_approval_v2_canonical_steps c
               WHERE NOT EXISTS (SELECT 1 FROM actual a WHERE a.module_code=c.module_code AND a.step_order=c.step_order)), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('module_code',a.module_code,'step_order',a.step_order,'step_code',a.step_code))
                FROM actual a
               WHERE NOT EXISTS (SELECT 1 FROM public.v_approval_v2_canonical_steps c WHERE a.module_code=c.module_code AND a.step_order=c.step_order)), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object(
                       'module_code',a.module_code,'step_order',a.step_order,
                       'expected', jsonb_build_object('step_code',c.step_code,'step_kind',c.step_kind,'completion_action',c.completion_action),
                       'found', jsonb_build_object('step_code',a.step_code,'step_kind',a.step_kind,'completion_action',a.completion_action)))
                FROM actual a
                JOIN public.v_approval_v2_canonical_steps c
                  ON c.module_code=a.module_code AND c.step_order=a.step_order
               WHERE a.step_code IS DISTINCT FROM c.step_code
                  OR a.step_kind IS DISTINCT FROM c.step_kind
                  OR a.completion_action IS DISTINCT FROM c.completion_action), '[]'::jsonb)
  INTO v_missing, v_extra, v_divergent;

  v_template_ok := (jsonb_array_length(v_missing) = 0
                AND jsonb_array_length(v_extra) = 0
                AND jsonb_array_length(v_divergent) = 0);

  WITH step_health AS (
    SELECT
      m.code AS module_code, m.name AS module_name,
      f.id AS flow_id, f.name AS flow_name, f.active AS flow_active,
      s.id AS step_id, s.step_order, s.step_code, s.step_name, s.step_kind, s.completion_action,
      coalesce(s.assignment_mode,'person') AS assignment_mode,
      s.approver_user_id AS primary_user_id,
      pp.full_name AS primary_user_name,
      s.substitute_user_id,
      ps.full_name AS substitute_user_name,
      s.fixed_sector_id AS sector_id,
      sec.name AS sector_name,
      sec.responsible_user_id AS sector_responsible_user_id,
      sr.full_name AS sector_responsible_name,
      sec.substitute_user_id AS sector_substitute_user_id,
      ss.full_name AS sector_substitute_name,
      s.default_sla_hours AS sla_hours,
      CASE
        WHEN coalesce(s.assignment_mode,'person') = 'person' THEN
          CASE
            WHEN s.approver_user_id IS NULL THEN 'blocked'
            WHEN pp.id IS NULL OR pp.active IS NOT TRUE THEN 'blocked'
            WHEN s.substitute_user_id IS NULL THEN 'blocked'
            WHEN ps.id IS NULL OR ps.active IS NOT TRUE THEN 'blocked'
            WHEN s.substitute_user_id = s.approver_user_id THEN 'blocked'
            ELSE 'ready'
          END
        ELSE
          CASE
            WHEN s.fixed_sector_id IS NULL THEN 'blocked'
            WHEN sec.id IS NULL OR sec.active IS NOT TRUE THEN 'blocked'
            WHEN sec.responsible_user_id IS NULL THEN 'blocked'
            WHEN sr.id IS NULL OR sr.active IS NOT TRUE THEN 'blocked'
            WHEN sec.substitute_user_id IS NULL THEN 'blocked'
            WHEN ss.id IS NULL OR ss.active IS NOT TRUE THEN 'blocked'
            WHEN sec.substitute_user_id = sec.responsible_user_id THEN 'blocked'
            ELSE 'ready'
          END
      END AS status,
      CASE
        WHEN coalesce(s.assignment_mode,'person') = 'person' THEN
          CASE
            WHEN s.approver_user_id IS NULL THEN 'Etapa sem responsável configurado.'
            WHEN pp.id IS NULL OR pp.active IS NOT TRUE THEN 'Responsável inexistente ou inativo.'
            WHEN s.substitute_user_id IS NULL THEN 'Etapa sem substituto: fluxo empresarial não pode operar sem contingência.'
            WHEN ps.id IS NULL OR ps.active IS NOT TRUE THEN 'Substituto inexistente ou inativo.'
            WHEN s.substitute_user_id = s.approver_user_id THEN 'Substituto precisa ser diferente do responsável.'
            ELSE NULL
          END
        ELSE
          CASE
            WHEN s.fixed_sector_id IS NULL THEN 'Etapa sem setor configurado.'
            WHEN sec.id IS NULL OR sec.active IS NOT TRUE THEN 'Setor inexistente ou inativo.'
            WHEN sec.responsible_user_id IS NULL THEN 'Setor não possui responsável válido.'
            WHEN sr.id IS NULL OR sr.active IS NOT TRUE THEN 'Responsável do setor inativo.'
            WHEN sec.substitute_user_id IS NULL THEN 'Setor sem substituto: contingência obrigatória.'
            WHEN ss.id IS NULL OR ss.active IS NOT TRUE THEN 'Substituto do setor inativo.'
            WHEN sec.substitute_user_id = sec.responsible_user_id THEN 'Substituto do setor precisa ser diferente do responsável.'
            ELSE NULL
          END
      END AS reason
    FROM public.approval_flows f
    JOIN public.approval_modules m ON m.id = f.module_id
    JOIN public.approval_flow_steps s ON s.flow_id = f.id
    LEFT JOIN public.profiles pp ON pp.id = s.approver_user_id
    LEFT JOIN public.profiles ps ON ps.id = s.substitute_user_id
    LEFT JOIN public.sectors sec ON sec.id = s.fixed_sector_id
    LEFT JOIN public.profiles sr ON sr.id = sec.responsible_user_id
    LEFT JOIN public.profiles ss ON ss.id = sec.substitute_user_id
    WHERE f.version = 'v2'
  )
  SELECT
    coalesce(jsonb_agg(to_jsonb(sh) ORDER BY sh.module_code, sh.step_order), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(x ORDER BY x->>'module_code') FROM (
       SELECT jsonb_build_object(
         'module_code', module_code,
         'module_name', module_name,
         'flow_id', flow_id,
         'flow_name', flow_name,
         'flow_active', flow_active,
         'steps_total', count(*),
         'status', CASE WHEN bool_or(status='blocked') THEN 'blocked'
                        WHEN bool_or(status='warning') THEN 'warning'
                        ELSE 'ready' END
       ) AS x
       FROM step_health
       GROUP BY module_code, module_name, flow_id, flow_name, flow_active
     ) q), '[]'::jsonb)
  INTO v_steps, v_modules
  FROM step_health sh;

  SELECT CASE
           WHEN NOT v_template_ok THEN 'blocked'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_steps) e WHERE e->>'status' = 'blocked') THEN 'blocked'
           WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_steps) e WHERE e->>'status' = 'warning') THEN 'warning'
           ELSE 'ready'
         END
    INTO v_overall;

  RETURN jsonb_build_object(
    'overall', v_overall,
    'flows_total', (SELECT count(*) FROM public.approval_flows WHERE version='v2'),
    'steps_total', jsonb_array_length(v_steps),
    'template', jsonb_build_object(
      'ok', v_template_ok,
      'expected_flows', 6,
      'expected_steps', 17,
      'missing_steps', v_missing,
      'extra_steps', v_extra,
      'divergent_steps', v_divergent
    ),
    'modules', v_modules,
    'steps', v_steps
  );
END;
$function$;

-- 4) CUTOVER: allowlist estrita dos 6 módulos + lock -----------
CREATE OR REPLACE FUNCTION public.activate_approval_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status jsonb;
  v_modules text[] := ARRAY['compras','abastecimento','diaria','reembolso','admissoes','desligamentos'];
  v_deactivated int;
  v_activated int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_master(auth.uid()) THEN
    RETURN jsonb_build_object('error','FORBIDDEN_MASTER_ONLY');
  END IF;

  -- Serializa contra qualquer início de fluxo concorrente
  PERFORM pg_advisory_xact_lock(hashtext('approval_engine_cutover'));

  v_status := public.get_v2_cutover_status();

  IF (v_status->'health'->>'overall') <> 'ready' THEN
    RETURN jsonb_build_object('error','CUTOVER_BLOCKED_CONFIGURATION', 'health', v_status->'health');
  END IF;

  IF (v_status->>'active_v1_count')::int > 0 THEN
    RETURN jsonb_build_object('error','CUTOVER_BLOCKED_ACTIVE_V1_REQUESTS',
                              'active_v1_requests', v_status->'active_v1_requests');
  END IF;

  WITH d AS (
    UPDATE public.approval_flows f
       SET active = false, updated_at = now()
      FROM public.approval_modules m
     WHERE m.id = f.module_id
       AND m.code = ANY(v_modules)
       AND coalesce(f.version,'v1') <> 'v2'
       AND f.active
    RETURNING f.id
  ) SELECT count(*) INTO v_deactivated FROM d;

  WITH a AS (
    UPDATE public.approval_flows f
       SET active = true, updated_at = now()
      FROM public.approval_modules m
     WHERE m.id = f.module_id
       AND m.code = ANY(v_modules)
       AND f.version = 'v2'
    RETURNING f.id
  ) SELECT count(*) INTO v_activated FROM a;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'approval_v2_activated', 'approval_flows', NULL,
          jsonb_build_object('activated_at', now(),
                             'modules', to_jsonb(v_modules),
                             'deactivated_v1', v_deactivated,
                             'activated_v2', v_activated));

  RETURN jsonb_build_object('success', true, 'activated_at', now(),
                            'deactivated_v1', v_deactivated,
                            'activated_v2', v_activated,
                            'modules', to_jsonb(v_modules));
END;
$function$;

-- 5) Mesmo lock lógico respeitado por qualquer início de fluxo --
CREATE OR REPLACE FUNCTION public.approval_requests_cutover_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_cutover'));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_approval_requests_cutover_lock ON public.approval_requests;
CREATE TRIGGER trg_approval_requests_cutover_lock
  BEFORE INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.approval_requests_cutover_lock();

-- 6) QUEUE: status exato ---------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF approval_requests
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.approval_requests
  WHERE current_approver_user_id = auth.uid()
    AND status = 'awaiting_step'
    AND ended_at IS NULL;
$function$;

-- 7) Helpers privados ------------------------------------------
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._update_entity_status(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_requests_cutover_lock() FROM PUBLIC, anon, authenticated;