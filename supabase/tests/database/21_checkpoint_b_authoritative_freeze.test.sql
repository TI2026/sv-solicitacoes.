-- Checkpoint B final direct-write and module-isolation regressions.
BEGIN;
SELECT * FROM no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.notifications', 'INSERT'),
  'workflow notifications are backend-only'
);

SELECT is(
  (SELECT count(*)::integer
   FROM pg_trigger
   WHERE tgrelid IN (
     'public.purchases'::regclass,
     'public.fuel_requests'::regclass,
     'public.admission_requests'::regclass,
     'public.termination_requests'::regclass
   )
     AND tgname LIKE 'tr_%_guard_controlled_fields'
     AND (tgtype & 4) = 4),
  4,
  'all entity guards cover INSERT as well as UPDATE'
);

INSERT INTO auth.users(id,email) VALUES
  ('be000000-0000-0000-0000-000000000001','freeze-owner@test.local'),
  ('be000000-0000-0000-0000-000000000002','freeze-other@test.local'),
  ('be000000-0000-0000-0000-000000000003','freeze-master@test.local'),
  ('be000000-0000-0000-0000-000000000004','freeze-rh@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('be000000-0000-0000-0000-000000000001','Freeze Owner','freeze-owner@test.local',true),
  ('be000000-0000-0000-0000-000000000002','Freeze Other','freeze-other@test.local',true),
  ('be000000-0000-0000-0000-000000000003','Freeze Master','freeze-master@test.local',true),
  ('be000000-0000-0000-0000-000000000004','Freeze RH','freeze-rh@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

INSERT INTO public.roles(id,key,name,is_master,active,is_system) VALUES
  ('be100000-0000-0000-0000-000000000001','colaborador','Colaborador',false,true,true),
  ('be100000-0000-0000-0000-000000000002','master','Master',true,true,true),
  ('be100000-0000-0000-0000-000000000003','rh','RH',false,true,true)
ON CONFLICT (key) DO UPDATE SET active=true,is_master=EXCLUDED.is_master;

INSERT INTO public.user_role_assignments(user_id,role_id) VALUES
  ('be000000-0000-0000-0000-000000000001','be100000-0000-0000-0000-000000000001'),
  ('be000000-0000-0000-0000-000000000002','be100000-0000-0000-0000-000000000001'),
  ('be000000-0000-0000-0000-000000000003','be100000-0000-0000-0000-000000000002'),
  ('be000000-0000-0000-0000-000000000004','be100000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

SELECT set_config('role','authenticated',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"be000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$INSERT INTO public.purchases(
      id,requester_user_id,status,category,description,priority,estimated_value
    ) VALUES (
      'be200000-0000-0000-0000-000000000001',
      'be000000-0000-0000-0000-000000000001',
      'pago','Teste','Status forjado','normal',100
    )$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester cannot create a Purchase in a critical status'
);

SELECT throws_ok(
  $$INSERT INTO public.purchases(
      id,requester_user_id,status,category,description,priority,estimated_value,
      approved_value
    ) VALUES (
      'be200000-0000-0000-0000-000000000002',
      'be000000-0000-0000-0000-000000000001',
      'rascunho','Teste','Valor aprovado forjado','normal',100,999
    )$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester cannot seed approved_value during draft creation'
);

SELECT lives_ok(
  $$INSERT INTO public.purchases(
      id,requester_user_id,status,category,description,priority,estimated_value
    ) VALUES (
      'be200000-0000-0000-0000-000000000003',
      'be000000-0000-0000-0000-000000000001',
      'rascunho','Teste','Draft legitimo','normal',100
    )$$,
  'normal Purchase draft creation remains allowed'
);

SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,categoria,notes,
      payment_method,pix_key,paid_at
    ) VALUES (
      'be300000-0000-0000-0000-000000000001',
      'be000000-0000-0000-0000-000000000001',
      100,current_date,'pago','reembolso','Teste','Pagamento forjado',
      'pix','12345678901',now()
    )$$,
  'FUEL_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester cannot create a paid reimbursement'
);

SELECT throws_ok(
  $$INSERT INTO public.admission_requests(
      id,requester_user_id,local_contratacao,centro_custo,cargo_funcao,
      tipo_contrato,jornada,gestor_responsavel,motivo,status,priority
    ) VALUES (
      'be400000-0000-0000-0000-000000000001',
      'be000000-0000-0000-0000-000000000001',
      'Matriz','CC','Analista','CLT','Integral','Gestor','Teste',
      'em_aprovacao','normal'
    )$$,
  'ADMISSION_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'requester cannot create an Admission already in workflow'
);

