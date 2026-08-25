-- ============================================================
-- SPRINT 15.2A: Testes pgTAP - get_entity_action_context
-- Cobertura: 6 módulos × solicitante + aprovador + erros
-- ============================================================
BEGIN;
SELECT * FROM no_plan();

-- ============================================================
-- HELPERS
-- ============================================================
CREATE OR REPLACE FUNCTION get_test_uuid(p_name TEXT) RETURNS UUID AS $$
BEGIN
  RETURN uuid_generate_v5(uuid_ns_dns(), p_name);
END;
$$ LANGUAGE plpgsql;

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

  IF p_role <> 'sem_acesso' THEN
    INSERT INTO public.user_role_assignments (user_id, role_id)
    SELECT v_uid, r.id FROM public.roles r WHERE r.key = p_role
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_uid;
END;
$$ LANGUAGE plpgsql;

-- Estabelece o usuário autenticado para o contexto da sessão
CREATE OR REPLACE FUNCTION set_auth_user(p_role TEXT) RETURNS VOID AS $$
DECLARE
  v_uid UUID := get_test_uuid('test_' || p_role);
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_uid), true);
END;
$$ LANGUAGE plpgsql;

-- V2 hides invalid/inaccessible entities with a controlled NULL context.
-- This avoids leaking entity existence while proving the RPC never raises.
CREATE OR REPLACE FUNCTION assert_business_error(
  p_module TEXT,
  p_id UUID,
  p_expected_reason TEXT,
  p_desc TEXT
) RETURNS SETOF TEXT AS $$
DECLARE
  v_ctx public.entity_action_context;
BEGIN
  v_ctx := public.get_entity_action_context(p_module, p_id);
  RETURN NEXT ok(v_ctx IS NULL, p_desc || ' - Retorna contexto NULL controlado');
  RETURN NEXT is(v_ctx.current_status, NULL::text, p_desc || ' - Não expõe status');
  RETURN NEXT is(v_ctx.allowed_actions, NULL::jsonb, p_desc || ' - Não expõe ações');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SETUP: Criar usuários de teste
-- ============================================================
DO $$
DECLARE
  v_solicitante UUID := create_test_user('solicitante');
  v_aprovador   UUID := create_test_user('aprovador');
  v_rh          UUID := create_test_user('rh');
  v_sem_acesso  UUID := create_test_user('sem_acesso');
BEGIN
  -- Setor de teste com aprovador responsável
  INSERT INTO public.sectors (id, code, name, responsible_user_id, active)
  VALUES (get_test_uuid('setor_teste'), 'TST', 'Setor Teste', v_aprovador, true)
  ON CONFLICT DO NOTHING;

  -- Solicitante vinculado ao setor com o aprovador como gestor
  UPDATE public.profiles
  SET sector_id = get_test_uuid('setor_teste'), manager_user_id = v_aprovador
  WHERE id = v_solicitante;
END;
$$;


-- ============================================================
-- 1. COMPRAS
-- ============================================================
DELETE FROM public.purchases WHERE id = get_test_uuid('compras_t1');

-- Insert como superuser (sem RLS - setup de teste)
RESET role;
RESET request.jwt.claims;
INSERT INTO public.purchases (id, requester_user_id, status, category, description, priority, estimated_value)
VALUES (get_test_uuid('compras_t1'), get_test_uuid('test_solicitante'), 'rascunho', 'teste', 'Compra Sprint15.2A', 'baixa', 200.00);

-- 1a. Solicitante no rascunho é ator com ações corretas
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).current_status,
  'rascunho',
  'Compras #1a: Status rascunho correto'
);
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).is_current_actor,
  true,
  'Compras #1b: Solicitante é ator no rascunho'
);
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).requester_user_id,
  get_test_uuid('test_solicitante'),
  'Compras #1c: requester_user_id correto'
);
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Compras #1d: Ações corretas no rascunho'
);

-- 1e. Aprovador não é ator no rascunho
SELECT set_auth_user('aprovador');
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).is_current_actor,
  false,
  'Compras #1e: Aprovador não é ator no rascunho'
);
SELECT is(
  (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).allowed_actions::text,
  '[]',
  'Compras #1f: Aprovador sem ações no rascunho'
);
SELECT ok(
  'Apenas o solicitante pode atuar no estágio inicial.' = ANY(
    (public.get_entity_action_context('compras', get_test_uuid('compras_t1'))).blocked_reasons
  ),
  'Compras #1g: Bloqueio correto para aprovador no rascunho'
);

-- 1h. aliases: purchases também funciona
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('purchases', get_test_uuid('compras_t1'))).current_status,
  'rascunho',
  'Compras #1h: Alias purchases funciona'
);

-- 1i. Entidade inexistente
SELECT * FROM assert_business_error(
  'compras',
  gen_random_uuid(),
  'Entidade não encontrada ou inacessível.',
  'Compras #1i: Entidade inexistente'
);


-- ============================================================
-- 2. ABASTECIMENTO
-- ============================================================
DELETE FROM public.fuel_requests WHERE id = get_test_uuid('abastecimento_t1');

