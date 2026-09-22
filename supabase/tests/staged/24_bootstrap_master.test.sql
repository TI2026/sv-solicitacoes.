-- Testes da migration proposta 20260922160000_checkpoint_final_bootstrap_master.sql
-- Executar somente em banco local com a migration staged aplicada.
BEGIN;
SELECT plan(14);

-- Estrutura -----------------------------------------------------------------
SELECT has_table('public', 'bootstrap_state', 'bootstrap_state existe');
SELECT ok(
  (SELECT count(*) FROM public.bootstrap_state) = 1,
  'bootstrap_state é singleton'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bootstrap_state'::regclass),
  'RLS ativa em bootstrap_state'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='bootstrap_state' AND cmd <> 'SELECT'
  ),
  'nenhuma policy de escrita em bootstrap_state'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_master_bootstrap()', 'EXECUTE'),
  'anon não executa claim_master_bootstrap'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.claim_master_bootstrap()', 'EXECUTE'),
  'authenticated executa claim_master_bootstrap'
);
SELECT ok(
  pg_get_functiondef('public.handle_new_user()'::regprocedure) NOT LIKE '%diretoria%',
  'handle_new_user não promove mais ninguém a diretoria'
);

-- Fixtures ------------------------------------------------------------------
DELETE FROM public.user_role_assignments;
DELETE FROM public.profiles WHERE email LIKE '%@bootstrap.test';
DELETE FROM auth.users WHERE email LIKE '%@bootstrap.test';

-- Papéis canônicos e trigger de criação de perfil (paridade com produção)
INSERT INTO public.roles (id, key, name, description, is_master, active, is_system)
VALUES ('14ac0d54-db6c-4381-abec-036184f8f97d', 'master', 'Master', 'Master', true, true, true)
ON CONFLICT (key) DO UPDATE SET is_master = true;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

UPDATE public.bootstrap_state
   SET authorized_email = 'owner@bootstrap.test', completed_at = NULL, completed_user_id = NULL;

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
VALUES
  ('bb000000-0000-0000-0000-000000000001', 'owner@bootstrap.test', now(), '{"full_name":"Owner"}'::jsonb),
  ('bb000000-0000-0000-0000-000000000002', 'intruso@bootstrap.test', now(), '{"full_name":"Intruso"}'::jsonb),
  ('bb000000-0000-0000-0000-000000000003', 'naoconfirmado@bootstrap.test', NULL, '{"full_name":"Pendente"}'::jsonb);


-- Perfis criados pelo trigger, pendentes por padrão -------------------------
SELECT ok(
  (SELECT active FROM public.profiles WHERE id='bb000000-0000-0000-0000-000000000002') IS FALSE,
  'nova conta comum entra inativa/pendente'
);
SELECT ok(
  (SELECT active FROM public.profiles WHERE id='bb000000-0000-0000-0000-000000000001') IS TRUE,
  'e-mail autorizado do bootstrap entra ativo'
);

-- Reivindicação: e-mail não autorizado --------------------------------------
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (public.claim_master_bootstrap())->>'error', 'BOOTSTRAP_EMAIL_NOT_AUTHORIZED',
  'segundo usuário não vira Master'
);

-- Reivindicação: e-mail autorizado porém não confirmado ---------------------
RESET role;
UPDATE public.bootstrap_state SET authorized_email = 'naoconfirmado@bootstrap.test';
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT is(
  (public.claim_master_bootstrap())->>'error', 'BOOTSTRAP_EMAIL_NOT_CONFIRMED',
  'usuário sem e-mail confirmado não vira Master'
);
RESET role;
UPDATE public.bootstrap_state SET authorized_email = 'owner@bootstrap.test';


-- Reivindicação legítima ----------------------------------------------------
RESET role;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (public.claim_master_bootstrap())->>'success', 'true',
  'proprietário autorizado reivindica o Master'
);

-- Repetição retorna conflito seguro -----------------------------------------
SELECT is(
  (public.claim_master_bootstrap())->>'error', 'BOOTSTRAP_ALREADY_COMPLETED',
  'segunda reivindicação retorna conflito seguro'
);

RESET role;
SELECT ok(
  (SELECT count(*) FROM public.user_role_assignments ura
     JOIN public.roles r ON r.id = ura.role_id WHERE r.is_master) = 1,
  'exatamente um Master existe após o bootstrap'
);

SELECT * FROM finish();
ROLLBACK;
