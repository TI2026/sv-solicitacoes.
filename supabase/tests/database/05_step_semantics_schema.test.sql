BEGIN;
SELECT plan(12);

-- 1. Tabela existe
SELECT has_table('public', 'approval_flow_steps', 'Tabela approval_flow_steps existe');

-- 2. Colunas existem (9 testes)
SELECT has_column('public', 'approval_flow_steps', 'step_kind', 'Coluna step_kind existe');
SELECT has_column('public', 'approval_flow_steps', 'completion_action', 'Coluna completion_action existe');
SELECT has_column('public', 'approval_flow_steps', 'entity_status_on_entry', 'Coluna entity_status_on_entry existe');
SELECT has_column('public', 'approval_flow_steps', 'entity_status_on_success', 'Coluna entity_status_on_success existe');
SELECT has_column('public', 'approval_flow_steps', 'return_entity_status', 'Coluna return_entity_status existe');
SELECT has_column('public', 'approval_flow_steps', 'rejection_entity_status', 'Coluna rejection_entity_status existe');
SELECT has_column('public', 'approval_flow_steps', 'next_step_activation', 'Coluna next_step_activation existe');
SELECT has_column('public', 'approval_flow_steps', 'approval_request_status_after', 'Coluna approval_request_status_after existe');
SELECT has_column('public', 'approval_flow_steps', 'closes_workflow', 'Coluna closes_workflow existe');

-- 3. Constraints
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_step_kind'), 'Constraint chk_step_kind existe');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_completion_action'), 'Constraint chk_completion_action existe');

SELECT * FROM finish();
ROLLBACK;
