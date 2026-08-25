BEGIN;
SELECT * FROM no_plan();

SELECT ok(
  pg_get_functiondef('public.start_approval_flow(text,uuid,uuid)'::regprocedure)
    LIKE '%active = true AND version = ''v2''%',
  'novas requests selecionam somente flow V2 ativo'
);
SELECT ok(
  pg_get_functiondef('public._execute_entity_action_checkpoint_b(text,uuid,text,jsonb)'::regprocedure)
    NOT LIKE '%v_request.status = ''awaiting_step''%',
  'executor reconhece awaiting_step_N legado'
);
SELECT ok(
  pg_get_functiondef('public._get_entity_action_context_checkpoint_b(text,uuid)'::regprocedure)
    NOT LIKE '%v_request.status = ''awaiting_step''%',
  'Action Context reconhece awaiting_step_N legado'
);

INSERT INTO auth.users(id,email) VALUES
  ('fb000000-0000-0000-0000-000000000001','operational-requester@test.local'),
  ('fb000000-0000-0000-0000-000000000002','operational-approver@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('fb000000-0000-0000-0000-000000000001','Operational Requester','operational-requester@test.local',true),
  ('fb000000-0000-0000-0000-000000000002','Operational Approver','operational-approver@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

-- Somente V1 ativo: envio novo precisa ser bloqueado sem criar request.
UPDATE public.approval_flows SET active=false
WHERE module_id=(SELECT id FROM public.approval_modules WHERE code='compras');
INSERT INTO public.approval_flows(id,module_id,name,active,version,approval_type)
VALUES (
  'fb100000-0000-0000-0000-000000000001',
  (SELECT id FROM public.approval_modules WHERE code='compras'),
  'Legacy V1 blocked for new requests',true,'v1','sequential'
);
INSERT INTO public.approval_flow_steps(
  id,flow_id,step_order,approver_type,approver_user_id,step_code,step_name,active
) VALUES (
  'fb110000-0000-0000-0000-000000000001',
  'fb100000-0000-0000-0000-000000000001',1,'usuario_fixo',
  'fb000000-0000-0000-0000-000000000002','legacy_step','Legacy step',true
);
INSERT INTO public.purchases(id,requester_user_id,status,category,description)
VALUES (
  'fb120000-0000-0000-0000-000000000001',
  'fb000000-0000-0000-0000-000000000001','rascunho','Operação','Cutover gate'
);

SELECT set_config('request.jwt.claim.sub','fb000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is(
  (public.execute_entity_action(
    'compras','fb120000-0000-0000-0000-000000000001','enviar'
  ))->>'message',
  'APPROVAL_ENGINE_AWAITING_ACTIVATION',
  'envio novo informa que o Motor V2 aguarda ativação/configuração'
);
SELECT set_config('role','postgres',true);
SELECT is(
  (SELECT count(*)::integer FROM public.approval_requests
    WHERE reference_id='fb120000-0000-0000-0000-000000000001'),
  0,
  'bloqueio pré-cutover não cria request V1'
);
SELECT is(
  (SELECT status::text FROM public.purchases
    WHERE id='fb120000-0000-0000-0000-000000000001'),
  'rascunho',
  'bloqueio pré-cutover preserva a entidade'
);

-- Instância V1 preexistente: contexto, fila, devolução, reenvio e aprovação.
INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo
) VALUES (
  'fb200000-0000-0000-0000-000000000001',
  'fb000000-0000-0000-0000-000000000001',100,current_date,'em_aprovacao',
  'abastecimento','ABC1D23','Compatibilidade V1'
);
INSERT INTO public.approval_requests(
  id,module_id,flow_id,reference_id,requester_user_id,status,
  current_step_order,current_approver_user_id
) VALUES (
  'fb210000-0000-0000-0000-000000000001',
  (SELECT id FROM public.approval_modules WHERE code='abastecimento'),
  (SELECT id FROM public.approval_flows
    WHERE module_id=(SELECT id FROM public.approval_modules WHERE code='abastecimento')
      AND version='v1' ORDER BY created_at LIMIT 1),
  'fb200000-0000-0000-0000-000000000001',
  'fb000000-0000-0000-0000-000000000001','awaiting_step_1',1,
  'fb000000-0000-0000-0000-000000000002'
);
INSERT INTO public.approval_request_steps(
  approval_request_id,step_order,approver_user_id,status,flow_version,
  step_code,step_name
) VALUES (
  'fb210000-0000-0000-0000-000000000001',1,
  'fb000000-0000-0000-0000-000000000002','pending','v1',
  'aprovacao_supervisor','Aprovação supervisor'
);

SELECT set_config('request.jwt.claim.sub','fb000000-0000-0000-0000-000000000002',true);
SELECT set_config('role','authenticated',true);
SELECT ok(
  (public.get_entity_action_context(
    'abastecimento','fb200000-0000-0000-0000-000000000001'
  )).allowed_actions ? 'aprovar',
  'ator V1 recebe botão Aprovar pelo Action Context'
);
SELECT is(
  (SELECT count(*)::integer FROM public.get_my_approval_queue()
    WHERE id='fb210000-0000-0000-0000-000000000001'),
  1,
  'request V1 preexistente permanece na fila do responsável'
);
SELECT is(
  (public.execute_entity_action(
    'abastecimento','fb200000-0000-0000-0000-000000000001','devolver',
    jsonb_build_object('notes','Corrigir os dados informados')
  ))->>'code',
  '200',
  'responsável consegue devolver request V1'
);
SELECT set_config('role','postgres',true);
SELECT is(
  (SELECT ended_at IS NULL FROM public.approval_requests
    WHERE id='fb210000-0000-0000-0000-000000000001'),
  true,
  'request V1 devolvida permanece aberta para reenvio'
);

SELECT set_config('request.jwt.claim.sub','fb000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is(
  (public.execute_entity_action(
    'abastecimento','fb200000-0000-0000-0000-000000000001','enviar'
  ))->>'code',
  '200',
  'solicitante reenvia a mesma request V1 devolvida'
);
SELECT set_config('role','postgres',true);
SELECT is(
  (SELECT count(*)::integer FROM public.approval_requests
    WHERE reference_id='fb200000-0000-0000-0000-000000000001'),
  1,
  'reenvio V1 não cria uma segunda request'
);

SELECT set_config('request.jwt.claim.sub','fb000000-0000-0000-0000-000000000002',true);
SELECT set_config('role','authenticated',true);
SELECT is(
  (public.execute_entity_action(
    'abastecimento','fb200000-0000-0000-0000-000000000001','aprovar'
  ))->>'code',
  '200',
  'responsável consegue aprovar request V1 reenviada'
);

SELECT * FROM finish();
ROLLBACK;
