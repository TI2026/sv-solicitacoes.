-- Checkpoint B final enterprise hardening: effective grants, RBAC, RLS,
-- financial integrity, authoritative rules, Storage and audit integrity.
BEGIN;
SELECT * FROM no_plan();

SELECT is(
  (SELECT count(*)::integer
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND has_table_privilege('authenticated',c.oid,'TRUNCATE')),
  0,
  'authenticated não possui TRUNCATE em tabela pública'
);
SELECT is(
  (SELECT count(*)::integer
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),
  0,
  'anon não possui DML direto em tabelas públicas'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public.replace_approval_flow_steps(uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.replace_approval_flow_steps(uuid,jsonb)','EXECUTE'),
  'helper legado de configuração não é API pública'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.submit_purchase_request(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.submit_purchase_request(uuid)','EXECUTE'),
  'submit_purchase_request legado não contorna executor canônico'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.trigger_rebuild_permissions()','EXECUTE'),
  'trigger de rebuild não é executável diretamente'
);
SELECT ok(
  has_function_privilege('authenticated','public.execute_entity_action(text,uuid,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.execute_entity_action(text,uuid,text,jsonb)','EXECUTE'),
  'executor canônico é autenticado e não anônimo'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('approval_requests','approval_request_steps')
     AND cmd <> 'SELECT'),
  0,
  'workflow state não possui policies de escrita direta'
);
SELECT ok(
  NOT has_table_privilege('authenticated','public.approval_requests','INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated','public.approval_request_steps','INSERT,UPDATE,DELETE'),
  'workflow state também não possui grants DML diretos'
);

-- U ordinary, X unrelated, D Diretoria, M1/M2 Master candidates.
INSERT INTO auth.users(id,email) VALUES
  ('bd000000-0000-0000-0000-000000000001','b-u@test.local'),
  ('bd000000-0000-0000-0000-000000000002','b-x@test.local'),
  ('bd000000-0000-0000-0000-000000000003','b-d@test.local'),
  ('bd000000-0000-0000-0000-000000000004','b-m1@test.local'),
  ('bd000000-0000-0000-0000-000000000005','b-m2@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('bd000000-0000-0000-0000-000000000001','B U','b-u@test.local',true),
  ('bd000000-0000-0000-0000-000000000002','B X','b-x@test.local',true),
  ('bd000000-0000-0000-0000-000000000003','B D','b-d@test.local',true),
  ('bd000000-0000-0000-0000-000000000004','B M1','b-m1@test.local',true),
  ('bd000000-0000-0000-0000-000000000005','B M2','b-m2@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;
INSERT INTO public.roles(id,key,name,is_master,active,is_system) VALUES
  ('bd100000-0000-0000-0000-000000000001','colaborador','Colaborador',false,true,true),
  ('bd100000-0000-0000-0000-000000000002','diretoria','Diretoria',false,true,true),
  ('bd100000-0000-0000-0000-000000000003','master','Master',true,true,true)
ON CONFLICT (key) DO UPDATE SET active=true,is_master=EXCLUDED.is_master;
INSERT INTO public.user_role_assignments(user_id,role_id,assigned_by) VALUES
  ('bd000000-0000-0000-0000-000000000001','bd100000-0000-0000-0000-000000000001',NULL),
  ('bd000000-0000-0000-0000-000000000002','bd100000-0000-0000-0000-000000000001',NULL),
  ('bd000000-0000-0000-0000-000000000003','bd100000-0000-0000-0000-000000000002',NULL),
  ('bd000000-0000-0000-0000-000000000004','bd100000-0000-0000-0000-000000000003',NULL),
  ('bd000000-0000-0000-0000-000000000005','bd100000-0000-0000-0000-000000000002',NULL)
ON CONFLICT DO NOTHING;

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SELECT is(
  (public.set_user_role_assignment(
    'bd000000-0000-0000-0000-000000000003',
    'bd100000-0000-0000-0000-000000000003'
  )->>'error'),
  'MASTER_REQUIRED',
  'Diretoria não se autopromove a Master'
);
SELECT is(
  (public.set_user_role_assignment(
    'bd000000-0000-0000-0000-000000000002',
    'bd100000-0000-0000-0000-000000000003'
  )->>'error'),
  'MASTER_REQUIRED',
  'Diretoria não promove terceiro a Master'
);
SELECT throws_ok(
  $$INSERT INTO public.user_role_assignments(user_id,role_id,assigned_by)
    VALUES ('bd000000-0000-0000-0000-000000000003','bd100000-0000-0000-0000-000000000003','bd000000-0000-0000-0000-000000000003')$$,
  'permission denied for table user_role_assignments',
  'Diretoria não contorna boundary por DML direto'
);

SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SELECT ok(
  (public.set_user_role_assignment(
    'bd000000-0000-0000-0000-000000000005',
    'bd100000-0000-0000-0000-000000000003'
  )->>'success')::boolean,
  'Master atribui Master pela RPC canônica'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE action='ROLE_ASSIGNMENT_SET'
     AND entity_id='bd000000-0000-0000-0000-000000000005'),
  1,
  'atribuição Master gera audit autoritativo'
);
SELECT ok(
  (public.set_user_role_assignment(
    'bd000000-0000-0000-0000-000000000004',
    'bd100000-0000-0000-0000-000000000001'
  )->>'success')::boolean,
  'um Master pode sair quando outro permanece'
);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
SELECT is(
  (public.set_user_role_assignment(
    'bd000000-0000-0000-0000-000000000005',
    'bd100000-0000-0000-0000-000000000001'
  )->>'error'),
  'LAST_MASTER_PROTECTED',
  'remoção do último Master é negada'
);

SELECT set_config('role','postgres',true);
SELECT set_config('request.jwt.claims','{}',true);

INSERT INTO public.purchases(
  id,requester_user_id,status,category,description,priority,estimated_value
) VALUES (
  'bd200000-0000-0000-0000-000000000001',
  'bd000000-0000-0000-0000-000000000001','rascunho','Operação','Compra editável','normal',100
);

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT throws_ok(
  $$UPDATE public.purchases SET status='pago'
    WHERE id='bd200000-0000-0000-0000-000000000001'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester não altera status financeiro diretamente'
);
SELECT throws_ok(
  $$UPDATE public.purchases SET approved_value=999999
    WHERE id='bd200000-0000-0000-0000-000000000001'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester não altera approved_value diretamente'
);
SELECT lives_ok(
  $$UPDATE public.purchases SET description='Compra legítima corrigida'
    WHERE id='bd200000-0000-0000-0000-000000000001'$$,
  'requester edita campo legítimo do próprio rascunho'
);
SELECT is(
  (SELECT description FROM public.purchases WHERE id='bd200000-0000-0000-0000-000000000001'),
  'Compra legítima corrigida',
  'edição legítima foi persistida'
);

-- Authoritative date and required-data rules via direct API writes.
SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo
    ) VALUES (
      'bd300000-0000-0000-0000-000000000001','bd000000-0000-0000-0000-000000000001',
      100,current_date-1,'rascunho','abastecimento','ABC1D23','Data passada'
    )$$,
  'FUEL_DATE_MUST_BE_TODAY_OR_FUTURE',
  'backend rejeita Abastecimento passado'
);
SELECT lives_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo
    ) VALUES (
      'bd300000-0000-0000-0000-000000000002','bd000000-0000-0000-0000-000000000001',
      100,current_date+1,'rascunho','abastecimento','ABC1D23','Data futura válida'
    )$$,
  'backend aceita Abastecimento futuro conforme contrato atual'
);
SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,daily_category,
      person_name,daily_value,daily_start_date,daily_end_date,daily_start_time,
      daily_end_time,daily_destination,notes
    ) VALUES (
      'bd300000-0000-0000-0000-000000000003','bd000000-0000-0000-0000-000000000001',
      100,current_date-1,'rascunho','diaria','Serviço','Profissional',100,
      current_date-1,current_date-1,'08:00','18:00','Obra','Execução'
    )$$,
  'DAILY_DATE_MUST_BE_TODAY_OR_FUTURE',
  'backend rejeita início passado de Diária'
);
SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,categoria,notes,
      payment_method,pix_key
    ) VALUES (
      'bd300000-0000-0000-0000-000000000004','bd000000-0000-0000-0000-000000000001',
      100,current_date+1,'rascunho','reembolso','Viagem','Despesa','pix','12345678901'
    )$$,
  'REIMBURSEMENT_FUTURE_DATE_DENIED',
  'backend rejeita data futura de Reembolso'
);
SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,categoria,notes,
      payment_method,bank_name,bank_agency,bank_account
    ) VALUES (
      'bd300000-0000-0000-0000-000000000005','bd000000-0000-0000-0000-000000000001',
      100,current_date,'rascunho','reembolso','Viagem','Despesa','banco','Banco','','123'
    )$$,
  'REIMBURSEMENT_BANK_DATA_REQUIRED',
  'backend exige dados bancários do Reembolso'
);
INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,categoria,notes,
  payment_method,pix_key
) VALUES (
  'bd300000-0000-0000-0000-000000000006','bd000000-0000-0000-0000-000000000001',
  100,current_date,'rascunho','reembolso','Viagem','Despesa válida','pix','12345678901'
);
SELECT is(
  (public.execute_entity_action(
    'reembolso','bd300000-0000-0000-0000-000000000006','enviar','{}'
  )->>'code'),
  '422',
  'backend exige comprovante antes de enviar Reembolso'
);

