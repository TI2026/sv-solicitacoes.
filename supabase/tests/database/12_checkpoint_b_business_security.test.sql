-- Checkpoint B: business rules, security negatives, snapshot, notifications and SLA.
BEGIN;
SELECT * FROM no_plan();

-- Effective grants: legacy workflow setters stay private.
SELECT ok(
  NOT has_function_privilege('authenticated', p.oid, 'execute')
  AND NOT has_function_privilege('anon', p.oid, 'execute'),
  p.proname || ' permanece privado'
)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('admission_set_status','fuel_set_status','termination_set_status');

SELECT is(
  (SELECT count(*)::integer FROM cron.job
   WHERE active AND command = 'SELECT public._engine_sla_sweep();'),
  1,
  'existe exatamente um scheduler SLA V2'
);
SELECT is(
  (SELECT schedule FROM cron.job
   WHERE active AND command = 'SELECT public._engine_sla_sweep();'),
  '*/15 * * * *',
  'scheduler SLA executa a cada 15 minutos'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname LIKE '%admissions files'),
  4,
  'Admissions Storage possui SELECT/INSERT/UPDATE/DELETE explícitos'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname LIKE 'Authorized users can % epi files'),
  4,
  'EPI Storage possui SELECT/INSERT/UPDATE/DELETE explícitos'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname = 'Purchases bucket requires authentication'),
  0,
  'bucket legado purchases não possui FOR ALL authenticated'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('approval_requests','approval_request_steps')
     AND cmd <> 'SELECT'),
  0,
  'approval request e steps não permitem escrita direta'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('roles','user_role_assignments','role_permission_matrix')
     AND cmd <> 'SELECT'),
  0,
  'role escalation e matriz não possuem mutation direta por RLS'
);

