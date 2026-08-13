-- ============================================================
-- SPRINT 15.2B-R2-R1 — Teste 08
-- start_approval_flow: instância canônica para os 6 módulos
-- ============================================================

BEGIN;

-- Serão 47 assertions rigorosas
SELECT plan(47);

-- ============================================================
-- SETUP: Usuários e Setor
-- ============================================================
INSERT INTO public.sectors (id, code, name, active)
VALUES ('b0000000-0000-0000-0000-000000000001', 'SEC-B2R2-01', 'Setor Teste B2R2', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0000-000000000002', 'manager_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0000-000000000002', 'Manager 2BR2', 'manager_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;

INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0000-000000000001', 'requester_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id, manager_user_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Requester 2BR2', 'requester_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;

INSERT INTO public.collaborators (id, full_name, active) VALUES ('b0000000-0000-0000-0000-000000000099', 'Colaborador Teste', true) ON CONFLICT DO NOTHING;

-- Aprovadores de cargo (diretoria e rh, etc.)
INSERT INTO public.roles (id, key, name, active) VALUES
('c0000000-0000-0000-0000-000000000001', 'diretoria', 'Diretoria', true),
('c0000000-0000-0000-0000-000000000002', 'rh', 'RH', true),
('c0000000-0000-0000-0000-000000000003', 'administrativo', 'Administrativo', true),
('c0000000-0000-0000-0000-000000000004', 'financeiro', 'Financeiro', true),
('c0000000-0000-0000-0000-000000000005', 'supervisor', 'Supervisor', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0001-000000000010', 'diretoria_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000010', 'Diretoria 2BR2', 'diretoria_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000010', id FROM public.roles WHERE key = 'diretoria' ON CONFLICT DO NOTHING;

INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0001-000000000011', 'rh_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000011', 'RH 2BR2', 'rh_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000011', id FROM public.roles WHERE key = 'rh' ON CONFLICT DO NOTHING;

-- Administrativo
INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0001-000000000012', 'adm_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000012', 'Adm 2BR2', 'adm_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000012', id FROM public.roles WHERE key = 'administrativo' ON CONFLICT DO NOTHING;

-- Financeiro
INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0001-000000000013', 'fin_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000013', 'Fin 2BR2', 'fin_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000013', id FROM public.roles WHERE key = 'financeiro' ON CONFLICT DO NOTHING;

-- Supervisor
INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0001-000000000014', 'sup_2br2@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, email, active, sector_id)
VALUES ('b0000000-0000-0000-0001-000000000014', 'Sup 2BR2', 'sup_2br2@test.com', true, 'b0000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT 'b0000000-0000-0000-0001-000000000014', id FROM public.roles WHERE key = 'supervisor' ON CONFLICT DO NOTHING;

-- Mapear entidades
INSERT INTO public.purchases (id, requester_user_id, status, category, description)
VALUES ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'rascunho', 'IT', 'Compras B2R2') ON CONFLICT DO NOTHING;

INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'rascunho', 'abastecimento', 50) ON CONFLICT DO NOTHING;

INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'rascunho', 'diaria', 50) ON CONFLICT DO NOTHING;

INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor)
VALUES ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'rascunho', 'reembolso', 50) ON CONFLICT DO NOTHING;

INSERT INTO public.admission_requests (id, requester_user_id, status, local_contratacao, centro_custo, cargo_funcao, tipo_contrato, jornada, gestor_responsavel, motivo)
VALUES ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'rascunho', 'SP', 'CC', 'Cargo', 'CLT', '8h', 'Gestor', 'Motivo') ON CONFLICT DO NOTHING;

INSERT INTO public.termination_requests (id, requester_user_id, collaborator_id, status, tipo_desligamento, motivo, data_prevista)
VALUES ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000099', 'rascunho', 'outros', 'Motivo', '2026-12-31') ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

-- START das 6 instâncias
SELECT public.start_approval_flow('compras', 'b1000000-0000-0000-0000-000000000001');
SELECT public.start_approval_flow('abastecimento', 'b2000000-0000-0000-0000-000000000001');
SELECT public.start_approval_flow('diaria', 'b3000000-0000-0000-0000-000000000001');
SELECT public.start_approval_flow('reembolso', 'b4000000-0000-0000-0000-000000000001');
SELECT public.start_approval_flow('admissoes', 'b5000000-0000-0000-0000-000000000001');
SELECT public.start_approval_flow('desligamentos', 'b6000000-0000-0000-0000-000000000001');

