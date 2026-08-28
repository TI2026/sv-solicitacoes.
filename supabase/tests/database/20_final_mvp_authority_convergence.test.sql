-- Final MVP callable-surface freeze.
BEGIN;
SELECT plan(14);

SELECT ok(
  has_function_privilege('authenticated','public.execute_entity_action(text,uuid,text,jsonb)','EXECUTE'),
  'executor canônico permanece disponível para authenticated'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public.soft_delete_request(uuid,text)','EXECUTE'),
  'soft_delete_request legado não é API do frontend'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.advance_purchase_to_oc(uuid,text,text,numeric,text,text,date,text)','EXECUTE'),
  'advance_purchase_to_oc legado não contorna o executor'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.cancel_purchase_request(uuid,text)','EXECUTE'),
  'cancel_purchase_request legado não contorna o executor'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.confirm_purchase_delivery(uuid,text,date,text,text)','EXECUTE'),
  'confirm_purchase_delivery legado não contorna o executor'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.confirm_purchase_payment(uuid,text)','EXECUTE'),
  'confirm_purchase_payment legado não contorna o executor'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.confirm_purchase_receipt(uuid,text)','EXECUTE'),
  'confirm_purchase_receipt legado não contorna o executor'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public.current_user_id()','EXECUTE'),
  'current_user_id sem consumidor não fica exposta'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.get_request_approval_status(uuid)','EXECUTE'),
  'read helper sem module key não fica exposta'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.has_permission(uuid,text,text)','EXECUTE'),
  'has_permission arbitrária fica interna'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public.check_single_active_flow_per_module()','EXECUTE'),
  'trigger de flow não é executável pela API'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.set_updated_at()','EXECUTE'),
  'trigger set_updated_at não é executável pela API'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.vehicles_normalize()','EXECUTE'),
  'trigger vehicles_normalize não é executável pela API'
);

SELECT is(
  (SELECT count(*)::integer
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND has_function_privilege('anon',p.oid,'EXECUTE')),
  0,
  'anon não executa funções do schema public'
);

SELECT * FROM finish();
ROLLBACK;
