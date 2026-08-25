-- Checkpoint A: V2 actor resolution and assignment invariants.
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'actor-a@test.local'),
  ('ca000000-0000-0000-0000-000000000002', 'actor-b@test.local'),
  ('ca000000-0000-0000-0000-000000000003', 'actor-c@test.local'),
  ('ca000000-0000-0000-0000-000000000004', 'actor-d@test.local'),
  ('ca000000-0000-0000-0000-000000000005', 'actor-s@test.local'),
  ('ca000000-0000-0000-0000-000000000006', 'actor-m@test.local'),
  ('ca000000-0000-0000-0000-000000000007', 'actor-u@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, active) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'Actor A Requester', 'actor-a@test.local', true),
  ('ca000000-0000-0000-0000-000000000002', 'Actor B Primary', 'actor-b@test.local', true),
  ('ca000000-0000-0000-0000-000000000003', 'Actor C Next', 'actor-c@test.local', true),
  ('ca000000-0000-0000-0000-000000000004', 'Actor D Third', 'actor-d@test.local', true),
  ('ca000000-0000-0000-0000-000000000005', 'Actor S Substitute', 'actor-s@test.local', true),
  ('ca000000-0000-0000-0000-000000000006', 'Actor M Master', 'actor-m@test.local', true),
  ('ca000000-0000-0000-0000-000000000007', 'Actor U Unrelated', 'actor-u@test.local', true)
ON CONFLICT (id) DO UPDATE SET active = EXCLUDED.active;

INSERT INTO public.roles (id, key, name, is_master)
VALUES (
  'ca200000-0000-0000-0000-000000000001',
  'master',
  'Master Actor Resolution',
  true
)
ON CONFLICT (key) DO UPDATE SET is_master = true;

INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'ca000000-0000-0000-0000-000000000006', r.id
  FROM public.roles r
 WHERE r.key = 'master'
ON CONFLICT DO NOTHING;

SELECT is(
  (SELECT count(*)::integer FROM public.profiles
    WHERE id::text LIKE 'ca000000-0000-0000-0000-00000000000%' AND active),
  7,
  'fixtures A/B/C/D/S/M/U possuem profiles ativos'
);

SELECT is(
  public._engine_pick_actor(
    NULL,
    'ca000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001'
  ),
  'ca000000-0000-0000-0000-000000000002'::uuid,
  'primary válido resolve para B'
);

SELECT is(
  public._engine_pick_actor(
    NULL,
    'ca000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001'
  ),
  'ca000000-0000-0000-0000-000000000005'::uuid,
  'primary=requester usa substitute S'
);

UPDATE public.profiles
   SET active = false
 WHERE id = 'ca000000-0000-0000-0000-000000000002';

SELECT is(
  public._engine_pick_actor(
    NULL,
    'ca000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001'
  ),
  'ca000000-0000-0000-0000-000000000005'::uuid,
  'primary inativo usa substitute S'
);

UPDATE public.profiles
   SET active = false
 WHERE id = 'ca000000-0000-0000-0000-000000000005';

SELECT is(
  public._engine_pick_actor(
    NULL,
    'ca000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001'
  ),
  NULL::uuid,
  'primary=requester + substitute inativo não resolve ator'
);

SELECT is(
  public._engine_pick_actor(
    NULL,
    NULL,
    NULL,
    'ca000000-0000-0000-0000-000000000001'
  ),
  NULL::uuid,
  'Master não é fallback automático'
);

UPDATE public.profiles
   SET active = true
 WHERE id IN (
   'ca000000-0000-0000-0000-000000000002',
   'ca000000-0000-0000-0000-000000000005'
 );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ca000000-0000-0000-0000-000000000006","role":"authenticated"}',
  true
);
SELECT set_config('role', 'authenticated', true);

SELECT is(
  (public.save_approval_step_assignment(
    (SELECT s.id FROM public.approval_flow_steps s
      JOIN public.approval_flows f ON f.id = s.flow_id
     WHERE f.version = 'v2' ORDER BY s.id LIMIT 1),
    'person',
    'ca000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000005',
    NULL,
    24
  ))->>'success',
  'true',
  'configuração Pessoa aceita primary B e substitute S'
);

SELECT is(
  (public.save_approval_step_assignment(
    (SELECT s.id FROM public.approval_flow_steps s
      JOIN public.approval_flows f ON f.id = s.flow_id
     WHERE f.version = 'v2' ORDER BY s.id OFFSET 1 LIMIT 1),
    'person',
    'ca000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000002',
    NULL,
    24
  ))->>'error',
  'SUBSTITUTE_EQUALS_PRIMARY',
  'primary=substitute é configuração inválida'
);

SELECT set_config('role', 'postgres', true);
INSERT INTO public.sectors (
  id, code, name, responsible_user_id, substitute_user_id, active
) VALUES (
  'ca100000-0000-0000-0000-000000000001',
  'ACTOR-V2',
  'Actor Resolution V2',
  'ca000000-0000-0000-0000-000000000002',
  'ca000000-0000-0000-0000-000000000005',
  true
);

SELECT set_config('role', 'authenticated', true);
SELECT is(
  (public.save_approval_step_assignment(
    (SELECT s.id FROM public.approval_flow_steps s
      JOIN public.approval_flows f ON f.id = s.flow_id
     WHERE f.version = 'v2' ORDER BY s.id OFFSET 2 LIMIT 1),
    'sector',
    NULL,
    NULL,
    'ca100000-0000-0000-0000-000000000001',
    24
  ))->>'success',
  'true',
  'configuração Setor aceita responsible B e substitute S'
);

SELECT set_config('role', 'postgres', true);
SELECT is(
  public._engine_pick_actor(
    NULL,
    'ca000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000005',
    'ca000000-0000-0000-0000-000000000001'
  ),
  'ca000000-0000-0000-0000-000000000005'::uuid,
  'resolver setorial também evita autoaprovação do responsible'
);

SELECT * FROM finish();
ROLLBACK;
