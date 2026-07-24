-- sprint15_014_real_dashboard_metrics.sql
-- Atualiza a RPC de dashboard para agregar métricas com RLS de forma performática

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $function$
DECLARE
  v_fuel_metrics JSONB;
  v_daily_metrics JSONB;
  v_reimbursement_metrics JSONB;
  v_adm_metrics JSONB;
  v_pur_metrics JSONB;
  v_term_metrics JSONB;
  v_result JSONB;
BEGIN
  -- 1. Agregações para Fleet - Abastecimento
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aprovados', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'aguardando_fotos', COUNT(id) FILTER (WHERE status = 'aguardando_fotos'),
      'revisao_administrativa', COUNT(id) FILTER (WHERE status = 'em_revisao_admin'),
      'valor_total', COALESCE(SUM(valor), 0)
  ) INTO v_fuel_metrics
  FROM public.fuel_requests 
  WHERE deleted_at IS NULL AND type = 'abastecimento';

  -- 2. Agregações para Fleet - Diárias
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'programadas', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'em_verificacao', COUNT(id) FILTER (WHERE status = 'em_revisao'),
      'aguardando_pagamento', COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
      'valor_total', COALESCE(SUM(daily_value), 0)
  ) INTO v_daily_metrics
  FROM public.fuel_requests 
  WHERE deleted_at IS NULL AND type = 'diaria';

  -- 3. Agregações para Fleet - Reembolsos
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aguardando_pagamento', COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
      'valor_total', COALESCE(SUM(valor), 0)
  ) INTO v_reimbursement_metrics
  FROM public.fuel_requests 
  WHERE deleted_at IS NULL AND type = 'reembolso';

  -- 4. Agregações para Admissões
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_andamento', COUNT(id) FILTER (WHERE status NOT IN ('concluido', 'cancelado', 'arquivado')),
      'concluidas', COUNT(id) FILTER (WHERE status = 'concluido'),
      'active_cost', COALESCE(SUM(salario_previsto) FILTER (WHERE status NOT IN ('concluido', 'cancelado', 'arquivado')), 0)
  ) INTO v_adm_metrics
  FROM public.admission_requests;

  -- 5. Agregações para Compras
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
  FROM public.purchases
  WHERE deleted_at IS NULL;

  -- 6. Agregações para Desligamentos
  SELECT jsonb_build_object(
      'total', COUNT(id),
      'em_aprovacao', COUNT(id) FILTER (WHERE status = 'em_aprovacao'),
      'aprovado', COUNT(id) FILTER (WHERE status = 'aprovado'),
      'desligamento_concluido', COUNT(id) FILTER (WHERE status = 'desligamento_concluido')
  ) INTO v_term_metrics
  FROM public.termination_requests;

  -- Constrói o JSON final
  v_result := jsonb_build_object(
    'abastecimento', v_fuel_metrics,
    'diarias', v_daily_metrics,
    'reembolsos', v_reimbursement_metrics,
    'admission', v_adm_metrics,
    'purchases', v_pur_metrics,
    'terminations', v_term_metrics
  );

  RETURN v_result;
END;
$function$;
