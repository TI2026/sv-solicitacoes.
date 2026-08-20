-- ============================================================
-- Tipo composto do contexto de ações (012 + 1c consolidados)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.entity_action_context AS (
    module_key TEXT,
    entity_id UUID,
    current_status TEXT,
    current_step TEXT,
    current_approver_user_id UUID,
    is_current_actor BOOLEAN,
    allowed_actions JSONB,
    blocked_reasons TEXT[],
    next_step TEXT,
    requester_user_id UUID,
    sla_deadline TIMESTAMPTZ,
    flow_version TEXT,
    current_step_order INT,
    current_step_name TEXT,
    next_step_order INT,
    next_step_name TEXT,
    next_responsible_rule TEXT,
    overdue BOOLEAN
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  v_oid oid;
  atts text[] := ARRAY['flow_version','current_step_order','current_step_name',
                       'next_step_order','next_step_name','next_responsible_rule','overdue'];
  types text[] := ARRAY['TEXT','INT','TEXT','INT','TEXT','TEXT','BOOLEAN'];
  i int;
BEGIN
  SELECT typrelid INTO v_oid FROM pg_type
  WHERE typname = 'entity_action_context' AND typnamespace = 'public'::regnamespace;

  FOR i IN 1..array_length(atts,1) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = atts[i] AND NOT attisdropped) THEN
      EXECUTE format('ALTER TYPE public.entity_action_context ADD ATTRIBUTE %I %s CASCADE', atts[i], types[i]);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Métricas reais do dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fuel_metrics JSONB;
  v_daily_metrics JSONB;
  v_reimbursement_metrics JSONB;
  v_adm_metrics JSONB;
  v_pur_metrics JSONB;
  v_term_metrics JSONB;
BEGIN
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aprovados', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'aguardando_fotos', COUNT(id) FILTER (WHERE status = 'aguardando_fotos'),
      'revisao_administrativa', COUNT(id) FILTER (WHERE status = 'em_revisao_admin'),
      'valor_total', COALESCE(SUM(valor), 0)
  ) INTO v_fuel_metrics
  FROM public.fuel_requests WHERE deleted_at IS NULL AND type = 'abastecimento';

  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'programadas', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'em_verificacao', COUNT(id) FILTER (WHERE status = 'em_revisao'),
      'aguardando_pagamento', COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
      'valor_total', COALESCE(SUM(daily_value), 0)
  ) INTO v_daily_metrics
  FROM public.fuel_requests WHERE deleted_at IS NULL AND type = 'diaria';

  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aguardando_pagamento', COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
      'valor_total', COALESCE(SUM(valor), 0)
  ) INTO v_reimbursement_metrics
  FROM public.fuel_requests WHERE deleted_at IS NULL AND type = 'reembolso';

  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_andamento', COUNT(id) FILTER (WHERE status NOT IN ('concluido','cancelado','arquivado')),
      'concluidas', COUNT(id) FILTER (WHERE status = 'concluido'),
      'active_cost', COALESCE(SUM(salario_previsto) FILTER (WHERE status NOT IN ('concluido','cancelado','arquivado')), 0)
  ) INTO v_adm_metrics
  FROM public.admission_requests;

  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aguardando_oc', COUNT(id) FILTER (WHERE status = 'aguardando_oc'),
      'aguardando_pagamento', COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
      'aguardando_entrega', COUNT(id) FILTER (WHERE status = 'aguardando_entrega'),
      'entregue', COUNT(id) FILTER (WHERE status = 'entregue'),
      'divergencia', COUNT(id) FILTER (WHERE status = 'divergencia'),
      'valor_total', COALESCE(SUM(estimated_value), 0)
  ) INTO v_pur_metrics
  FROM public.purchases WHERE deleted_at IS NULL;

  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aprovado', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'desligamento_concluido', COUNT(id) FILTER (WHERE status = 'desligamento_concluido')
  ) INTO v_term_metrics
  FROM public.termination_requests;

  RETURN jsonb_build_object(
    'abastecimento', v_fuel_metrics,
    'diarias', v_daily_metrics,
    'reembolsos', v_reimbursement_metrics,
    'admission', v_adm_metrics,
    'purchases', v_pur_metrics,
    'terminations', v_term_metrics
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;