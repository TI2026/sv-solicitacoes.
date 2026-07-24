BEGIN;

SELECT * FROM no_plan();

-- 1. SETUP DE USUÁRIOS
CREATE OR REPLACE FUNCTION get_test_uuid(p_name TEXT) RETURNS UUID AS $$
BEGIN
  RETURN uuid_generate_v5(uuid_ns_dns(), p_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_test_user(p_role TEXT, p_active BOOLEAN DEFAULT true) RETURNS UUID AS $$
DECLARE
  v_uid UUID := get_test_uuid('test_' || p_role);
BEGIN
  INSERT INTO public.roles (key, name, description)
  VALUES 
    ('master', 'Master', 'Admin'),
    ('financeiro', 'Financeiro', 'Fin'),
    ('solicitante', 'Solicitante', 'Sol'),
    ('aprovador', 'Aprovador', 'Apr'),
    ('sem_acesso', 'Sem Acesso', 'Sem')
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', 'test_' || p_role || '@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, active)
  VALUES (v_uid, 'Test ' || p_role, 'test_' || p_role || '@example.com', p_active)
  ON CONFLICT (id) DO UPDATE SET active = p_active;

  IF p_role <> 'sem_acesso' AND p_role <> 'solicitante' THEN
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
  v_financeiro UUID := create_test_user('financeiro');
  v_rh UUID := create_test_user('rh');
  v_master UUID := create_test_user('master');
  v_sem_acesso UUID := create_test_user('sem_acesso');
BEGIN
  -- Definir gerente do solicitante como o aprovador
  UPDATE public.profiles SET manager_user_id = v_aprovador WHERE id = v_solicitante;
END;
$$;

-- Criar entidades de teste pertencentes ao solicitante
DO $$
DECLARE
  v_solicitante UUID := get_test_uuid('test_solicitante');
BEGIN
  -- Compra
  INSERT INTO public.purchases (id, requester_user_id, status, category, priority, estimated_value, description)
  VALUES (get_test_uuid('dash_compra_1'), v_solicitante, 'em_aprovacao', 'cat', 'baixa', 100, 'Desc') ON CONFLICT DO NOTHING;
  
  -- Abastecimento
  INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
  VALUES (get_test_uuid('dash_fleet_1'), v_solicitante, 'em_aprovacao', 'abastecimento', 50, '2026-01-01') ON CONFLICT DO NOTHING;
  
  -- Diária
  INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
  VALUES (get_test_uuid('dash_fleet_2'), v_solicitante, 'em_revisao', 'diaria', 50, '2026-01-01') ON CONFLICT DO NOTHING;
  
  -- Reembolso
  INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
  VALUES (get_test_uuid('dash_fleet_3'), v_solicitante, 'aguardando_pagamento', 'reembolso', 50, '2026-01-01') ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION set_auth_user(p_role TEXT) RETURNS VOID AS $$
DECLARE
  v_uid UUID := get_test_uuid('test_' || p_role);
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_uid), true);
END;
$$ LANGUAGE plpgsql;

-- TESTES

-- 1. SOLICITANTE
SELECT set_auth_user('solicitante');
SELECT ok(
  (public.get_dashboard_metrics()->'purchases'->>'total')::int > 0,
  'Solicitante deve ver suas próprias compras'
);

SELECT ok(
  (public.get_dashboard_metrics()->'abastecimento'->>'total')::int > 0,
  'Solicitante deve ver seus próprios abastecimentos'
);

-- 2. SEM ACESSO
SELECT set_auth_user('sem_acesso');
SELECT is(
  (public.get_dashboard_metrics()->'purchases'->>'total')::int,
  0,
  'Usuário sem acesso não deve ver métricas'
);

SELECT is(
  (public.get_dashboard_metrics()->'abastecimento'->>'total')::int,
  0,
  'Usuário sem acesso não deve ver métricas de abastecimento'
);

-- 3. FINANCEIRO
SELECT set_auth_user('financeiro');
SELECT ok(
  (public.get_dashboard_metrics()->'purchases'->>'total')::int > 0,
  'Financeiro deve ver compras'
);

-- 4. MASTER
SELECT set_auth_user('master');
SELECT ok(
  (public.get_dashboard_metrics()->'purchases'->>'total')::int >= 0,
  'Master deve ler métricas sem erro'
);

SELECT * FROM finish();
ROLLBACK;
