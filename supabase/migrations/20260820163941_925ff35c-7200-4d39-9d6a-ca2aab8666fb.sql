-- Sprint Final 1 — Fechamento: isolamento module+entity, can_edit Master, fila V2

DO $mig$
DECLARE
  d text;
  scoped constant text :=
    'WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL'
    || ' AND ar.module_id IN (SELECT m.id FROM public.approval_modules m WHERE m.code = v_mod)';
BEGIN
  -- 1) execute_entity_action: busca da request ativa escopada por módulo
  d := pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure);
  IF position('WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: execute_entity_action active request lookup';
  END IF;
  d := replace(d, 'WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL', scoped);
  EXECUTE d;

  -- 2) get_entity_action_context: mesma busca escopada + can_edit para Master
  d := pg_get_functiondef('public.get_entity_action_context(text,uuid)'::regprocedure);
  IF position('WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: get_entity_action_context active request lookup';
  END IF;
  d := replace(d, 'WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL', scoped);

  IF position('(v_is_req AND v_ent.status IN (''rascunho'',''retornado''))' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: get_entity_action_context can_edit';
  END IF;
  d := replace(d,
        '(v_is_req AND v_ent.status IN (''rascunho'',''retornado''))',
        '((v_is_req OR v_master) AND v_ent.status IN (''rascunho'',''retornado''))');
  EXECUTE d;

  -- 3) _engine_can_view: participação em etapas escopada por módulo
  d := pg_get_functiondef('public._engine_can_view(text,uuid,uuid,uuid)'::regprocedure);
  IF position('WHERE ar.reference_id = p_entity_id' in d) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: _engine_can_view lookup';
  END IF;
  d := replace(d,
        'WHERE ar.reference_id = p_entity_id',
        'WHERE ar.reference_id = p_entity_id'
        || ' AND ar.module_id IN (SELECT m.id FROM public.approval_modules m WHERE m.code = p_module)');
  EXECUTE d;
END $mig$;

-- 4) Fila de aprovação: regra V2 canônica + compatibilidade V1 isolada
CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF approval_requests
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ar.*
  FROM public.approval_requests ar
  LEFT JOIN public.approval_flows f ON f.id = ar.flow_id
  WHERE ar.current_approver_user_id = auth.uid()
    AND ar.ended_at IS NULL
    AND (
      -- V2 (canônico)
      (COALESCE(f.version,'v1') = 'v2' AND ar.status = 'awaiting_step')
      -- V1 (compatibilidade isolada, enquanto existirem requests antigas)
      OR (COALESCE(f.version,'v1') <> 'v2'
          AND (ar.status = 'awaiting_step' OR ar.status LIKE 'awaiting_step\_%'))
    )
  ORDER BY ar.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_my_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;