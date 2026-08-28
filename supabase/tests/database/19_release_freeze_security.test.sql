BEGIN;
SELECT * FROM no_plan();

SELECT ok(
  pg_get_functiondef('public.get_entity_action_context(text,uuid)'::regprocedure)
    LIKE '%master_override%'
  AND pg_get_functiondef('public.get_entity_action_context(text,uuid)'::regprocedure)
    LIKE '%array_remove(v_actions, ''aprovar'')%',
  'Action Context separa override Master das ações comuns'
);

SELECT ok(
  pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%v_request.current_approver_user_id%'
  AND pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%Ação reservada ao responsável atual da etapa%',
  'executor exige current actor nas ações comuns'
);

SELECT ok(
  pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%ENGINE_V2_MASTER_OVERRIDE_EXPLICIT%'
  AND pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%''master_override''%',
  'override explícito deixa trilha de auditoria dedicada'
);

SELECT ok(
  pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%comprovante bancário do pagamento%'
  AND pg_get_functiondef('public.execute_entity_action(text,uuid,text,jsonb)'::regprocedure)
    LIKE '%ENGINE_V2_PAYMENT_PROOF%',
  'pagamento exige e audita evidência bancária'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='fuel_attachment_type' AND e.enumlabel='comprovante_pagamento'
  ),
  'tipo canônico de comprovante de pagamento existe'
);

SELECT ok(
  has_function_privilege('authenticated','public.register_purchase_payment_proof(uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.register_purchase_payment_proof(uuid,text,text)','EXECUTE'),
  'registro de comprovante de Compra é somente autenticado e valida ator internamente'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public._execute_entity_action_release_freeze_predecessor(text,uuid,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public._execute_entity_action_release_freeze_predecessor(text,uuid,text,jsonb)','EXECUTE'),
  'executor predecessor permanece helper interno'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('fleet_storage_participant_select','fleet_storage_participant_insert')),
  2,
  'Storage privado de Fleet possui políticas explícitas para participantes'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.permission_modules WHERE code='dashboard' AND active)
  AND EXISTS (SELECT 1 FROM public.permission_actions WHERE code='view_financials' AND active),
  'Dashboard financeiro usa contrato de permissão efetiva'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('approval_requests','approval_request_steps')
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')),
  0,
  'workflow DML direto continua negado'
);

SELECT * FROM finish();
ROLLBACK;
