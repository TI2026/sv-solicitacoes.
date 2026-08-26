BEGIN;
SELECT * FROM no_plan();

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'approval_flows', 'approval_flow_steps', 'permissions',
        'role_permissions', 'user_effective_permissions',
        'user_permission_overrides', 'user_roles'
      )
      AND cmd <> 'SELECT'),
  0,
  'RBAC e configuração V2 não possuem escrita direta por RLS'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('audit_logs', 'status_history')
      AND cmd = 'INSERT'),
  0,
  'browser não insere history/audit diretamente'
);

SELECT ok(
  pg_get_functiondef('public.purchases_guard_controlled_fields()'::regprocedure)
    LIKE '%NEW.purchase_notes IS DISTINCT FROM OLD.purchase_notes%'
  AND pg_get_functiondef('public.purchases_guard_controlled_fields()'::regprocedure)
    LIKE '%NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by%',
  'guard de Compras cobre campos operacionais e de confirmação'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'purchases'
      AND policyname = 'purchases_select_workflow_participant'
      AND qual LIKE '%compras%'
      AND qual LIKE '%reference_id%'),
  1,
  'leitura de Compras por participante exige módulo + entidade'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'fuel_requests_select_workflow_participant',
        'admission_requests_select_workflow_participant',
        'termination_requests_select_workflow_participant'
      )
      AND qual LIKE '%reference_id%'),
  3,
  'atores do workflow leem as três entidades pelo vínculo exato'
);

SELECT ok(
  NOT has_function_privilege('authenticated', p.oid, 'execute')
  AND NOT has_function_privilege('anon', p.oid, 'execute'),
  p.proname || ' não expõe entrada legada de workflow/configuração'
)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'submit_purchase_request', 'cancel_purchase_request',
    'advance_purchase_to_oc', 'confirm_purchase_payment',
    'confirm_purchase_delivery', 'confirm_purchase_receipt',
    'replace_approval_flow_steps'
  );

SELECT ok(
  NOT has_function_privilege('authenticated', p.oid, 'execute')
  AND NOT has_function_privilege('anon', p.oid, 'execute'),
  p.proname || ' permanece helper interno'
)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'handle_new_user', 'prevent_last_master_removal', 'rls_auto_enable',
    'track_status_change', 'trigger_rebuild_permissions',
    'enforce_v2_template_immutability', 'guard_master_role_escalation',
    'guard_roles_master_flag'
  );

SELECT ok(
  has_function_privilege('authenticated', p.oid, 'execute')
  AND NOT has_function_privilege('anon', p.oid, 'execute'),
  p.proname || ' permanece helper somente autenticado'
)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'current_has_role', 'current_user_has_permission', 'current_user_id',
    'get_user_roles', 'user_participates_in_approval', 'soft_delete_request'
  );

SELECT is(
  (SELECT count(*)::integer
     FROM pg_default_acl d
     CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
     LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public'
      AND d.defaclobjtype = 'f'
      AND d.defaclrole = 'postgres'::regrole
      AND acl.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
      AND acl.privilege_type = 'EXECUTE'),
  0,
  'funções futuras não concedem execute a anon/authenticated por padrão'
);

-- RLS runtime fixtures: a shared UUID in another module must not leak an entity.
INSERT INTO auth.users(id,email) VALUES
  ('bc000000-0000-0000-0000-000000000001','authority-owner@test.local'),
  ('bc000000-0000-0000-0000-000000000002','authority-actor@test.local'),
  ('bc000000-0000-0000-0000-000000000003','authority-director@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('bc000000-0000-0000-0000-000000000001','Authority Owner','authority-owner@test.local',true),
  ('bc000000-0000-0000-0000-000000000002','Authority Actor','authority-actor@test.local',true),
  ('bc000000-0000-0000-0000-000000000003','Authority Director','authority-director@test.local',true)
ON CONFLICT (id) DO UPDATE SET active = true;

INSERT INTO public.user_roles(user_id, role)
VALUES ('bc000000-0000-0000-0000-000000000003', 'diretoria')
ON CONFLICT DO NOTHING;

INSERT INTO public.purchases(id,requester_user_id,status,category,description)
VALUES (
  'bc100000-0000-0000-0000-000000000001',
  'bc000000-0000-0000-0000-000000000001',
  'rascunho','Autoridade','Mesmo UUID em outro módulo'
);

INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo
) VALUES (
  'bc100000-0000-0000-0000-000000000001',
  'bc000000-0000-0000-0000-000000000001',
  100,current_date,'em_aprovacao','abastecimento','ABC1D23','Teste RLS'
);

INSERT INTO public.approval_requests(
  id,module_id,flow_id,reference_id,requester_user_id,status,
  current_step_order,current_approver_user_id
)
SELECT
  'bc200000-0000-0000-0000-000000000001',f.module_id,f.id,
  'bc100000-0000-0000-0000-000000000001',
  'bc000000-0000-0000-0000-000000000001','awaiting_step',1,
  'bc000000-0000-0000-0000-000000000002'
FROM public.approval_flows f
JOIN public.approval_modules m ON m.id = f.module_id
WHERE m.code = 'abastecimento'
ORDER BY f.created_at
LIMIT 1;

SELECT set_config('role','authenticated',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bc000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::integer FROM public.fuel_requests
    WHERE id = 'bc100000-0000-0000-0000-000000000001'),
  1,
  'ator atual lê a entidade correta do workflow'
);

SELECT is(
  (SELECT count(*)::integer FROM public.purchases
    WHERE id = 'bc100000-0000-0000-0000-000000000001'),
  0,
  'ator de Abastecimento não lê Compra com UUID coincidente'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bc000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$UPDATE public.purchases
       SET purchase_notes = 'bypass'
     WHERE id = 'bc100000-0000-0000-0000-000000000001'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester não altera campo operacional de Compra diretamente'
);

SELECT throws_like(
  $$INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id)
    VALUES (
      'bc000000-0000-0000-0000-000000000001',
      'FORGED','purchases','bc100000-0000-0000-0000-000000000001'
    )$$,
  '%row-level security%',
  'usuário não forja audit log próprio'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bc000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

SELECT throws_like(
  $$UPDATE public.approval_flow_steps
       SET step_name = 'DIRECT_WRITE_BYPASS'
     WHERE id = (SELECT id FROM public.approval_flow_steps LIMIT 1)$$,
  '%permission denied%',
  'Diretoria não altera configuração V2 por DML direto'
);

SELECT set_config('role','postgres',true);
SELECT set_config('request.jwt.claims','{}',true);

SELECT * FROM finish();
ROLLBACK;