-- Fixtures U (ordinary), O (owner) and M (Master).
INSERT INTO auth.users(id,email) VALUES
  ('cb000000-0000-0000-0000-000000000001','checkpoint-b-u@test.local'),
  ('cb000000-0000-0000-0000-000000000002','checkpoint-b-o@test.local'),
  ('cb000000-0000-0000-0000-000000000003','checkpoint-b-m@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('cb000000-0000-0000-0000-000000000001','Checkpoint B U','checkpoint-b-u@test.local',true),
  ('cb000000-0000-0000-0000-000000000002','Checkpoint B O','checkpoint-b-o@test.local',true),
  ('cb000000-0000-0000-0000-000000000003','Checkpoint B M','checkpoint-b-m@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

INSERT INTO public.roles(key,name,is_master,active)
VALUES ('master','Master',true,true)
ON CONFLICT (key) DO UPDATE SET is_master=true,active=true;
INSERT INTO public.user_role_assignments(user_id,role_id)
SELECT 'cb000000-0000-0000-0000-000000000003',id FROM public.roles WHERE key='master'
ON CONFLICT DO NOTHING;

INSERT INTO public.purchases(
  id, requester_user_id, status, category, description, priority, estimated_value
) VALUES (
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'rascunho','teste','Compra protegida','baixa',100
);

SELECT set_config('role','authenticated',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cb000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$UPDATE public.purchases SET status='em_aprovacao' WHERE id='cb100000-0000-0000-0000-000000000001'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'ordinary U não altera status controlado de Compras'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cb000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$UPDATE public.purchases SET status='em_aprovacao' WHERE id='cb100000-0000-0000-0000-000000000001'$$,
  'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action',
  'Master também não possui bypass bruto de Compras'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cb000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      id,requester_user_id,valor,data_abastecimento,status,type,categoria,
      notes,payment_method,pix_key
    ) VALUES (
      'cb200000-0000-0000-0000-000000000001',
      'cb000000-0000-0000-0000-000000000001',100,current_date+1,
      'rascunho','reembolso','Viagem','Despesa comprovada','pix','12345678901'
    )$$,
  'REIMBURSEMENT_FUTURE_DATE_DENIED',
  'backend rejeita data futura de Reembolso via API direta'
);

SELECT is(
  (public.set_user_role_assignment(
    'cb000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.roles WHERE key='master')
  )->>'error'),
  'MASTER_REQUIRED',
  'ordinary U não atribui Master pela RPC legítima'
);

SELECT set_config('role','postgres',true);
SELECT set_config('request.jwt.claims','{}',true);

-- Snapshot V2: request references an inactive clone and ignores later template edits.
UPDATE public.approval_flows SET active=false
WHERE module_id=(SELECT id FROM public.approval_modules WHERE code='compras');
UPDATE public.approval_flows
SET active=true
WHERE id = (
  SELECT f.id FROM public.approval_flows f
  JOIN public.approval_modules m ON m.id=f.module_id
  WHERE f.version='v2' AND m.code='compras'
  LIMIT 1
);

INSERT INTO public.approval_requests(
  id,module_id,flow_id,reference_id,requester_user_id,current_step_order,
  current_approver_user_id,status
)
SELECT
  'cb300000-0000-0000-0000-000000000001',f.module_id,f.id,
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',1,
  'cb000000-0000-0000-0000-000000000002','awaiting_step'
FROM public.approval_flows f
JOIN public.approval_modules m ON m.id=f.module_id
WHERE f.version='v2' AND f.active AND m.code='compras';

INSERT INTO public.approval_request_steps(
  id,approval_request_id,flow_step_id,step_order,approver_user_id,status,
  flow_version,step_code,step_name,completion_action
)
SELECT
  'cb400000-0000-0000-0000-000000000001',
  'cb300000-0000-0000-0000-000000000001',s.id,s.step_order,
  'cb000000-0000-0000-0000-000000000002','pending','v2',
  s.step_code,s.step_name,s.completion_action
FROM public.approval_flow_steps s
JOIN public.approval_flows f ON f.id=s.flow_id
JOIN public.approval_modules m ON m.id=f.module_id
WHERE f.version='v2' AND f.active AND m.code='compras' AND s.step_order=1;

SELECT is(
  (SELECT f.version FROM public.approval_requests ar
   JOIN public.approval_flows f ON f.id=ar.flow_id
   WHERE ar.id='cb300000-0000-0000-0000-000000000001'),
  'v2-snapshot',
  'request V2 referencia cópia imutável do fluxo'
);
SELECT ok(
  (SELECT NOT f.active FROM public.approval_requests ar
   JOIN public.approval_flows f ON f.id=ar.flow_id
   WHERE ar.id='cb300000-0000-0000-0000-000000000001'),
  'snapshot não participa da seleção de novos fluxos'
);

UPDATE public.approval_flow_steps
SET default_sla_hours=default_sla_hours + 1
WHERE flow_id=(
  SELECT f.id FROM public.approval_flows f
  JOIN public.approval_modules m ON m.id=f.module_id
  WHERE f.version='v2' AND f.active AND m.code='compras'
)
AND step_order=1;

SELECT ok(
  (SELECT snapshot.default_sla_hours IS DISTINCT FROM live.default_sla_hours
   FROM public.approval_request_steps ars
   JOIN public.approval_flow_steps snapshot ON snapshot.id=ars.flow_step_id
   JOIN public.approval_flow_steps live
     ON live.step_order=snapshot.step_order
    AND live.flow_id=(
      SELECT f.id FROM public.approval_flows f
      JOIN public.approval_modules m ON m.id=f.module_id
      WHERE f.version='v2' AND f.active AND m.code='compras'
    )
   WHERE ars.id='cb400000-0000-0000-0000-000000000001'),
  'alteração live de SLA não muda snapshot da request em andamento'
);

UPDATE public.approval_requests
SET status='waiting_operational',current_approver_user_id=NULL
WHERE id='cb300000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*)::integer FROM public.notifications
   WHERE user_id='cb000000-0000-0000-0000-000000000001'
     AND metadata->>'type'='approval_waiting_operational'),
  1,
  'waiting_operational notifica requester uma vez'
);
SELECT is(
  (SELECT metadata->>'link' FROM public.notifications
   WHERE user_id='cb000000-0000-0000-0000-000000000001'
     AND metadata->>'type'='approval_waiting_operational'),
  '/purchases/cb100000-0000-0000-0000-000000000001',
  'notification metadata contém deep-link correto do módulo'
);
SELECT ok(
  (SELECT metadata ?& ARRAY['module_key','entity_id','approval_request_id','action','status','link']
   FROM public.notifications
   WHERE user_id='cb000000-0000-0000-0000-000000000001'
     AND metadata->>'type'='approval_waiting_operational'),
  'notification persiste metadata operacional completa'
);

