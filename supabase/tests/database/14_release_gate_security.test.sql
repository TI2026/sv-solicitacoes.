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
SELECT ok(
  has_function_privilege('authenticated', 'public.admin_purge_test_data(text,boolean)', 'EXECUTE'),
  'usuário autenticado alcança RPC que valida Master internamente'
);
SELECT set_config('role', 'authenticated', true);
SELECT is(
  (public.admin_purge_test_data('ALL_TEST', true))->>'error',
  'Apenas usuário Master pode executar limpeza de dados',
  'usuário autenticado sem Master não executa limpeza destrutiva'
);
SELECT set_config('role', 'postgres', true);

SELECT * FROM finish();
ROLLBACK;
