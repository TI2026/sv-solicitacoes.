-- Checkpoint C: contrato empresarial autoritativo de Diárias.
BEGIN;
SELECT * FROM no_plan();

INSERT INTO auth.users(id,email)
VALUES ('cc000000-0000-0000-0000-000000000001','checkpoint-c@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id,full_name,email,active)
VALUES ('cc000000-0000-0000-0000-000000000001','Checkpoint C','checkpoint-c@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

SELECT set_config('role','authenticated',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cc000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

INSERT INTO public.fuel_requests(
  id,requester_user_id,type,status,data_abastecimento,daily_end_date,daily_days,
  daily_category,person_name,motivo,daily_value,valor,payment_method,pix_key
) VALUES (
  'cc100000-0000-0000-0000-000000000001','cc000000-0000-0000-0000-000000000001',
  'diaria','rascunho',current_date,current_date,99,
  'Viagem','Profissional Um','Atendimento local',100,999,'pix','11999999999'
);

SELECT is(
  (SELECT daily_days FROM public.fuel_requests WHERE id='cc100000-0000-0000-0000-000000000001'),
  1,
  'um único dia é contado de forma inclusiva'
);
SELECT is(
  (SELECT valor FROM public.fuel_requests WHERE id='cc100000-0000-0000-0000-000000000001'),
  100::numeric,
  'backend ignora total manipulado e recalcula diária de um dia'
);

INSERT INTO public.fuel_requests(
  id,requester_user_id,type,status,data_abastecimento,daily_end_date,daily_days,
  daily_category,person_name,motivo,daily_value,valor,payment_method,
  bank_name,bank_agency,bank_account
) VALUES (
  'cc100000-0000-0000-0000-000000000002','cc000000-0000-0000-0000-000000000001',
  'diaria','rascunho',current_date,current_date+4,1,
  'Viagem','Profissional Dois','Atendimento regional',100,1,'banco',
  'Banco Teste','0001','12345-6'
);

SELECT is(
  (SELECT daily_days FROM public.fuel_requests WHERE id='cc100000-0000-0000-0000-000000000002'),
  5,
  'período de cinco datas corridas conta início e fim'
);
SELECT is(
  (SELECT valor FROM public.fuel_requests WHERE id='cc100000-0000-0000-0000-000000000002'),
  500::numeric,
  'backend calcula total de múltiplos dias pela tarifa'
);

SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      requester_user_id,type,status,data_abastecimento,daily_end_date,daily_category,
      person_name,motivo,daily_value,valor,payment_method,pix_key
    ) VALUES (
      'cc000000-0000-0000-0000-000000000001','diaria','rascunho',current_date+1,current_date,
      'Viagem','Inválido','Destino',100,100,'pix','11999999999'
    )$$,
  'DAILY_END_BEFORE_START',
  'backend rejeita data final anterior à inicial'
);

SELECT throws_ok(
  $$INSERT INTO public.fuel_requests(
      requester_user_id,type,status,data_abastecimento,daily_end_date,daily_category,
      person_name,motivo,daily_value,valor,payment_method
    ) VALUES (
      'cc000000-0000-0000-0000-000000000001','diaria','rascunho',current_date,current_date,
      'Viagem','Sem pagamento','Destino',100,100,NULL
    )$$,
  'DAILY_PAYMENT_METHOD_INVALID',
  'backend rejeita diária sem dados de pagamento'
);

SELECT set_config('role','postgres',true);
INSERT INTO public.fuel_requests(
  id,requester_user_id,type,status,data_abastecimento,daily_category,
  person_name,daily_value,valor
) VALUES (
  'cc100000-0000-0000-0000-000000000003','cc000000-0000-0000-0000-000000000001',
  'diaria','rascunho',current_date,'Viagem','Legado inválido',100,100
);

SELECT throws_ok(
  $$INSERT INTO public.approval_requests(
      module_id,flow_id,reference_id,requester_user_id,status,current_step_order
    )
    SELECT f.module_id,f.id,'cc100000-0000-0000-0000-000000000003',
           'cc000000-0000-0000-0000-000000000001','awaiting_step',1
      FROM public.approval_flows f
      JOIN public.approval_modules m ON m.id=f.module_id
     WHERE m.code='diaria'
     ORDER BY f.created_at DESC
     LIMIT 1$$,
  'DAILY_SUBMISSION_INVALID',
  'guard impede iniciar workflow com rascunho legado inválido'
);

SELECT ok(
  NOT has_function_privilege('authenticated','public.guard_daily_approval_submission()','EXECUTE')
  AND NOT has_function_privilege('anon','public.guard_daily_approval_submission()','EXECUTE'),
  'guard de submissão não é RPC pública'
);

SELECT * FROM finish();
ROLLBACK;
