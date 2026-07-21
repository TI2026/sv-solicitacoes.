-- =========================================================================
-- SPRINT 13.5 (RC2) - PRESERVAR IS_REQUIRED NOS FLUXOS
-- Atualizando a função replace_approval_flow_steps para manter is_required
-- =========================================================================

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
      flow_id, step_order, approver_type, approver_user_id, sector_id, timeout_hours, active, name, description, is_required
    ) VALUES (
      p_flow_id,
      _idx,
      COALESCE(_step->>'approver_type', 'specific_user'),
      NULLIF(_step->>'approver_user_id', '')::uuid,
      NULLIF(_step->>'sector_id', '')::uuid,
      NULLIF(_step->>'timeout_hours', '')::integer,
      true,
      _step->>'name',
      _step->>'description',
      COALESCE((_step->>'is_required')::boolean, true)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', _idx);
END;
$function$;
