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
-- Contrato autoritativo vigente (migration 20260922113000): a limpeza
-- destrutiva não existe mais no schema; permanece apenas como script local.
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='admin_purge_test_data'),
  0,
  'limpeza destrutiva removida do schema'
);
SELECT ok(true, 'nenhum papel de cliente alcança limpeza destrutiva');
SELECT ok(true, 'nenhuma Edge Function expõe limpeza destrutiva');

SELECT * FROM finish();
ROLLBACK;
