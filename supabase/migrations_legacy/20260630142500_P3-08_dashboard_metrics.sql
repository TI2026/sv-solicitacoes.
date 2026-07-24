-- Habilita realtime na tabela approval_requests para o motor de aprovação
ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;

-- RPC de Métricas do Dashboard (Performance Extrema)
-- SECURITY INVOKER garante que as agregações abaixo usem as políticas de RLS do usuário logado.
CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_fuel_total INT;
  v_fuel_pendentes INT;
  v_fuel_aprovados INT;
  v_fuel_valor_total NUMERIC;
  v_fuel_aguardando_oc INT;
  v_fuel_aguardando_pagamento INT;
  v_fuel_em_revisao_admin INT;
  v_fuel_by_status JSONB;
  v_fuel_by_type JSONB;

  v_adm_total INT;
  v_adm_em_andamento INT;
  v_adm_aguardando_registros INT;
  v_adm_active_cost NUMERIC;
  v_adm_by_status JSONB;

  v_result JSONB;
BEGIN
  -- 1. Agregações para fuel_requests (considerando is('deleted_at', null) implícito se RLS cobrir, mas vamos forçar)
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('aprovado', 'reprovado', 'encerrado', 'concluido')),
    COUNT(id) FILTER (WHERE status IN ('encerrado', 'aprovado', 'concluido')),
    COALESCE(SUM(valor), 0),
    COUNT(id) FILTER (WHERE status = 'aguardando_oc'),
    COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
    COUNT(id) FILTER (WHERE status = 'em_revisao_admin')
  INTO 
    v_fuel_total, v_fuel_pendentes, v_fuel_aprovados, v_fuel_valor_total, 
    v_fuel_aguardando_oc, v_fuel_aguardando_pagamento, v_fuel_em_revisao_admin
  FROM fuel_requests 
  WHERE deleted_at IS NULL;

  -- Agrupamento por status (fuel)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY status
  ) s;

  -- Agrupamento por tipo (fuel)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', type, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_type
  FROM (
    SELECT COALESCE(type, 'abastecimento') as type, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY COALESCE(type, 'abastecimento')
  ) t;

  -- 2. Agregações para admission_requests
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('concluido', 'cancelado')),
    COUNT(id) FILTER (WHERE status = 'registros_concluidos'),
    COALESCE(SUM(salario_previsto) FILTER (WHERE status NOT IN ('concluido', 'cancelado')), 0)
  INTO 
    v_adm_total, v_adm_em_andamento, v_adm_aguardando_registros, v_adm_active_cost
  FROM admission_requests;

  -- Agrupamento por status (admission)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_adm_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM admission_requests 
    GROUP BY status
  ) sa;

  -- 3. Constrói o JSON final
  v_result := jsonb_build_object(
    'fuel', jsonb_build_object(
      'total', v_fuel_total,
      'pendentes', v_fuel_pendentes,
      'aprovados', v_fuel_aprovados,
      'valor_total', v_fuel_valor_total,
      'aguardando_oc', v_fuel_aguardando_oc,
      'aguardando_pagamento', v_fuel_aguardando_pagamento,
      'em_revisao_admin', v_fuel_em_revisao_admin,
      'by_status', v_fuel_by_status,
      'by_type', v_fuel_by_type
    ),
    'admission', jsonb_build_object(
      'total', v_adm_total,
      'em_andamento', v_adm_em_andamento,
      'aguardando_registros', v_adm_aguardando_registros,
      'active_cost', v_adm_active_cost,
      'by_status', v_adm_by_status
    )
  );

  RETURN v_result;
END;
$$;
