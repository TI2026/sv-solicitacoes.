BEGIN;
SELECT plan(21);

-- Teste 1: Falhar se não autenticado
SELECT is(
  (public.start_approval_flow('compras', '00000000-0000-0000-0000-000000000000', NULL))->>'success',
  'false',
  'Deve falhar se o usuário requisitante passado não for auth.uid() e não for admin'
);

-- Preparar ambiente
-- Inserir usuário
INSERT INTO auth.users (id, email) VALUES ('10000000-0000-0000-0000-000000000001', 'requester@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active) VALUES ('10000000-0000-0000-0000-000000000001', 'Requester', 'requester@test.com', true) ON CONFLICT DO NOTHING;
-- Aprovador
INSERT INTO auth.users (id, email) VALUES ('10000000-0000-0000-0000-000000000002', 'approver@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active) VALUES ('10000000-0000-0000-0000-000000000002', 'Approver', 'approver@test.com', true) ON CONFLICT DO NOTHING;

-- Configurar fluxo para compras
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000001';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e00f0000-0000-0000-0000-000000000001', '00000000-0001-0000-0000-000000000001', 'Compras v1', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, step_name, active) VALUES ('e00f0000-0000-0000-0000-000000000001', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'STEP1', 'Step 1', true);

-- Inserir purchase em rascunho
INSERT INTO public.purchases (id, requester_user_id, status, category, description)
VALUES ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'rascunho', 'IT', 'Teste') ON CONFLICT DO NOTHING;

-- start_approval_flow is an internal helper in the final V2 contract.
-- Keep the JWT actor but execute the unit test as the database owner; grants
-- for authenticated/anon are validated separately in 09_engine_v2_core.
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);
SELECT set_config('role', 'postgres', true);

-- Teste 2: Módulo inválido
SELECT is(
  (public.start_approval_flow('invalido', 'e0000000-0000-0000-0000-000000000001'))->>'success',
  'false',
  'Deve falhar para módulo desconhecido'
);

-- Teste 3: Entidade inexistente
SELECT is(
  (public.start_approval_flow('compras', '00000000-0000-0000-0000-000000000000'))->>'success',
  'false',
  'Deve falhar para entidade inexistente'
);

-- Teste 4: Solicitação válida
SELECT is(
  (public.start_approval_flow('compras', 'e0000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve iniciar fluxo com sucesso para compras'
);

-- Teste 5: Status foi alterado
SELECT is(
  (SELECT status FROM public.purchases WHERE id = 'e0000000-0000-0000-0000-000000000001'),
  'em_aprovacao',
  'Status da purchase deve ser alterado para em_aprovacao'
);

-- Teste 6: Duplicidade (idempotência)
SELECT is(
  (public.start_approval_flow('compras', 'e0000000-0000-0000-0000-000000000001'))->>'success',
  'false',
  'Deve falhar ao tentar iniciar fluxo já ativo'
);

-- Bypass RLS to check audit logs and notifications
SELECT set_config('role', 'postgres', true);

-- Teste 7: Audit log criado
SELECT ok(
  EXISTS(SELECT 1 FROM public.audit_logs WHERE action = 'START_APPROVAL' AND entity_id = 'e0000000-0000-0000-0000-000000000001'),
  'Audit log deve ter sido criado'
);

-- Teste 8: Notification criada
SELECT ok(
  EXISTS(SELECT 1 FROM public.notifications WHERE user_id = '10000000-0000-0000-0000-000000000002' AND metadata->>'type' = 'approval_assigned'),
  'Notificação deve ter sido criada para o aprovador'
);

-- Restore RLS for the rest of tests
SELECT set_config('role', 'postgres', true);

-- Abastecimento (Teste Discriminator)
INSERT INTO public.fuel_requests (id, type, requester_user_id, status, valor) VALUES ('e00f0000-0000-0000-0000-000000000001', 'abastecimento', '10000000-0000-0000-0000-000000000001', 'rascunho', 100) ON CONFLICT DO NOTHING;
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000002';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0000000-0000-0000-0000-000000000002', '00000000-0001-0000-0000-000000000002', 'Abastecimento v1', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0000000-0000-0000-0000-000000000002', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'S1', true);

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);

-- Teste 9: Discriminator inválido
SELECT is(
  (public.start_approval_flow('diaria', 'e00f0000-0000-0000-0000-000000000001'))->>'success',
  'false',
  'Deve falhar se o discriminator for incompatível (enviou diaria para abastecimento)'
);

-- Teste 10: Abastecimento válido
SELECT is(
  (public.start_approval_flow('abastecimento', 'e00f0000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve iniciar fluxo de abastecimento com discriminator compatível'
);

SELECT set_config('role', 'postgres', true);

-- Teste 11: Autoaprovação proibida
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000003';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0f30000-0000-0000-0000-000000000003', '00000000-0001-0000-0000-000000000003', 'Diaria v1', true, 'v1', 'sequential');
-- Aprovador é o próprio solicitante
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0f30000-0000-0000-0000-000000000003', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000001', 'S1', true);
INSERT INTO public.fuel_requests (id, type, requester_user_id, status, valor) VALUES ('e00d0000-0000-0000-0000-000000000001', 'diaria', '10000000-0000-0000-0000-000000000001', 'rascunho', 100) ON CONFLICT DO NOTHING;

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT public.start_approval_flow('diaria', 'e00d0000-0000-0000-0000-000000000001')$$,
  'WORKFLOW_NO_ELIGIBLE_APPROVER',
  'Deve falhar por autoaprovação (se único aprovador for o solicitante, falha ao resolver)'
);

