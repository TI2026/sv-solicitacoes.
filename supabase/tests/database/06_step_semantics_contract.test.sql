BEGIN;

-- Total number of assertions required by the contract
SELECT plan(55);

-- 1. Existência dos 9 campos
SELECT has_column('public', 'approval_flow_steps', 'step_kind', 'Coluna step_kind existe');
SELECT has_column('public', 'approval_flow_steps', 'completion_action', 'Coluna completion_action existe');
SELECT has_column('public', 'approval_flow_steps', 'entity_status_on_entry', 'Coluna entity_status_on_entry existe');
SELECT has_column('public', 'approval_flow_steps', 'entity_status_on_success', 'Coluna entity_status_on_success existe');
SELECT has_column('public', 'approval_flow_steps', 'return_entity_status', 'Coluna return_entity_status existe');
SELECT has_column('public', 'approval_flow_steps', 'rejection_entity_status', 'Coluna rejection_entity_status existe');
SELECT has_column('public', 'approval_flow_steps', 'next_step_activation', 'Coluna next_step_activation existe');
SELECT has_column('public', 'approval_flow_steps', 'approval_request_status_after', 'Coluna approval_request_status_after existe');
SELECT has_column('public', 'approval_flow_steps', 'closes_workflow', 'Coluna closes_workflow existe');

-- 2. Nullabilidade (não pode ser NOT NULL)
SELECT col_is_null('public', 'approval_flow_steps', 'step_kind', 'step_kind aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'completion_action', 'completion_action aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'entity_status_on_entry', 'entity_status_on_entry aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'entity_status_on_success', 'entity_status_on_success aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'return_entity_status', 'return_entity_status aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'rejection_entity_status', 'rejection_entity_status aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'next_step_activation', 'next_step_activation aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'approval_request_status_after', 'approval_request_status_after aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'closes_workflow', 'closes_workflow aceita null');

-- 3. Ausência de default
SELECT col_hasnt_default('public', 'approval_flow_steps', 'step_kind', 'step_kind não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'completion_action', 'completion_action não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'entity_status_on_entry', 'entity_status_on_entry não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'entity_status_on_success', 'entity_status_on_success não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'return_entity_status', 'return_entity_status não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'rejection_entity_status', 'rejection_entity_status não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'next_step_activation', 'next_step_activation não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'approval_request_status_after', 'approval_request_status_after não tem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'closes_workflow', 'closes_workflow não tem default');

-- Inserir etapa temporária para testes (usamos um flow_id existente e um id seguro para a etapa)
INSERT INTO public.approval_flow_steps (id, flow_id, step_order, step_code, step_name, approver_type, approver_role_key, default_sla_hours, active)
SELECT '00000000-0000-0000-0000-000000008888', id, 99, 'TEST_STEP', 'Test', 'cargo_perfil', 'diretoria', 24, true 
FROM public.approval_flows LIMIT 1;

-- 4 e 5. Validar step_kind
PREPARE set_step_kind AS UPDATE public.approval_flow_steps SET step_kind = $1 WHERE id = '00000000-0000-0000-0000-000000008888';
SELECT lives_ok('EXECUTE set_step_kind(''approval'')', 'step_kind aceita approval');
SELECT lives_ok('EXECUTE set_step_kind(''review'')', 'step_kind aceita review');
SELECT lives_ok('EXECUTE set_step_kind(''verification'')', 'step_kind aceita verification');
SELECT lives_ok('EXECUTE set_step_kind(''payment'')', 'step_kind aceita payment');
SELECT lives_ok('EXECUTE set_step_kind(''hr_processing'')', 'step_kind aceita hr_processing');
SELECT throws_ok('EXECUTE set_step_kind(''invalido'')', 'new row for relation "approval_flow_steps" violates check constraint "chk_step_kind"', 'step_kind rejeita valor invalido');

