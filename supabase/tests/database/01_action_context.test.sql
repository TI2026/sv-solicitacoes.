BEGIN;

-- Determinar número de testes dinamicamente depois, por enquanto usamos plan() no final ou um valor fixo.
-- Vamos usar plan(6) para testes basicos iniciais, mas aumentaremos conforme a necessidade.
-- Mas pgTAP recomenda colocar o plan correto, ou NO PLAN.
-- Como é um teste complexo, usaremos SELECT * FROM no_plan(); para rodar até o fim e finish() contar.

SELECT * FROM no_plan();

-- 1. SETUP DE USUÁRIOS
-- Criar UUIDs fixos para os testes
CREATE OR REPLACE FUNCTION get_test_uuid(p_name TEXT) RETURNS UUID AS $$
BEGIN
  RETURN uuid_generate_v5(uuid_ns_dns(), p_name);
END;
$$ LANGUAGE plpgsql;

-- Inserir usuários no auth.users (necessário se profiles tiver FK)
-- Porém profiles localmente costuma apontar para auth.users.
-- Vamos criar um helper
CREATE OR REPLACE FUNCTION create_test_user(p_role TEXT, p_active BOOLEAN DEFAULT true) RETURNS UUID AS $$
DECLARE
  v_uid UUID := get_test_uuid('test_' || p_role);
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', 'test_' || p_role || '@example.com', 'crypt', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, active)
  VALUES (v_uid, 'Test ' || p_role, 'test_' || p_role || '@example.com', p_active)
  ON CONFLICT (id) DO UPDATE SET active = p_active;

  -- Atribuir role
  IF p_role <> 'sem_acesso' THEN
    INSERT INTO public.user_role_assignments (user_id, role_id)
    SELECT v_uid, r.id FROM public.roles r WHERE r.key = p_role
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_uid;
END;
$$ LANGUAGE plpgsql;

-- Preparar usuários
DO $$
DECLARE
  v_solicitante UUID := create_test_user('solicitante');
  v_aprovador UUID := create_test_user('aprovador');
  v_administrativo UUID := create_test_user('administrativo');
  v_compras UUID := create_test_user('compras');
  v_financeiro UUID := create_test_user('financeiro');
  v_rh UUID := create_test_user('rh');
  v_diretoria UUID := create_test_user('diretoria');
  v_master UUID := create_test_user('master');
  v_sem_acesso UUID := create_test_user('sem_acesso');
  v_inativo UUID := create_test_user('inativo', false);
BEGIN
  -- Definir um setor e colocar o aprovador como gerente do solicitante
  INSERT INTO public.sectors (id, code, name, responsible_user_id, active)
  VALUES (get_test_uuid('setor_teste'), 'TST', 'Setor Teste', v_aprovador, true)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET sector_id = get_test_uuid('setor_teste'), manager_user_id = v_aprovador
  WHERE id = v_solicitante;
END;
$$;

-- Helper para simular autenticação
CREATE OR REPLACE FUNCTION set_auth_user(p_role TEXT) RETURNS VOID AS $$
DECLARE
  v_uid UUID := get_test_uuid('test_' || p_role);
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_uid), true);
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TESTE 1: MÓDULO DE COMPRAS (Dono / Rascunho)
-- ==========================================
-- Limpar
DELETE FROM public.purchases WHERE id = get_test_uuid('compra_teste_1');

-- Criar entidade como solicitante
SELECT set_auth_user('solicitante');
INSERT INTO public.purchases (id, requester_user_id, status, category, description, priority, estimated_value)
VALUES (get_test_uuid('compra_teste_1'), get_test_uuid('test_solicitante'), 'rascunho', 'teste_categoria', 'Compra Teste', 'baixa', 100.00);

-- Validar 
SELECT is(
  (public.get_entity_action_context('purchases', get_test_uuid('compra_teste_1'))).current_status,
  'rascunho',
  'Status da compra deve ser rascunho'
);

SELECT is(
  (public.get_entity_action_context('purchases', get_test_uuid('compra_teste_1'))).is_current_actor,
  true,
  'Solicitante deve ser o ator atual no rascunho'
);

SELECT ok(
  ((public.get_entity_action_context('purchases', get_test_uuid('compra_teste_1'))).allowed_actions) ? 'enviar',
  'Deve poder enviar'
);

SELECT ok(
  ((public.get_entity_action_context('purchases', get_test_uuid('compra_teste_1'))).allowed_actions) ? 'editar',
  'Deve poder editar'
);

-- Trocar usuário para sem acesso
SELECT set_auth_user('sem_acesso');
-- pgTAP throws test for error
SELECT throws_ok(
  $$ SELECT public.get_entity_action_context('purchases', get_test_uuid('compra_teste_1')) $$,
  'Entidade não encontrada ou inacessível via RLS',
  'Usuário sem acesso bloqueado de ler contexto de compras'
);

-- ==========================================
-- TESTE 2: MÓDULO DE ABASTECIMENTO (Dono / Rascunho)
-- ==========================================
DELETE FROM public.fuel_requests WHERE id = get_test_uuid('fleet_teste_1');
SELECT set_auth_user('solicitante');
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
VALUES (get_test_uuid('fleet_teste_1'), get_test_uuid('test_solicitante'), 'rascunho', 'abastecimento', 150.00, '2026-07-24');

-- Validar 
SELECT is(
  (public.get_entity_action_context('abastecimento', get_test_uuid('fleet_teste_1'))).current_status,
  'rascunho',
  'Status do abastecimento deve ser rascunho'
);

SELECT is(
  (public.get_entity_action_context('abastecimento', get_test_uuid('fleet_teste_1'))).is_current_actor,
  true,
  'Solicitante deve ser o ator atual no rascunho de abastecimento'
);

SELECT ok(
  ((public.get_entity_action_context('abastecimento', get_test_uuid('fleet_teste_1'))).allowed_actions) ? 'enviar',
  'Deve poder enviar abastecimento'
);

-- Testar Discriminador Errado
SELECT throws_ok(
  $$ SELECT public.get_entity_action_context('diaria', get_test_uuid('fleet_teste_1')) $$,
  'Entidade não pertence ao módulo fleet informado (esperado diaria, recebido abastecimento)',
  'Discriminador de fleet respeitado'
);

SELECT * FROM finish();
ROLLBACK;
