-- =========================================================================
-- SPRINT 13 (RC2) - FIXANDO ETAPAS DE APROVAÇÃO
-- O sistema passa a usar etapas fixas predefinidas por módulo.
-- =========================================================================

-- 1) Adicionar colunas name e description
ALTER TABLE public.approval_flow_steps
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS description text;

-- 2) Atualizar RPC para respeitar name e description ao copiar/substituir passos
CREATE OR REPLACE FUNCTION public.replace_approval_flow_steps(p_flow_id uuid, p_steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _step jsonb; 
  _idx int := 0; 
  _uid uuid := auth.uid();
  _type text; 
  _user uuid; 
  _sector uuid; 
BEGIN
  IF p_flow_id IS NULL THEN RETURN jsonb_build_object('error', 'flow_id obrigatório'); END IF;

  IF NOT (
    has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')
    OR EXISTS (SELECT 1 FROM public.user_role_assignments ura
               JOIN public.roles r ON r.id = ura.role_id
               WHERE ura.user_id = _uid AND r.is_master = TRUE)
  ) THEN
    RETURN jsonb_build_object('error', 'Sem permissão para editar fluxo de aprovação');
  END IF;

  -- Validação
  IF p_steps IS NOT NULL AND jsonb_typeof(p_steps) = 'array' THEN
    FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      _idx := _idx + 1;
      _type   := COALESCE(_step->>'approver_type', 'specific_user');
      _user   := NULLIF(_step->>'approver_user_id','')::uuid;
      _sector := NULLIF(_step->>'sector_id','')::uuid;

      IF _type NOT IN ('specific_user','sector') THEN
        RETURN jsonb_build_object('error', format('Etapa %s: tipo de aprovador inválido (%s)', _idx, _type));
      END IF;
      IF _type='specific_user' AND _user IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: usuário fixo é obrigatório', _idx)); END IF;
      IF _type='sector' AND _sector IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: setor específico é obrigatório', _idx)); END IF;
    END LOOP;
  ELSE
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  IF _idx < 1 THEN
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  -- Atomic: delete + reinsert
  DELETE FROM public.approval_flow_steps WHERE flow_id = p_flow_id;

  _idx := 0;
  FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    _idx := _idx + 1;
    INSERT INTO public.approval_flow_steps (
      flow_id, step_order, approver_type, approver_user_id, sector_id, timeout_hours, active, name, description
    ) VALUES (
      p_flow_id,
      _idx,
      COALESCE(_step->>'approver_type', 'specific_user'),
      NULLIF(_step->>'approver_user_id', '')::uuid,
      NULLIF(_step->>'sector_id', '')::uuid,
      NULLIF(_step->>'timeout_hours', '')::integer,
      true,
      _step->>'name',
      _step->>'description'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', _idx);
END;
$function$;

-- 3) Inicializar fluxos padrão com as etapas fixas
DO $$
DECLARE
  v_module RECORD;
  v_flow_id uuid;
BEGIN
  FOR v_module IN 
    SELECT id, code FROM public.approval_modules 
    WHERE code IN ('abastecimento', 'reembolso', 'diaria', 'admissao', 'desligamento', 'compras')
  LOOP
    SELECT id INTO v_flow_id FROM public.approval_flows 
    WHERE module_id = v_module.id AND active = true
    ORDER BY created_at ASC LIMIT 1;

    IF v_flow_id IS NULL THEN
      INSERT INTO public.approval_flows (module_id, name, approval_type, active)
      VALUES (v_module.id, 'Fluxo Padrão - ' || v_module.code, 'sequential', true)
      RETURNING id INTO v_flow_id;
    END IF;

    UPDATE public.approval_flow_steps 
    SET active = false, step_order = step_order + 1000 
    WHERE flow_id = v_flow_id AND active = true;

    IF v_module.code = 'abastecimento' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Validação Operacional', 'Gestor confirma necessidade', 'sector', true, true),
      (v_flow_id, 2, 'Análise Financeira', 'Financeiro verifica orçamento', 'sector', true, true),
      (v_flow_id, 3, 'Aprovação Final', 'Diretoria aprova gastos', 'sector', false, true);
    
    ELSIF v_module.code = 'reembolso' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Validação do Gestor', 'Gestor valida a necessidade', 'sector', true, true),
      (v_flow_id, 2, 'Conferência Financeira', 'Confere documentação e recibos', 'sector', true, true);
      
    ELSIF v_module.code = 'diaria' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Gestor Imediato', 'Aprova solicitação de diária', 'sector', true, true),
      (v_flow_id, 2, 'Aprovação da Diretoria', 'Validação executiva', 'sector', true, true);
      
    ELSIF v_module.code = 'admissao' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Triagem RH', 'Valida documentação do candidato', 'sector', true, true),
      (v_flow_id, 2, 'Aprovação Gestor', 'Gestor valida perfil', 'sector', true, true),
      (v_flow_id, 3, 'Aprovação Diretoria', 'Validação executiva', 'sector', true, true);
      
    ELSIF v_module.code = 'desligamento' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Análise RH', 'Processa pedido de desligamento', 'sector', true, true),
      (v_flow_id, 2, 'Aprovação Gestor', 'Gestor aprova substituição', 'sector', true, true),
      (v_flow_id, 3, 'Aprovação Diretoria', 'Validação executiva', 'sector', true, true),
      (v_flow_id, 4, 'Rescisão Financeira', 'Financeiro processa acerto', 'sector', true, true);
      
    ELSIF v_module.code = 'compras' THEN
      INSERT INTO public.approval_flow_steps (flow_id, step_order, name, description, approver_type, is_required, active) VALUES
      (v_flow_id, 1, 'Cotação', 'Compras realiza cotação', 'sector', true, true),
      (v_flow_id, 2, 'Validação Gestor', 'Gestor aprova valor', 'sector', true, true),
      (v_flow_id, 3, 'Aprovação Financeira', 'Financeiro aprova verba', 'sector', true, true),
      (v_flow_id, 4, 'Aprovação Diretoria', 'Validação executiva', 'sector', false, true);
    END IF;

  END LOOP;
END $$;
