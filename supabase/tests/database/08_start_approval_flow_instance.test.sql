-- ============================================================
-- SPRINT 15.2B-R2 — Teste 08
-- start_approval_flow: instância canônica para os 6 módulos
-- ============================================================
-- Contrato verificado:
--   approval_requests.status          = 'awaiting_step'
--   approval_requests.current_step_order       preenchido
--   approval_requests.current_approver_user_id  preenchido
--   primeira approval_request_step.status      = 'pending'
--   steps subsequentes .status                 = 'waiting'
--   proteção concorrente: segunda chamada retorna error
-- ============================================================

BEGIN;

-- 23 assertions are present below; keep the TAP plan exact.
SELECT plan(23);

-- ============================================================
-- SETUP: Usuários e Setor
-- ============================================================

-- Setor de teste (public.sectors.code é NOT NULL — fixture deve fornecer code)
INSERT INTO public.sectors (id, code, name, active)
VALUES ('b0000000-0000-0000-0000-000000000001', 'TST-B2R2', 'Setor Teste B2R2', true)
ON CONFLICT (id) DO NOTHING;

-- Manager / aprovador gestor_imediato
INSERT INTO auth.users (id, email)
VALUES ('b0000000-0000-0000-0000-000000000002', 'manager_2br2@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0000-000000000002', 'Manager 2BR2', 'manager_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Solicitante (com gestor_imediato configurado)
INSERT INTO auth.users (id, email)
VALUES ('b0000000-0000-0000-0000-000000000001', 'requester_2br2@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, email, active, sector_id, manager_user_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Requester 2BR2', 'requester_2br2@test.com', true,
        'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Colaborador para desligamento
INSERT INTO public.collaborators (id, full_name, active)
VALUES ('b0000000-0000-0000-0000-000000000099', 'Colaborador Teste', true)
ON CONFLICT (id) DO NOTHING;

-- Aprovadores para cargo_perfil (diretoria, rh, administrativo, supervisor, financeiro)
-- O reset local não semeia public.roles. A fixture cria explicitamente os
-- papéis usados pelas etapas V1 antes de vincular os atores B/C/D.
INSERT INTO public.roles (id, key, name, is_master) VALUES
  ('b0000000-0000-0000-0010-000000000010', 'diretoria', 'Diretoria 2BR2', false),
  ('b0000000-0000-0000-0010-000000000011', 'rh', 'RH 2BR2', false),
  ('b0000000-0000-0000-0010-000000000012', 'administrativo', 'Administrativo 2BR2', false),
  ('b0000000-0000-0000-0010-000000000013', 'financeiro', 'Financeiro 2BR2', false),
  ('b0000000-0000-0000-0010-000000000014', 'supervisor', 'Supervisor 2BR2', false)
ON CONFLICT (key) DO NOTHING;

-- Diretoria
INSERT INTO auth.users (id, email)  VALUES ('b0000000-0000-0000-0001-000000000010', 'diretoria_2br2@test.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000010', 'Diretoria 2BR2', 'diretoria_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000010', id FROM public.roles WHERE key = 'diretoria'
ON CONFLICT DO NOTHING;

-- RH
INSERT INTO auth.users (id, email)  VALUES ('b0000000-0000-0000-0001-000000000011', 'rh_2br2@test.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000011', 'RH 2BR2', 'rh_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000011', id FROM public.roles WHERE key = 'rh'
ON CONFLICT DO NOTHING;

-- Administrativo
INSERT INTO auth.users (id, email)  VALUES ('b0000000-0000-0000-0001-000000000012', 'adm_2br2@test.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000012', 'Adm 2BR2', 'adm_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000012', id FROM public.roles WHERE key = 'administrativo'
ON CONFLICT DO NOTHING;

-- Financeiro
INSERT INTO auth.users (id, email)  VALUES ('b0000000-0000-0000-0001-000000000013', 'fin_2br2@test.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000013', 'Fin 2BR2', 'fin_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000013', id FROM public.roles WHERE key = 'financeiro'
ON CONFLICT DO NOTHING;

-- Supervisor
INSERT INTO auth.users (id, email)  VALUES ('b0000000-0000-0000-0001-000000000014', 'sup_2br2@test.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000014', 'Sup 2BR2', 'sup_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000014', id FROM public.roles WHERE key = 'supervisor'
ON CONFLICT DO NOTHING;

-- start_approval_flow is private in the final V2 RPC contract. Preserve the
-- requester JWT while invoking this engine unit test as the database owner.
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT set_config('role', 'postgres', true);

-- ============================================================
-- MÓDULO 1: COMPRAS
-- Fluxo: 1 step (gestor_imediato)
-- ============================================================
INSERT INTO public.purchases (id, requester_user_id, status, category, description)
VALUES ('b1000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'rascunho', 'IT', 'Teste Compras 2BR2')
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('compras', 'b1000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'compras: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'compras: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT current_step_order FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'),
  1,
  'compras: current_step_order = 1'
);

SELECT is(
  (SELECT current_approver_user_id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'),
  'b0000000-0000-0000-0000-000000000002'::uuid,
  'compras: current_approver_user_id = gestor_imediato'
);

SELECT is(
  (SELECT status FROM public.approval_request_steps
   WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001')
     AND step_order = 1),
  'pending',
  'compras: step 1 status = pending'
);

-- Proteção concorrente: segunda chamada deve falhar
SELECT is(
  (public.start_approval_flow('compras', 'b1000000-0000-0000-0000-000000000001'))->>'error' IS NOT NULL,
  true,
  'compras: segunda chamada retorna erro (proteção concorrente)'
);

-- ============================================================
-- MÓDULO 2: ABASTECIMENTO
-- Fluxo: 2 steps (gestor_imediato + administrativo)
-- ============================================================
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b2000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'rascunho', 'abastecimento', 50.00)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('abastecimento', 'b2000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'abastecimento: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'abastecimento: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT current_step_order FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001'),
  1,
  'abastecimento: current_step_order = 1'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.approval_request_steps
   WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001')
     AND status = 'waiting'),
  1,
  'abastecimento: step 2 status = waiting'
);

-- ============================================================
-- MÓDULO 3: DIÁRIA
-- Fluxo: 3 steps
-- ============================================================
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b3000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'rascunho', 'diaria', 80.00)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('diaria', 'b3000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'diaria: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b3000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'diaria: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.approval_request_steps
   WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b3000000-0000-0000-0000-000000000001')
     AND status = 'waiting'),
  2,
  'diaria: 2 steps em waiting (steps 2 e 3)'
);

-- ============================================================
-- MÓDULO 4: REEMBOLSO
-- Fluxo: 2 steps
-- ============================================================
INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b4000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'rascunho', 'reembolso', 120.00)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('reembolso', 'b4000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'reembolso: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b4000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'reembolso: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT current_step_order FROM public.approval_requests WHERE reference_id = 'b4000000-0000-0000-0000-000000000001'),
  1,
  'reembolso: current_step_order = 1'
);

-- ============================================================
-- MÓDULO 5: ADMISSÕES
-- Fluxo: 2 steps (diretoria + rh)
-- ============================================================
INSERT INTO public.admission_requests (
  id, requester_user_id, status,
  local_contratacao, centro_custo, cargo_funcao, tipo_contrato,
  jornada, gestor_responsavel, motivo
) VALUES (
  'b5000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'rascunho',
  'SP', 'CC001', 'Analista', 'CLT', '8h', 'Gestor', 'Reposição'
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('admissoes', 'b5000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'admissoes: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b5000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'admissoes: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT current_approver_user_id IS NOT NULL
   FROM public.approval_requests WHERE reference_id = 'b5000000-0000-0000-0000-000000000001'),
  true,
  'admissoes: current_approver_user_id preenchido'
);

-- ============================================================
-- MÓDULO 6: DESLIGAMENTOS
-- Fluxo: 2 steps (diretoria + rh)
-- ============================================================
INSERT INTO public.termination_requests (
  id, requester_user_id, collaborator_id, status,
  tipo_desligamento, motivo, data_prevista
) VALUES (
  'b6000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000099',
  'rascunho',
  'outros', 'Encerramento de contrato', '2026-12-31'
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (public.start_approval_flow('desligamentos', 'b6000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'desligamentos: start_approval_flow retorna success=true'
);

SELECT is(
  (SELECT status FROM public.approval_requests WHERE reference_id = 'b6000000-0000-0000-0000-000000000001'),
  'awaiting_step',
  'desligamentos: approval_requests.status = awaiting_step'
);

SELECT is(
  (SELECT current_approver_user_id IS NOT NULL
   FROM public.approval_requests WHERE reference_id = 'b6000000-0000-0000-0000-000000000001'),
  true,
  'desligamentos: current_approver_user_id preenchido'
);

-- ============================================================
-- get_my_approval_queue: deve retornar requests ativas do aprovador
-- ============================================================

-- Autenticar como manager (aprovador de compras)
SELECT set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT is(
  (SELECT COUNT(*)::int FROM public.get_my_approval_queue()),
  4,
  'get_my_approval_queue retorna as 4 requests cuja etapa 1 usa o gestor'
);

SELECT finish();
ROLLBACK;
