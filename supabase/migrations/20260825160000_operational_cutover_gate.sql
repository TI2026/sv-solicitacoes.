-- CHECKPOINT OPERACIONAL FINAL
-- Impede novas instâncias V1 sem interferir nas requests V1 já existentes.
-- O Motor V2 continua dependente de configuração e ativação explícita.

DO $migration$
DECLARE
  v_definition text;
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_approval_flow(text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  IF position(
    'WHERE module_id = v_module_id AND active = true'
    IN v_definition
  ) = 0 OR position(
    'Nenhum fluxo de aprovação ativo encontrado para o módulo.'
    IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: start_approval_flow cutover gate';
  END IF;

  v_definition := replace(
    v_definition,
    'WHERE module_id = v_module_id AND active = true',
    'WHERE module_id = v_module_id AND active = true AND version = ''v2'''
  );
  v_definition := replace(
    v_definition,
    'Nenhum fluxo de aprovação ativo encontrado para o módulo.',
    'APPROVAL_ENGINE_AWAITING_ACTIVATION'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public._execute_entity_action_checkpoint_b(text,uuid,text,jsonb)'::regprocedure
  ) INTO v_definition;
  v_matches := regexp_count(v_definition, 'v_request.status = ''awaiting_step''');
  IF v_matches <> 3 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: executor awaiting_step matches expected 3, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'v_request.status = ''awaiting_step''',
    'v_request.status LIKE ''awaiting_step%'''
  );
  EXECUTE v_definition;

  -- O dispatcher V2 usa ações canônicas em português. O executor V1
  -- preservado historicamente recebe os aliases internos em inglês.
  SELECT pg_get_functiondef(
    'public.process_approval_action(uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF position(
    'RETURN public._engine_process_v1(p_approval_request_id, p_action, p_comments);'
    IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: V1 action translation';
  END IF;
  v_definition := replace(
    v_definition,
    'RETURN public._engine_process_v1(p_approval_request_id, p_action, p_comments);',
    'RETURN public._engine_process_v1(p_approval_request_id, CASE lower(p_action) WHEN ''aprovar'' THEN ''approve'' WHEN ''rejeitar'' THEN ''reject'' WHEN ''devolver'' THEN ''return'' ELSE lower(p_action) END, p_comments);'
  );
  EXECUTE v_definition;

  -- Uma devolução V1 permanece ativa para permitir correção e reenvio da
  -- mesma request; não cria uma request nova nem converte o snapshot para V2.
  SELECT pg_get_functiondef(
    'public._engine_process_v1(uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF position(
    'SET status = ''returned'', ended_at = now(), updated_at = now()'
    IN v_definition
  ) = 0 THEN
    RAISE EXCEPTION 'PATCH_TARGET_NOT_FOUND: V1 returned request lifecycle';
  END IF;
  v_definition := replace(
    v_definition,
    'SET status = ''returned'', ended_at = now(), updated_at = now()',
    'SET status = ''returned'', ended_at = NULL, updated_at = now()'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public._get_entity_action_context_checkpoint_b(text,uuid)'::regprocedure
  ) INTO v_definition;
  v_matches := regexp_count(v_definition, 'v_request.status = ''awaiting_step''');
  IF v_matches <> 4 THEN
    RAISE EXCEPTION
      'PATCH_TARGET_NOT_FOUND: context awaiting_step matches expected 4, found %',
      v_matches;
  END IF;
  v_definition := replace(
    v_definition,
    'v_request.status = ''awaiting_step''',
    'v_request.status LIKE ''awaiting_step%'''
  );
  EXECUTE v_definition;
END
$migration$;

-- CREATE OR REPLACE preserva os grants existentes, mas reafirma explicitamente
-- que os helpers continuam internos.
REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._execute_entity_action_checkpoint_b(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_entity_action_context_checkpoint_b(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._engine_process_v1(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
