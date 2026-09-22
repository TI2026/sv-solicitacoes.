BEGIN;
SELECT plan(5);

SELECT ok(
  NOT has_function_privilege('anon', 'public.rebuild_user_permissions(uuid)', 'EXECUTE'),
  'anon não executa rebuild_user_permissions'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rebuild_user_permissions(uuid)', 'EXECUTE'),
  'authenticated não executa helper interno de permissões'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_purge_test_data(text,boolean)', 'EXECUTE'),
  'anon não executa manutenção destrutiva'
);
-- Contrato autoritativo vigente (migration 20260910162012): a limpeza
-- destrutiva não é alcançável pela API do cliente; somente service_role.
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.admin_purge_test_data(text,boolean)', 'EXECUTE'),
  'usuário autenticado não alcança a limpeza destrutiva pela API'
);
SELECT ok(
  has_function_privilege('service_role', 'public.admin_purge_test_data(text,boolean)', 'EXECUTE'),
  'apenas service_role executa a limpeza destrutiva'
);

SELECT * FROM finish();
ROLLBACK;
