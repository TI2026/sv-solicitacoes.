BEGIN;
SELECT * FROM no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('fc000000-0000-0000-0000-000000000001','checkpoint6-daily@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('fc000000-0000-0000-0000-000000000001','Checkpoint 6 Daily','checkpoint6-daily@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

SELECT set_config('request.jwt.claim.sub','fc000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);

-- Client values are deliberately forged. The BEFORE trigger must replace both.
INSERT INTO public.fuel_requests(
  id,requester_user_id,type,status,data_abastecimento,valor,
  daily_start_date,daily_end_date,daily_start_time,daily_end_time,
  daily_quantity,daily_value,daily_category,daily_destination,person_name,notes
) VALUES (
  'fc100000-0000-0000-0000-000000000001',
  'fc000000-0000-0000-0000-000000000001','diaria','rascunho',current_date,1,
  current_date,current_date+6,'08:00','18:00',999,150,
  'visita_tecnica','Porto Alegre - RS','Prestador Teste','Atividade externa programada'
);

SELECT set_config('role','postgres',true);
SELECT is(
  (SELECT daily_quantity FROM public.fuel_requests
    WHERE id='fc100000-0000-0000-0000-000000000001'),
  7,
  'backend recalcula quantidade inclusiva adulterada pelo frontend'
);
SELECT is(
  (SELECT valor FROM public.fuel_requests
    WHERE id='fc100000-0000-0000-0000-000000000001'),
  1050.00::numeric,
  'backend recalcula total adulterado pelo frontend'
);

SELECT set_config('role','authenticated',true);
SELECT throws_ok(
  $$
    INSERT INTO public.fuel_requests(
      requester_user_id,type,data_abastecimento,valor,daily_start_date,daily_end_date,
      daily_start_time,daily_end_time,daily_value,daily_category,daily_destination,person_name,notes
    ) VALUES (
      'fc000000-0000-0000-0000-000000000001','diaria',current_date,100,
      current_date+1,current_date,'08:00','18:00',100,'servico','Destino','Pessoa','Justificativa'
    )
  $$,
  'P0001',
  'DAILY_PERIOD_INVALID',
  'backend rejeita data final anterior à inicial'
);
SELECT throws_ok(
  $$
    INSERT INTO public.fuel_requests(
      requester_user_id,type,data_abastecimento,valor,daily_start_date,daily_end_date,
      daily_start_time,daily_end_time,daily_value,daily_category,daily_destination,person_name,notes
    ) VALUES (
      'fc000000-0000-0000-0000-000000000001','diaria',current_date,100,
      current_date,current_date,'18:00','08:00',100,'servico','Destino','Pessoa','Justificativa'
    )
  $$,
  'P0001',
  'DAILY_END_MUST_BE_AFTER_START',
  'backend rejeita hora final anterior no mesmo dia'
);

-- Proof checks happen in the only public workflow executor.
INSERT INTO public.fuel_requests(
  id,requester_user_id,type,status,data_abastecimento,valor,categoria,notes,
  payment_method,pix_key
) VALUES (
  'fc100000-0000-0000-0000-000000000002',
  'fc000000-0000-0000-0000-000000000001','reembolso','rascunho',current_date,50,
  'transporte','Despesa de transporte','pix','00000000000'
);
SELECT is(
  (public.execute_entity_action(
    'reembolso','fc100000-0000-0000-0000-000000000002','enviar'
  ))->>'code',
  '422',
  'Reembolso não envia sem comprovante persistido'
);
SELECT is(
  (public.execute_entity_action(
    'diaria','fc100000-0000-0000-0000-000000000001','enviar_comprovantes'
  ))->>'code',
  '422',
  'Diária não avança execução sem comprovante persistido'
);

SELECT set_config('role','postgres',true);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime'
       AND schemaname='public'
       AND tablename IN ('candidates','candidate_documents')
  ),
  'PII de candidatos permanece fora da publication após fresh replay'
);

SELECT * FROM finish();
ROLLBACK;
