-- CUTOVER V2 - blocker crítico comprovado no remoto.
-- O histórico remoto contém os módulos ativos `admissions` e `admissoes`,
-- ambos normalizados para `admissoes`. Requests V2 usam o módulo canônico,
-- portanto executor e Action Context devem preferir o código exato.

DO $migration$
DECLARE
  v_definition text;
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(
    'public._execute_entity_action_checkpoint_b(text,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;

  v_matches := regexp_count(v_definition, 'ORDER BY am.created_at');
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: executor canonical module order expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'ORDER BY am.created_at',
    'ORDER BY CASE WHEN am.code = v_module THEN 0 ELSE 1 END, am.created_at'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public._get_entity_action_context_checkpoint_b(text,uuid)'::regprocedure
  ) INTO v_definition;

  v_matches := regexp_count(v_definition, 'ORDER BY am.created_at');
  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: context canonical module order expected 1, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'ORDER BY am.created_at',
    'ORDER BY CASE WHEN am.code = v_module THEN 0 ELSE 1 END, am.created_at'
  );
  EXECUTE v_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public._execute_entity_action_checkpoint_b(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_entity_action_context_checkpoint_b(text, uuid)
  FROM PUBLIC, anon, authenticated;