-- Request limit: no configuration means unlimited; configured value is enforced.
SELECT set_config('role','postgres',true);
CREATE OR REPLACE FUNCTION pg_temp.set_fuel_status(p_id uuid,p_status public.fuel_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN UPDATE public.fuel_requests SET status=p_status WHERE id=p_id; END $$;
SELECT lives_ok(
  $$SELECT pg_temp.set_fuel_status('bd300000-0000-0000-0000-000000000002','enviado')$$,
  'sem configuração de limite não existe bloqueio arbitrário'
);
INSERT INTO public.request_limits(role,request_type,daily_limit)
VALUES ('colaborador','abastecimento',1);
INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo
) VALUES (
  'bd300000-0000-0000-0000-000000000007','bd000000-0000-0000-0000-000000000001',
  100,current_date+1,'rascunho','abastecimento','DEF4G56','Segundo abastecimento'
);
SELECT throws_ok(
  $$SELECT pg_temp.set_fuel_status('bd300000-0000-0000-0000-000000000007','enviado')$$,
  'REQUEST_LIMIT_REACHED: 1/1',
  'limite configurado é imposto no backend'
);

-- Fleet attachment metadata cannot be removed after the mutable state closes.
DELETE FROM public.request_limits WHERE role='colaborador' AND request_type='abastecimento';
INSERT INTO public.fuel_attachments(id,fuel_request_id,type,file_path)
VALUES (
  'bd310000-0000-0000-0000-000000000001',
  'bd300000-0000-0000-0000-000000000007','nota_fiscal','requests/test/locked.pdf'
);
UPDATE public.fuel_requests SET status='enviado'
WHERE id='bd300000-0000-0000-0000-000000000007';
CREATE OR REPLACE FUNCTION pg_temp.delete_fuel_attachment(p_id uuid)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.fuel_attachments WHERE id=p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $fn$;
SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is(
  pg_temp.delete_fuel_attachment('bd310000-0000-0000-0000-000000000001'),
  0,
  'solicitante não apaga metadata de comprovante após fechamento da edição'
);