RESET role;
RESET request.jwt.claims;
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
VALUES (get_test_uuid('abastecimento_t1'), get_test_uuid('test_solicitante'), 'rascunho', 'abastecimento', 200.00, '2026-07-24');

-- 2a. Solicitante no rascunho
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('abastecimento', get_test_uuid('abastecimento_t1'))).current_status,
  'rascunho',
  'Abastecimento #2a: Status rascunho'
);
SELECT is(
  (public.get_entity_action_context('abastecimento', get_test_uuid('abastecimento_t1'))).is_current_actor,
  true,
  'Abastecimento #2b: Solicitante é ator'
);
SELECT is(
  (public.get_entity_action_context('abastecimento', get_test_uuid('abastecimento_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Abastecimento #2c: Ações corretas'
);

-- 2d. Discriminator errado → NULL controlado
SELECT ok(
  public.get_entity_action_context('diaria', get_test_uuid('abastecimento_t1')) IS NULL,
  'Abastecimento #2d: Discriminator cruzado retorna NULL controlado'
);
SELECT is(
  (public.get_entity_action_context('diaria', get_test_uuid('abastecimento_t1'))).allowed_actions,
  NULL::jsonb,
  'Abastecimento #2e: Discriminator cruzado não expõe ações'
);

-- 2f. Entidade inexistente
SELECT * FROM assert_business_error(
  'abastecimento',
  gen_random_uuid(),
  'Entidade não encontrada ou inacessível.',
  'Abastecimento #2f: Entidade inexistente'
);


-- ============================================================
-- 3. DIÁRIA
-- ============================================================
DELETE FROM public.fuel_requests WHERE id = get_test_uuid('diaria_t1');

RESET role;
RESET request.jwt.claims;
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
VALUES (get_test_uuid('diaria_t1'), get_test_uuid('test_solicitante'), 'rascunho', 'diaria', 300.00, '2026-07-24');

-- 3a. Solicitante no rascunho
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('diaria', get_test_uuid('diaria_t1'))).current_status,
  'rascunho',
  'Diária #3a: Status rascunho'
);
SELECT is(
  (public.get_entity_action_context('diaria', get_test_uuid('diaria_t1'))).is_current_actor,
  true,
  'Diária #3b: Solicitante é ator'
);
SELECT is(
  (public.get_entity_action_context('diaria', get_test_uuid('diaria_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Diária #3c: Ações corretas'
);

-- 3d. Discriminator errado → NULL controlado
SELECT ok(
  public.get_entity_action_context('reembolso', get_test_uuid('diaria_t1')) IS NULL,
  'Diária #3d: Discriminator cruzado retorna NULL controlado'
);


-- ============================================================
-- 4. REEMBOLSO
-- ============================================================
DELETE FROM public.fuel_requests WHERE id = get_test_uuid('reembolso_t1');

RESET role;
RESET request.jwt.claims;
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
VALUES (get_test_uuid('reembolso_t1'), get_test_uuid('test_solicitante'), 'rascunho', 'reembolso', 400.00, '2026-07-24');

-- 4a. Solicitante no rascunho
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('reembolso', get_test_uuid('reembolso_t1'))).current_status,
  'rascunho',
  'Reembolso #4a: Status rascunho'
);
SELECT is(
  (public.get_entity_action_context('reembolso', get_test_uuid('reembolso_t1'))).is_current_actor,
  true,
  'Reembolso #4b: Solicitante é ator'
);
SELECT is(
  (public.get_entity_action_context('reembolso', get_test_uuid('reembolso_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Reembolso #4c: Ações corretas'
);

-- 4d. Aprovador não é ator no rascunho
SELECT set_auth_user('aprovador');
SELECT is(
  (public.get_entity_action_context('reembolso', get_test_uuid('reembolso_t1'))).is_current_actor,
  false,
  'Reembolso #4d: Aprovador não é ator no rascunho'
);
SELECT ok(
  'Apenas o solicitante pode atuar no estágio inicial.' = ANY(
    (public.get_entity_action_context('reembolso', get_test_uuid('reembolso_t1'))).blocked_reasons
  ),
  'Reembolso #4e: Bloqueio correto para aprovador'
);

-- 4f. Discriminator errado → NULL controlado
SELECT set_auth_user('solicitante');
SELECT ok(
  public.get_entity_action_context('abastecimento', get_test_uuid('reembolso_t1')) IS NULL,
  'Reembolso #4f: Discriminator cruzado retorna NULL controlado'
);


-- ============================================================
-- 5. ADMISSÕES
-- ============================================================
DELETE FROM public.admission_requests WHERE id = get_test_uuid('admissoes_t1');

RESET role;
RESET request.jwt.claims;
INSERT INTO public.admission_requests (id, requester_user_id, status, local_contratacao, centro_custo, cargo_funcao, tipo_contrato, jornada, gestor_responsavel, motivo)
VALUES (get_test_uuid('admissoes_t1'), get_test_uuid('test_solicitante'), 'rascunho', 'SP', 'TI', 'Dev', 'CLT', '44h', 'Gestor', 'Necessidade');

-- 5a. Solicitante no rascunho
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('admissoes', get_test_uuid('admissoes_t1'))).current_status,
  'rascunho',
  'Admissões #5a: Status inicial correto'
);
SELECT is(
  (public.get_entity_action_context('admissoes', get_test_uuid('admissoes_t1'))).is_current_actor,
  true,
  'Admissões #5b: Solicitante é ator no início'
);
SELECT is(
  (public.get_entity_action_context('admissoes', get_test_uuid('admissoes_t1'))).requester_user_id,
  get_test_uuid('test_solicitante'),
  'Admissões #5c: requester_user_id correto'
);
SELECT is(
  (public.get_entity_action_context('admissoes', get_test_uuid('admissoes_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Admissões #5d: Ações corretas'
);

-- 5e. Alias admissions funciona
SELECT is(
  (public.get_entity_action_context('admissions', get_test_uuid('admissoes_t1'))).current_status,
  'rascunho',
  'Admissões #5e: Alias admissions funciona'
);

-- 5f. Aprovador não é ator no rascunho
SELECT set_auth_user('aprovador');
SELECT is(
  (public.get_entity_action_context('admissoes', get_test_uuid('admissoes_t1'))).is_current_actor,
  false,
  'Admissões #5f: Aprovador não é ator no rascunho'
);

-- 5g. Entidade inexistente
SELECT set_auth_user('solicitante');
SELECT * FROM assert_business_error(
  'admissoes',
  gen_random_uuid(),
  'Entidade não encontrada ou inacessível.',
  'Admissões #5g: Entidade inexistente'
);


-- ============================================================
-- 6. DESLIGAMENTOS
-- ============================================================
DELETE FROM public.termination_requests WHERE id = get_test_uuid('desligamentos_t1');

-- Colaborador base (sem RLS)
RESET role;
RESET request.jwt.claims;
INSERT INTO public.collaborators (id, user_profile_id, full_name, cpf, status)
VALUES (get_test_uuid('colab_t1'), get_test_uuid('test_solicitante'), 'Colab Teste 15.2A', '22222222222', 'ativo')
ON CONFLICT DO NOTHING;

INSERT INTO public.termination_requests (id, collaborator_id, requester_user_id, tipo_desligamento, motivo, data_prevista, status)
VALUES (
  get_test_uuid('desligamentos_t1'),
  get_test_uuid('colab_t1'),
  get_test_uuid('test_solicitante'),
  'demissao_sem_justa_causa',
  'Motivo Sprint 15.2A',
  '2026-08-01',
  'rascunho'
);

-- 6a. Solicitante no rascunho
SELECT set_auth_user('solicitante');
SELECT is(
  (public.get_entity_action_context('desligamentos', get_test_uuid('desligamentos_t1'))).current_status,
  'rascunho',
  'Desligamentos #6a: Status inicial correto'
);
SELECT is(
  (public.get_entity_action_context('desligamentos', get_test_uuid('desligamentos_t1'))).is_current_actor,
  true,
  'Desligamentos #6b: Solicitante é ator no início'
);
SELECT is(
  (public.get_entity_action_context('desligamentos', get_test_uuid('desligamentos_t1'))).allowed_actions::text,
  '["enviar", "cancelar"]',
  'Desligamentos #6c: Ações corretas'
);

-- 6d. Alias terminations funciona
SELECT is(
  (public.get_entity_action_context('terminations', get_test_uuid('desligamentos_t1'))).current_status,
  'rascunho',
  'Desligamentos #6d: Alias terminations funciona'
);

-- 6e. Aprovador não é ator no rascunho
SELECT set_auth_user('aprovador');
SELECT is(
  (public.get_entity_action_context('desligamentos', get_test_uuid('desligamentos_t1'))).is_current_actor,
  false,
  'Desligamentos #6e: Aprovador não é ator no rascunho'
);
SELECT ok(
  'Apenas o solicitante pode atuar no estágio inicial.' = ANY(
    (public.get_entity_action_context('desligamentos', get_test_uuid('desligamentos_t1'))).blocked_reasons
  ),
  'Desligamentos #6f: Bloqueio correto para aprovador'
);

-- 6g. Entidade inexistente
SELECT set_auth_user('solicitante');
SELECT * FROM assert_business_error(
  'desligamentos',
  gen_random_uuid(),
  'Entidade não encontrada ou inacessível.',
  'Desligamentos #6g: Entidade inexistente'
);


-- ============================================================
-- 7. ERROS GLOBAIS
-- ============================================================

-- 7a. Módulo desconhecido → ERRO controlado
SELECT set_auth_user('solicitante');
SELECT * FROM assert_business_error(
  'modulo_falso',
  get_test_uuid('compras_t1'),
  'Módulo inválido ou desconhecido: modulo_falso',
  'Geral #7a: Módulo falso retorna ERRO controlado'
);

-- 7b. fleet sem discriminator → ERRO
SELECT * FROM assert_business_error(
  'fleet',
  gen_random_uuid(),
  'Módulo inválido ou desconhecido: fleet',
  'Geral #7b: fleet sem discriminator é módulo inválido'
);

SELECT * FROM finish();
ROLLBACK;
