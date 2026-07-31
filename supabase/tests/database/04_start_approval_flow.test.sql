BEGIN;
SELECT plan(13);

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

-- Set user to requester
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

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

SELECT set_config('role', 'authenticated', true);
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

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001", "role":"authenticated"}', true);

SELECT is(
  (public.start_approval_flow('diaria', 'e00d0000-0000-0000-0000-000000000001'))->>'success',
  'false',
  'Deve falhar por autoaprovação (se único aprovador for o solicitante, falha ao resolver)'
);

-- Teste 12: Ownership
SELECT set_config('role', 'postgres', true);
INSERT INTO public.purchases (id, requester_user_id, status, category, description) VALUES ('e0020000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'rascunho', 'IT', 'Teste') ON CONFLICT DO NOTHING;

-- Mudar jwt para o aprovador
SELECT set_config('role', 'authenticated', true);
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

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002", "role":"authenticated"}', true);

SELECT is(
  (public.start_approval_flow('compras', 'e0020000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'))->>'success',
  'true',
  'Deve permitir iniciar por outro usuário se for master'
);

SELECT * FROM finish();
ROLLBACK;
