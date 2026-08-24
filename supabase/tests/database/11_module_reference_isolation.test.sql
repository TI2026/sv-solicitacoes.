-- Checkpoint A: equal entity UUIDs in different modules must never cross-talk.
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email)
VALUES ('cb000000-0000-0000-0000-000000000001', 'module-ref-a@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, active)
VALUES (
  'cb000000-0000-0000-0000-000000000001',
  'Module Reference Requester',
  'module-ref-a@test.local',
  true
)
ON CONFLICT (id) DO UPDATE SET active = true;

INSERT INTO public.purchases (
  id, requester_user_id, status, category, description
) VALUES (
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'rascunho',
  'TEST',
  'Module/reference isolation purchase'
);

INSERT INTO public.fuel_requests (
  id, requester_user_id, status, type, valor
) VALUES (
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'rascunho',
  'abastecimento',
  10
);

INSERT INTO public.approval_requests (
  id, module_id, flow_id, reference_id, requester_user_id, status
)
SELECT
  'cb200000-0000-0000-0000-000000000001',
  am.id,
  af.id,
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'draft'
FROM public.approval_modules am
JOIN public.approval_flows af ON af.module_id = am.id AND af.active
WHERE am.code = 'compras'
LIMIT 1;

INSERT INTO public.approval_requests (
  id, module_id, flow_id, reference_id, requester_user_id, status
)
SELECT
  'cb200000-0000-0000-0000-000000000002',
  am.id,
  af.id,
  'cb100000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'draft'
FROM public.approval_modules am
JOIN public.approval_flows af ON af.module_id = am.id AND af.active
WHERE am.code = 'abastecimento'
LIMIT 1;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cb000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config('role', 'authenticated', true);

SELECT is(
  (public.get_entity_action_context(
    'compras', 'cb100000-0000-0000-0000-000000000001'
  )).approval_request_id,
  'cb200000-0000-0000-0000-000000000001'::uuid,
  'Action Context seleciona a request de Compras por module_id + reference_id'
);

SELECT is(
  (public.get_entity_action_context(
    'abastecimento', 'cb100000-0000-0000-0000-000000000001'
  )).approval_request_id,
  'cb200000-0000-0000-0000-000000000002'::uuid,
  'Action Context seleciona a request de Abastecimento por module_id + reference_id'
);

SELECT is(
  (public.execute_entity_action(
    'compras',
    'cb100000-0000-0000-0000-000000000001',
    'cancelar',
    '{"notes":"cancelamento isolado de teste"}'::jsonb
  ))->>'code',
  '200',
  'executor processa a entidade do módulo solicitado'
);

SELECT is(
  (SELECT status FROM public.approval_requests
    WHERE id = 'cb200000-0000-0000-0000-000000000001'),
  'cancelled',
  'executor cancela somente a request de Compras'
);

SELECT is(
  (SELECT status FROM public.approval_requests
    WHERE id = 'cb200000-0000-0000-0000-000000000002'),
  'draft',
  'request de Abastecimento com o mesmo UUID permanece intacta'
);

SELECT * FROM finish();
ROLLBACK;