-- SLA usa o actor snapshot/substitute e grava auditoria idempotente.
UPDATE public.approval_requests
SET status='awaiting_step', current_approver_user_id='cb000000-0000-0000-0000-000000000002'
WHERE id='cb300000-0000-0000-0000-000000000001';
UPDATE public.approval_request_steps
SET status='pending',
    approver_user_id='cb000000-0000-0000-0000-000000000002',
    primary_user_id='cb000000-0000-0000-0000-000000000002',
    substitute_user_id='cb000000-0000-0000-0000-000000000003',
    sla_hours=1, sla_deadline=now()-interval '1 minute',
    escalated_at=NULL, overdue=false
WHERE id='cb400000-0000-0000-0000-000000000001';
DO $$ BEGIN PERFORM public._engine_sla_sweep(); END $$;

SELECT is(
  (SELECT current_approver_user_id FROM public.approval_requests
   WHERE id='cb300000-0000-0000-0000-000000000001'),
  'cb000000-0000-0000-0000-000000000003'::uuid,
  'SLA reatribui para substitute snapshot válido'
);
SELECT is(
  (SELECT count(*)::integer FROM public.notifications
   WHERE user_id='cb000000-0000-0000-0000-000000000003'
     AND metadata->>'type'='approval_sla_reassigned'),
  1,
  'substitute recebe notification de SLA'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE action='APPROVAL_SLA_REASSIGNED'
     AND details->>'step_id'='cb400000-0000-0000-0000-000000000001'),
  1,
  'SLA reassigned possui audit idempotente'
);

UPDATE public.approval_request_steps SET sla_deadline=now()-interval '1 minute'
WHERE id='cb400000-0000-0000-0000-000000000001';
DO $$ BEGIN PERFORM public._engine_sla_sweep(); PERFORM public._engine_sla_sweep(); END $$;
SELECT ok(
  (SELECT overdue FROM public.approval_request_steps
   WHERE id='cb400000-0000-0000-0000-000000000001'),
  'segunda expiração marca etapa overdue'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE action='APPROVAL_SLA_OVERDUE'
     AND details->>'step_id'='cb400000-0000-0000-0000-000000000001'),
  1,
  'SLA overdue não duplica audit em sweeps repetidos'
);

-- Negative RLS checks for foreign files and approval state.
INSERT INTO storage.buckets(id,name,public) VALUES
  ('purchase-attachments','purchase-attachments',false),
  ('admissions','admissions',false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects(id,bucket_id,name,owner_id)
VALUES
  ('cb500000-0000-0000-0000-000000000001','purchase-attachments',
   'requests/cb100000-0000-0000-0000-000000000099/foreign.pdf',
   'cb000000-0000-0000-0000-000000000002'),
  ('cb500000-0000-0000-0000-000000000002','admissions',
   'candidate/private/document.pdf','cb000000-0000-0000-0000-000000000002');

SELECT set_config('role','authenticated',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cb000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id='cb500000-0000-0000-0000-000000000001'),
  0,
  'ordinary U não lê anexo de compra alheia'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE id='cb500000-0000-0000-0000-000000000002'),
  0,
  'ordinary U não lê documento de candidato'
);

SELECT throws_ok(
  $$UPDATE public.approval_requests SET status='completed'
    WHERE id='cb300000-0000-0000-0000-000000000001'$$,
  'permission denied for table approval_requests',
  'ordinary U não atualiza approval_request diretamente'
);
SELECT throws_ok(
  $$UPDATE public.approval_request_steps SET status='approved'
    WHERE id='cb400000-0000-0000-0000-000000000001'$$,
  'permission denied for table approval_request_steps',
  'ordinary U não atualiza approval_step diretamente'
);

SELECT * FROM finish();
ROLLBACK;
