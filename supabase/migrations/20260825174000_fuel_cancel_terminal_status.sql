-- CUTOVER V2 - blocker crítico comprovado no remoto.
-- `fuel_status` usa `encerrado` como estado terminal; o executor genérico
-- tentava converter `cancelado`, que não existe nesse enum (SQLSTATE 22P02).

DO $migration$
DECLARE
  v_definition text;
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(
    'public._update_entity_status(text,uuid,text)'::regprocedure
  ) INTO v_definition;
  v_matches := regexp_count(v_definition, 'p_new_status::public.fuel_status');
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: fuel terminal mapping expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'p_new_status::public.fuel_status',
    '(CASE WHEN p_new_status = ''cancelado'' THEN ''encerrado'' ELSE p_new_status END)::public.fuel_status'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public._execute_entity_action_checkpoint_b(text,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;
  v_matches := regexp_count(
    v_definition,
    '''desligamento_concluido'',''cancelado'',''arquivado'''
  );
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: executor terminal statuses expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    '''desligamento_concluido'',''cancelado'',''arquivado''',
    '''desligamento_concluido'',''cancelado'',''encerrado'',''arquivado'''
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public._get_entity_action_context_checkpoint_b(text,uuid)'::regprocedure
  ) INTO v_definition;
  v_matches := regexp_count(
    v_definition,
    '''desligamento_concluido'',''cancelado'',''arquivado'''
  );
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: context terminal statuses expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    '''desligamento_concluido'',''cancelado'',''arquivado''',
    '''desligamento_concluido'',''cancelado'',''encerrado'',''arquivado'''
  );

  v_matches := regexp_count(
    v_definition,
    'WHEN v_entity_status = ''cancelado'' THEN'
  );
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: context cancelled label expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'WHEN v_entity_status = ''cancelado'' THEN',
    'WHEN v_entity_status IN (''cancelado'',''encerrado'') THEN'
  );
  EXECUTE v_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public._update_entity_status(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._execute_entity_action_checkpoint_b(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_entity_action_context_checkpoint_b(text, uuid)
  FROM PUBLIC, anon, authenticated;
