BEGIN;
SELECT plan(11);

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'fleet'),
  'bucket fleet existe após reconstrução por migrations'
);
SELECT ok(
  (SELECT public IS FALSE FROM storage.buckets WHERE id = 'fleet'),
  'bucket fleet é privado'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'fleet'),
  10485760::bigint,
  'bucket fleet limita anexos a 10MB'
);
SELECT is(
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'fleet'),
  ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[],
  'bucket fleet aceita somente JPEG, PNG e PDF'
);
SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'Fleet %'),
  4,
  'storage fleet possui policies explícitas de SELECT/INSERT/UPDATE/DELETE'
);

INSERT INTO auth.users(id, email) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'checkpoint-a-owner@test.local'),
  ('ca000000-0000-0000-0000-000000000002', 'checkpoint-a-other@test.local'),
  ('ca000000-0000-0000-0000-000000000003', 'checkpoint-a-master@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id, full_name, email, active) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'Checkpoint A Owner', 'checkpoint-a-owner@test.local', true),
  ('ca000000-0000-0000-0000-000000000002', 'Checkpoint A Other', 'checkpoint-a-other@test.local', true),
  ('ca000000-0000-0000-0000-000000000003', 'Checkpoint A Master', 'checkpoint-a-master@test.local', true)
ON CONFLICT (id) DO UPDATE SET active = true;

INSERT INTO public.roles(key, name, is_master, active)
VALUES ('master', 'Master', true, true)
ON CONFLICT (key) DO UPDATE SET is_master = true, active = true;

INSERT INTO public.user_role_assignments(user_id, role_id)
SELECT 'ca000000-0000-0000-0000-000000000003', id
  FROM public.roles
 WHERE key = 'master'
ON CONFLICT DO NOTHING;

INSERT INTO public.fuel_requests(
  id, requester_user_id, valor, data_abastecimento, status, type, placa, motivo
) VALUES
  (
    'ca100000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000001',
    100, current_date + 1, 'rascunho', 'abastecimento', 'ABC1234', 'Teste storage próprio'
  ),
  (
    'ca100000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000002',
    100, current_date + 1, 'rascunho', 'abastecimento', 'DEF5678', 'Teste storage alheio'
  );

INSERT INTO storage.objects(id, bucket_id, name, owner_id, metadata)
VALUES
  (
    'ca200000-0000-0000-0000-000000000001', 'fleet',
    'requests/ca100000-0000-0000-0000-000000000001/nota_fiscal/owner.pdf',
    'ca000000-0000-0000-0000-000000000001', '{"mimetype":"application/pdf"}'::jsonb
  ),
  (
    'ca200000-0000-0000-0000-000000000002', 'fleet',
    'requests/ca100000-0000-0000-0000-000000000002/nota_fiscal/other.pdf',
    'ca000000-0000-0000-0000-000000000002', '{"mimetype":"application/pdf"}'::jsonb
  );

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ca000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE id = 'ca200000-0000-0000-0000-000000000001'),
  1,
  'solicitante lê arquivo da própria solicitação'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE id = 'ca200000-0000-0000-0000-000000000002'),
  0,
  'usuário sem relação não lista nem lê arquivo alheio'
);
SELECT lives_ok(
  $$INSERT INTO storage.objects(id, bucket_id, name, owner_id, metadata)
    VALUES (
      'ca200000-0000-0000-0000-000000000003', 'fleet',
      'requests/ca100000-0000-0000-0000-000000000001/hodometro/new.png',
      'ca000000-0000-0000-0000-000000000001', '{"mimetype":"image/png"}'::jsonb
    )$$,
  'solicitante envia arquivo próprio enquanto can_edit permite'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(id, bucket_id, name, owner_id, metadata)
    VALUES (
      'ca200000-0000-0000-0000-000000000004', 'fleet',
      'requests/ca100000-0000-0000-0000-000000000002/hodometro/forbidden.png',
      'ca000000-0000-0000-0000-000000000001', '{"mimetype":"image/png"}'::jsonb
    )$$,
  '42501',
  NULL,
  'usuário sem relação não envia arquivo para solicitação alheia'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ca000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE id = 'ca200000-0000-0000-0000-000000000002'),
  1,
  'Master visualiza arquivo somente pela regra global do Action Context'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects(id, bucket_id, name, owner_id, metadata)
    VALUES (
      'ca200000-0000-0000-0000-000000000005', 'fleet',
      'requests/ca100000-0000-0000-0000-000000000002/hodometro/master-bypass.png',
      'ca000000-0000-0000-0000-000000000003', '{"mimetype":"image/png"}'::jsonb
    )$$,
  '42501',
  NULL,
  'Master não possui bypass arbitrário de upload'
);

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{}', true);
SELECT * FROM finish();
ROLLBACK;