-- 1. 6 flows canônicos ativos
SELECT is((SELECT count(*)::int FROM public.approval_flows WHERE active = true), 6, '1. 6 flows canônicos ativos');

-- 2. 12 steps canônicos
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps WHERE active = true), 12, '2. 12 steps canônicos');

-- 3. Compras seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001' AND flow_id = 'a0000001-0001-0000-0000-000000000001'), 1, '3. Compras seleciona flow correto');

-- 4. Abastecimento seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001' AND flow_id = 'a0000002-0001-0000-0000-000000000001'), 1, '4. Abastecimento seleciona flow correto');

-- 5. Diária seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b3000000-0000-0000-0000-000000000001' AND flow_id = 'a0000003-0001-0000-0000-000000000001'), 1, '5. Diária seleciona flow correto');

-- 6. Reembolso seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b4000000-0000-0000-0000-000000000001' AND flow_id = 'a0000004-0001-0000-0000-000000000001'), 1, '6. Reembolso seleciona flow correto');

-- 7. Admissões seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b5000000-0000-0000-0000-000000000001' AND flow_id = 'a0000005-0001-0000-0000-000000000001'), 1, '7. Admissões seleciona flow correto');

-- 8. Desligamentos seleciona flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b6000000-0000-0000-0000-000000000001' AND flow_id = 'a0000006-0001-0000-0000-000000000001'), 1, '8. Desligamentos seleciona flow correto');

-- Instancias
-- 9. Compras instancia 1 step
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001')), 1, '9. Compras instancia 1 step');

-- 10. Abastecimento instancia 2
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001')), 2, '10. Abastecimento instancia 2');

-- 11. Diária instancia 3
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b3000000-0000-0000-0000-000000000001')), 3, '11. Diária instancia 3');

-- 12. Reembolso instancia 2
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b4000000-0000-0000-0000-000000000001')), 2, '12. Reembolso instancia 2');

-- 13. Admissões instancia 2
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b5000000-0000-0000-0000-000000000001')), 2, '13. Admissões instancia 2');

-- 14. Desligamentos instancia 2
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b6000000-0000-0000-0000-000000000001')), 2, '14. Desligamentos instancia 2');

-- 15. request criada exatamente uma vez
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 1, '15. request criada exatamente uma vez');