-- Teste 12: Ownership
SELECT set_config('role', 'postgres', true);
INSERT INTO public.purchases (id, requester_user_id, status, category, description) VALUES ('e0020000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'rascunho', 'IT', 'Teste') ON CONFLICT DO NOTHING;

-- Mudar jwt para o aprovador
SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002", "role":"authenticated"}', true);
SELECT is(
  (public.start_approval_flow('compras', 'e0020000-0000-0000-0000-000000000002'))->>'success',
  'false',
  'Deve falhar se o usuário não for o solicitante original da entidade'
);

-- Teste 13: Admin Inicia por outro
SELECT set_config('role', 'postgres', true);
-- Insert admin role
INSERT INTO public.roles (id, key, name) VALUES ('e1000000-0000-0000-0000-000000000001', 'master', 'Master') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id) VALUES ('10000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002", "role":"authenticated"}', true);

SELECT is(
  (public.start_approval_flow('compras', 'e0020000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve permitir iniciar por outro usuário se for master'
);

-- PREPARAÇÃO PARA OS TESTES DOS MÓDULOS RESTANTES
SELECT set_config('role', 'postgres', true);

-- Módulo Reembolso
INSERT INTO public.fuel_requests (id, type, requester_user_id, status, valor) VALUES ('e0040000-0000-0000-0000-000000000001', 'reembolso', '10000000-0000-0000-0000-000000000001', 'rascunho', 100) ON CONFLICT DO NOTHING;
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000004';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0f40000-0000-0000-0000-000000000004', '00000000-0001-0000-0000-000000000004', 'Reembolso v1', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0f40000-0000-0000-0000-000000000004', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'S1', true);

-- Módulo Admissões
INSERT INTO public.admission_requests (id, requester_user_id, status) VALUES ('e00a0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'rascunho') ON CONFLICT DO NOTHING;
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000005';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0f50000-0000-0000-0000-000000000005', '00000000-0001-0000-0000-000000000005', 'Admissoes v1', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0f50000-0000-0000-0000-000000000005', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'S1', true);

-- Módulo Desligamentos
INSERT INTO public.collaborators (id, full_name, status) VALUES ('10000000-0000-0000-0000-000000000001', 'Colab', 'active') ON CONFLICT DO NOTHING;
INSERT INTO public.termination_requests (id, requester_user_id, status, collaborator_id, tipo_desligamento, motivo, data_prevista, ultimo_dia_trabalhado, gestor_imediato, matricula) VALUES ('e0060000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'rascunho', '10000000-0000-0000-0000-000000000001', 'pedido_demissao', 'Motivo', '2026-12-31', '2026-12-31', 'Gestor', '123') ON CONFLICT DO NOTHING;
DELETE FROM public.approval_flows WHERE module_id = (SELECT id FROM public.approval_modules WHERE code = 'desligamentos');
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0f60000-0000-0000-0000-000000000006', (SELECT id FROM public.approval_modules WHERE code = 'desligamentos'), 'Desligamentos v1', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0f60000-0000-0000-0000-000000000006', 1, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'S1', true);

-- Ajustar Diária (Teste Válido)
-- Corrigir setup da diária para permitir outro aprovador além do solicitante, para podermos testar o start de sucesso.
DELETE FROM public.approval_flow_steps WHERE flow_id = 'e0f30000-0000-0000-0000-000000000003' AND step_order = 1;
UPDATE public.profiles SET manager_user_id = '10000000-0000-0000-0000-000000000002' WHERE id = '10000000-0000-0000-0000-000000000001';
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, approver_user_id, step_code, active) VALUES ('e0f30000-0000-0000-0000-000000000003', 2, 'usuario_fixo', '10000000-0000-0000-0000-000000000002', 'S2', true) ON CONFLICT DO NOTHING;
INSERT INTO public.fuel_requests (id, type, requester_user_id, status, valor) VALUES ('e00d0000-0000-0000-0000-000000000002', 'diaria', '10000000-0000-0000-0000-000000000001', 'rascunho', 100) ON CONFLICT DO NOTHING;


SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);

-- Teste 14: Diaria Válido (desde que o passo resolva para alguém não-solicitante)
SELECT is(
  (public.start_approval_flow('diaria', 'e00d0000-0000-0000-0000-000000000002'))->>'success',
  'true',
  'Deve iniciar fluxo de Diaria'
);

-- Teste 15: Reembolso Válido
SELECT is(
  (public.start_approval_flow('reembolso', 'e0040000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve iniciar fluxo de Reembolso'
);

-- Teste 16: Admissões Válido
SELECT is(
  (public.start_approval_flow('admissoes', 'e00a0000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve iniciar fluxo de Admissões'
);

-- Teste 17: Desligamentos Válido
SELECT is(
  (public.start_approval_flow('desligamentos', 'e0060000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve iniciar fluxo de Desligamentos'
);

-- Teste 18: Preservação de Snapshot
SELECT set_config('role', 'postgres', true);
SELECT is(
  (SELECT status FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'e00a0000-0000-0000-0000-000000000001' LIMIT 1) AND step_order = 1),
  'pending',
  'Passo criado com snapshot (status pendente)'
);

-- Teste 19: Rollback por Falha de Resolução (Sem etapas/sem responsável)
UPDATE public.profiles SET manager_user_id = NULL WHERE id = '10000000-0000-0000-0000-000000000001';
INSERT INTO public.admission_requests (id, requester_user_id, status) VALUES ('e00a0000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'rascunho') ON CONFLICT DO NOTHING;
DELETE FROM public.approval_request_steps;
DELETE FROM public.approval_requests;
DELETE FROM public.approval_flows WHERE module_id = '00000000-0001-0000-0000-000000000005';
INSERT INTO public.approval_flows (id, module_id, name, active, version, approval_type) VALUES ('e0f50000-0000-0000-0000-000000000005', '00000000-0001-0000-0000-000000000005', 'Admissoes', true, 'v1', 'sequential');
INSERT INTO public.approval_flow_steps (flow_id, step_order, approver_type, step_code, active) VALUES ('e0f50000-0000-0000-0000-000000000005', 1, 'gestor_imediato', 'S1', true); -- Não existe gestor configurado para 10000000-0000-0000-0000-000000000001

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.start_approval_flow('admissoes', 'e00a0000-0000-0000-0000-000000000002')$$,
  'WORKFLOW_NO_ELIGIBLE_APPROVER',
  'Falha ao resolver responsável (Rollback)'
);
SELECT set_config('role', 'postgres', true);
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'e00a0000-0000-0000-0000-000000000002'), 0, 'Nenhuma request criada devido ao rollback');
SELECT is((SELECT status::text FROM public.admission_requests WHERE id = 'e00a0000-0000-0000-0000-000000000002'), 'rascunho', 'Status mantido em rascunho devido ao rollback');

SELECT * FROM finish();
ROLLBACK;