SELECT throws_ok(
  $$INSERT INTO public.notifications(user_id,title,message)
    VALUES (
      'be000000-0000-0000-0000-000000000001',
      'Fake workflow','Forged by client'
    )$$,
  'permission denied for table notifications',
  'authenticated client cannot forge a persisted workflow notification'
);

INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,
  daily_category,person_name,daily_value,daily_start_date,daily_end_date,
  daily_start_time,daily_end_time,daily_destination,notes
) VALUES (
  'be300000-0000-0000-0000-000000000002',
  'be000000-0000-0000-0000-000000000001',
  100,current_date+1,'rascunho','diaria',
  'Servico','Profissional',100,current_date+1,current_date+1,
  '08:00','18:00','Obra','Diaria valida'
);

SELECT is(
  (public.execute_entity_action(
    'abastecimento',
    'be300000-0000-0000-0000-000000000002',
    'cancelar',
    '{"notes":"tentativa entre tipos"}'::jsonb
  )->>'code'),
  '404',
  'action for abastecimento is denied against a diaria entity'
);

SELECT set_config('request.jwt.claims','{"sub":"be000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SELECT throws_ok(
  $$UPDATE public.purchases
      SET approved_value=500
    WHERE id='be200000-0000-0000-0000-000000000003'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'Master cannot bypass controlled Purchase fields with raw UPDATE'
);

SELECT set_config('role','postgres',true);
SELECT set_config('request.jwt.claims','{}',true);

-- A request for another module with the same UUID must not grant Purchase read.
INSERT INTO public.approval_requests(
  id,module_id,flow_id,reference_id,requester_user_id,status,
  current_step_order,current_approver_user_id
)
SELECT
  'be500000-0000-0000-0000-000000000001',
  f.module_id,f.id,'be200000-0000-0000-0000-000000000003',
  'be000000-0000-0000-0000-000000000001','awaiting_step',1,
  'be000000-0000-0000-0000-000000000002'
FROM public.approval_flows f
JOIN public.approval_modules am ON am.id=f.module_id
WHERE am.code='diaria' AND f.version='v1' AND f.active
LIMIT 1;

INSERT INTO public.approval_request_steps(
  id,approval_request_id,flow_step_id,step_order,approver_user_id,status,
  flow_version,step_code,step_name,completion_action
)
SELECT
  'be510000-0000-0000-0000-000000000001',
  'be500000-0000-0000-0000-000000000001',s.id,1,
  'be000000-0000-0000-0000-000000000002','pending',
  'v1',s.step_code,s.step_name,s.completion_action
FROM public.approval_flow_steps s
WHERE s.flow_id=(
  SELECT flow_id FROM public.approval_requests
  WHERE id='be500000-0000-0000-0000-000000000001'
)
ORDER BY s.step_order
LIMIT 1;

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"be000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT is(
  (SELECT count(*)::integer FROM public.purchases
   WHERE id='be200000-0000-0000-0000-000000000003'),
  0,
  'approver for another module cannot read a Purchase with the same UUID'
);

SELECT set_config('role','postgres',true);
INSERT INTO storage.objects(id,bucket_id,name,owner_id) VALUES
  ('be600000-0000-0000-0000-000000000001','admissions',
   'documents/internal/candidate.pdf','be000000-0000-0000-0000-000000000004'),
  ('be600000-0000-0000-0000-000000000002','epis',
   'internal/employee/epi.pdf','be000000-0000-0000-0000-000000000004');

SELECT set_config('role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"be000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id IN (
     'be600000-0000-0000-0000-000000000001',
     'be600000-0000-0000-0000-000000000002'
   )),
  0,
  'unrelated collaborator cannot read Admissions or EPI documents'
);

SELECT set_config('request.jwt.claims','{"sub":"be000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id IN (
     'be600000-0000-0000-0000-000000000001',
     'be600000-0000-0000-0000-000000000002'
   )),
  2,
  'RH can download the internal Admissions and EPI documents it needs'
);
SELECT lives_ok(
  $$INSERT INTO storage.objects(id,bucket_id,name,owner_id)
    VALUES (
      'be600000-0000-0000-0000-000000000003','admissions',
      'documents/internal/upload.pdf',
      'be000000-0000-0000-0000-000000000004'
    )$$,
  'RH internal upload remains usable'
);
-- Object deletion is intentionally available only through the Storage API;
-- storage.protect_delete() rejects raw SQL even when the RLS policy allows it.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins and RH can delete admissions files'
      AND cmd = 'DELETE'
      AND qual LIKE '%current_has_role%rh%'
  ),
  'Admissions exposes an RH-authorized DELETE policy to the Storage API'
);

SELECT * FROM finish();
ROLLBACK;