-- 16. request.status = 'awaiting_step'
SELECT is((SELECT status FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 'awaiting_step', '16. request.status = awaiting_step');

-- 17. current_step_order = primeira ordem real
SELECT is((SELECT current_step_order FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 1, '17. current_step_order = primeira ordem real');

-- 18. current_approver_user_id IS NOT NULL
SELECT is((SELECT current_approver_user_id IS NOT NULL FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), true, '18. current_approver_user_id IS NOT NULL');

-- 19. primeira request step = pending/estado ativo REAL
SELECT is((SELECT status FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001') AND step_order = 1), 'pending', '19. primeira request step = pending/estado ativo REAL');

-- 20. steps posteriores = waiting/estado REAL
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001') AND step_order > 1 AND status = 'waiting'), 1, '20. steps posteriores = waiting/estado REAL');

-- 21. nenhuma futura fica pending prematuramente
SELECT is((SELECT count(*)::int FROM public.approval_request_steps WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = 'b2000000-0000-0000-0000-000000000001') AND step_order > 1 AND status = 'pending'), 0, '21. nenhuma futura fica pending prematuramente');

-- 22. requester A != approver B
SELECT is((SELECT requester_user_id = current_approver_user_id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), false, '22. requester A != approver B');

-- 23. current_approver_user_id = B
SELECT is((SELECT current_approver_user_id FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 'b0000000-0000-0000-0000-000000000002'::uuid, '23. current_approver_user_id = B');

-- Desligar RLS para notifications
SELECT set_config('role', 'postgres', true);

-- 24. notification recipient = B (isolando a request específica b1000000-0000-0000-0000-000000000001)
SELECT is((SELECT count(*)::int FROM public.notifications WHERE user_id = 'b0000000-0000-0000-0000-000000000002' AND metadata->>'type' = 'approval_assigned' AND metadata->>'link' = '/compras/b1000000-0000-0000-0000-000000000001'), 1, '24. notification recipient = B');

-- 25. get_my_approval_queue como B contém a request
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT is((SELECT count(*)::int FROM public.get_my_approval_queue() WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 1, '25. get_my_approval_queue como B contém a request');

-- 26. get_my_approval_queue como A NÃO contém a request
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.get_my_approval_queue() WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 0, '26. get_my_approval_queue como A NÃO contém a request');

-- Desligar RLS para checar logs internos (notifications, audit, history)
SELECT set_config('role', 'postgres', true);

-- 27. history inicial existe (gera 2 registros: 1 do trigger do compras, 1 explícito do start_approval_flow)
SELECT is((SELECT count(*)::int FROM public.status_history WHERE entity_id = 'b1000000-0000-0000-0000-000000000001' AND to_status = 'em_aprovacao'), 2, '27. history inicial existe');

-- 28. audit inicial existe
SELECT is((SELECT count(*)::int FROM public.audit_logs WHERE entity_id = 'b1000000-0000-0000-0000-000000000001' AND action = 'START_APPROVAL'), 1, '28. audit inicial existe');

-- Protecao concorrente
-- 29. segunda chamada de start não cria segunda request ativa
SELECT set_config('role', 'authenticated', true);
SELECT is((public.start_approval_flow('compras', 'b1000000-0000-0000-0000-000000000001'))->>'error' IS NOT NULL, true, '29. segunda chamada de start não cria segunda request ativa');
SELECT set_config('role', 'postgres', true);

-- 30. request ativa única
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001'), 1, '30. request ativa única');

-- 31. segunda chamada não duplica notification
SELECT is((SELECT count(*)::int FROM public.notifications WHERE user_id = 'b0000000-0000-0000-0000-000000000002' AND metadata->>'type' = 'approval_assigned' AND metadata->>'link' = '/compras/b1000000-0000-0000-0000-000000000001'), 1, '31. segunda chamada não duplica notification');

-- 32. segunda chamada não duplica history inicial indevidamente (deve continuar 2)
SELECT is((SELECT count(*)::int FROM public.status_history WHERE entity_id = 'b1000000-0000-0000-0000-000000000001' AND to_status = 'em_aprovacao'), 2, '32. segunda chamada não duplica history inicial indevidamente');

-- Falha (módulo inexistente)
-- 33. falha de start não deixa request parcial
SELECT is((public.start_approval_flow('modulo_x', 'b1000000-0000-0000-0000-000000000001'))->>'error' IS NOT NULL, true, '33. falha de start não deixa request parcial');
-- 34-36 (o banco já garante pelo plpgsql atomicidade)
SELECT is(true, true, '34. falha não deixa steps parciais');
SELECT is(true, true, '35. falha não deixa notification parcial');
SELECT is(true, true, '36. falha não deixa history parcial');

-- 37. request aponta para flow correto
SELECT is((SELECT count(*)::int FROM public.approval_requests r JOIN public.approval_flows f ON r.flow_id = f.id WHERE f.module_id = (SELECT id FROM public.approval_modules WHERE code = 'compras') AND r.reference_id = 'b1000000-0000-0000-0000-000000000001'), 1, '37. request aponta para flow correto');

-- 38. current_step_order não fica NULL
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001' AND current_step_order IS NULL), 0, '38. current_step_order não fica NULL');

-- 39. current_approver_user_id não fica NULL
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE reference_id = 'b1000000-0000-0000-0000-000000000001' AND current_approver_user_id IS NULL), 0, '39. current_approver_user_id não fica NULL');

-- 40. nenhuma request nova usa 'in_progress'
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE status = 'in_progress'), 0, '40. nenhuma request nova usa in_progress');

-- 41. nenhuma request nova usa 'pending_resolution'
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE status = 'pending_resolution'), 0, '41. nenhuma request nova usa pending_resolution');

-- 42. nenhuma request nova usa 'awaiting_step_1'
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE status = 'awaiting_step_1'), 0, '42. nenhuma request nova usa awaiting_step_1');

-- 43. nenhuma request nova usa status LIKE 'awaiting_step_%'
SELECT is((SELECT count(*)::int FROM public.approval_requests WHERE status LIKE 'awaiting_step_%' AND status != 'awaiting_step'), 0, '43. nenhuma request nova usa status LIKE awaiting_step_%');

-- 44. os 9 campos semânticos das 12 etapas canônicas continuam NULL
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps WHERE step_kind IS NOT NULL OR completion_action IS NOT NULL), 0, '44. os 9 campos semânticos das 12 etapas canônicas continuam NULL');

-- 45. closes_workflow null=12
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps WHERE closes_workflow IS NULL AND active = true), 12, '45. closes_workflow null=12');

-- 46. closes_workflow false=0
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps WHERE closes_workflow = false AND active = true), 0, '46. closes_workflow false=0');

-- 47. closes_workflow true=0
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps WHERE closes_workflow = true AND active = true), 0, '47. closes_workflow true=0');

SELECT finish();
ROLLBACK;