-- Purchase bucket is private/bounded and follows Action Context.
SELECT set_config('role','postgres',true);
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata) VALUES (
  'bd400000-0000-0000-0000-000000000001','purchase-attachments',
  'requests/bd200000-0000-0000-0000-000000000001/budget.pdf',
  'bd000000-0000-0000-0000-000000000001','{"mimetype":"application/pdf"}'::jsonb
);
SELECT ok(
  (SELECT public IS FALSE AND file_size_limit=10485760
     AND allowed_mime_types=ARRAY['image/jpeg','image/png','application/pdf']::text[]
   FROM storage.buckets WHERE id='purchase-attachments'),
  'purchase-attachments é privado, limitado e MIME-frozen'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname LIKE 'Action Context % purchase files'),
  4,
  'purchase-attachments possui policies explícitas por operação'
);
SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id='bd400000-0000-0000-0000-000000000001'),
  0,
  'usuário não relacionado não lê attachment de Compra'
);
SELECT set_config('request.jwt.claims','{"sub":"bd000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id='bd400000-0000-0000-0000-000000000001'),
  1,
  'requester lê attachment da própria Compra'
);

-- Client telemetry cannot forge authoritative security/workflow audit entries.
SELECT throws_ok(
  $$INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id)
    VALUES ('bd000000-0000-0000-0000-000000000001','APPROVAL_FAKE','purchases','fake')$$,
  'permission denied for table audit_logs',
  'cliente não forja evento autoritativo no audit log'
);
SELECT throws_ok(
  $$INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id)
    VALUES ('bd000000-0000-0000-0000-000000000002','profile_view','profiles','self')$$,
  'permission denied for table audit_logs',
  'checkpoint autoritativo posterior também impede telemetria direta do cliente'
);
SELECT set_config('role','postgres',true);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE action='profile_view' AND entity_id='self'),
  0,
  'nenhuma telemetria do navegador entra na trilha autoritativa'
);

-- Readiness remains blocked without invented assignments and V2 stays inactive.
SELECT is((SELECT count(*)::integer FROM public.approval_flows WHERE version='v2'),6,'existem 6 flows V2');
SELECT is(
  (SELECT count(*)::integer FROM public.approval_flow_steps s
   JOIN public.approval_flows f ON f.id=s.flow_id WHERE f.version='v2'),
  17,
  'existem 17 steps V2'
);
SELECT is((SELECT count(*)::integer FROM public.approval_flows WHERE version='v2' AND active),0,'V2 continua inativo');
SELECT is(
  (SELECT count(*)::integer FROM public.approval_flow_steps s
   JOIN public.approval_flows f ON f.id=s.flow_id
   WHERE f.version='v2' AND (
     (COALESCE(s.assignment_mode,'person')='person' AND (
       s.approver_user_id IS NULL OR s.substitute_user_id IS NULL
       OR s.approver_user_id=s.substitute_user_id
     ))
     OR s.default_sla_hours IS NULL OR s.default_sla_hours <= 0
   )),
  17,
  'as 17 etapas permanecem corretamente bloqueadas sem assignments inventados'
);

SELECT * FROM finish();
ROLLBACK;