-- 6, 7 e 8. Validar completion_action
PREPARE set_completion_action AS UPDATE public.approval_flow_steps SET completion_action = $1 WHERE id = '00000000-0000-0000-0000-000000008888';
SELECT lives_ok('EXECUTE set_completion_action(''aprovar'')', 'completion_action aceita aprovar');
SELECT lives_ok('EXECUTE set_completion_action(''concluir_revisao'')', 'completion_action aceita concluir_revisao');
SELECT lives_ok('EXECUTE set_completion_action(''confirmar_horas'')', 'completion_action aceita confirmar_horas');
SELECT lives_ok('EXECUTE set_completion_action(''pagar'')', 'completion_action aceita pagar');
SELECT lives_ok('EXECUTE set_completion_action(''concluir_triagem'')', 'completion_action aceita concluir_triagem');
SELECT lives_ok('EXECUTE set_completion_action(''concluir_processamento_rh'')', 'completion_action aceita concluir_processamento_rh');
SELECT throws_ok('EXECUTE set_completion_action(''enviar'')', 'new row for relation "approval_flow_steps" violates check constraint "chk_completion_action"', 'completion_action rejeita enviar');
SELECT throws_ok('EXECUTE set_completion_action(''invalido'')', 'new row for relation "approval_flow_steps" violates check constraint "chk_completion_action"', 'completion_action rejeita valor desconhecido');

-- 9 e 10. Validar next_step_activation
PREPARE set_next_step AS UPDATE public.approval_flow_steps SET next_step_activation = $1 WHERE id = '00000000-0000-0000-0000-000000008888';
SELECT lives_ok('EXECUTE set_next_step(''enviar_comprovantes'')', 'next_step_activation aceita enviar_comprovantes');
SELECT throws_ok('EXECUTE set_next_step(''invalido'')', 'new row for relation "approval_flow_steps" violates check constraint "chk_next_step_activation"', 'next_step_activation rejeita valor invalido');

-- 11 e 12. Validar approval_request_status_after
PREPARE set_status_after AS UPDATE public.approval_flow_steps SET approval_request_status_after = $1 WHERE id = '00000000-0000-0000-0000-000000008888';
SELECT lives_ok('EXECUTE set_status_after(''awaiting_step'')', 'approval_request_status_after aceita awaiting_step');
SELECT lives_ok('EXECUTE set_status_after(''waiting_operational'')', 'approval_request_status_after aceita waiting_operational');
SELECT lives_ok('EXECUTE set_status_after(''completed'')', 'approval_request_status_after aceita completed');
SELECT throws_ok('EXECUTE set_status_after(''invalido'')', 'new row for relation "approval_flow_steps" violates check constraint "chk_approval_request_status_after"', 'approval_request_status_after rejeita valor invalido');

-- 13. Aceitação de NULL em todos os campos
PREPARE set_nulls AS UPDATE public.approval_flow_steps SET step_kind = NULL, completion_action = NULL, next_step_activation = NULL, approval_request_status_after = NULL, closes_workflow = NULL WHERE id = '00000000-0000-0000-0000-000000008888';
SELECT lives_ok('EXECUTE set_nulls', 'Aceitacao de NULL em todos os campos');

-- Limpar dados de teste (eles serao revertidos no final, mas garante state)
DELETE FROM public.approval_flow_steps WHERE id = '00000000-0000-0000-0000-000000008888';

-- 14. Exatamente 6 fluxos canônicos ativos
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flows WHERE active = true), 6, 'Existem exatamente 6 fluxos ativos canônicos');

-- 15. Exatamente 12 etapas canônicas
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE flow_id IN (SELECT id FROM public.approval_flows WHERE active = true)), 12, 'Existem exatamente 12 etapas canônicas');

-- 16 a 24. Validar preservacao das 12 etapas canônicas originais sem alteracoes indevidas
-- Como o setup tem seed, sabemos os codes originais. O mais facil eh checar que campos novos estao NULL 
-- para TODAS as 12 etapas do seed.
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE step_kind IS NOT NULL), 0, 'step_kind permanece NULL nas 12 etapas');
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE completion_action IS NOT NULL), 0, 'completion_action permanece NULL nas 12 etapas');

-- Verificar se order, step_code etc não foram corrompidos
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE step_code IS NULL), 0, 'step_code preservado (nenhum NULL)');
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE step_order IS NULL), 0, 'step_order preservado');
SELECT is((SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE approver_type IS NULL), 0, 'approver_type preservado');

-- Reverter qualquer estado alterado no teste
ROLLBACK;
