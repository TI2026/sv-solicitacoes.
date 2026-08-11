-- pgTAP Test: Sprint 15.2F1A-R2 - Canonical Steps Nullable Contract
-- Valida que as 12 etapas canônicas têm os 9 campos semânticos NULL
-- e que o contrato de schema está preservado.

BEGIN;
SELECT plan(62);

-- ============================================================
-- BLOCO 1: 6 fluxos canônicos ativos
-- ============================================================

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flows
   WHERE active = true
     AND id IN (
       'a0000001-0001-0000-0000-000000000001',
       'a0000002-0001-0000-0000-000000000001',
       'a0000003-0001-0000-0000-000000000001',
       'a0000004-0001-0000-0000-000000000001',
       'a0000005-0001-0000-0000-000000000001',
       'a0000006-0001-0000-0000-000000000001'
     )),
  6,
  'Existem exatamente 6 fluxos canônicos ativos'
);

-- ============================================================
-- BLOCO 2: Exatamente 12 etapas canônicas e sem duplicidade
-- ============================================================

SELECT is(
  (SELECT COUNT(*)::integer
   FROM public.approval_flow_steps
   WHERE flow_id IN (
     'a0000001-0001-0000-0000-000000000001',
     'a0000002-0001-0000-0000-000000000001',
     'a0000003-0001-0000-0000-000000000001',
     'a0000004-0001-0000-0000-000000000001',
     'a0000005-0001-0000-0000-000000000001',
     'a0000006-0001-0000-0000-000000000001'
   )),
  12,
  'Existem exatamente 12 etapas canônicas'
);

-- Sem duplicidade por (flow_id, step_code, step_order)
SELECT is(
  (SELECT COUNT(DISTINCT (flow_id, step_code, step_order))::integer
   FROM public.approval_flow_steps
   WHERE flow_id IN (
     'a0000001-0001-0000-0000-000000000001',
     'a0000002-0001-0000-0000-000000000001',
     'a0000003-0001-0000-0000-000000000001',
     'a0000004-0001-0000-0000-000000000001',
     'a0000005-0001-0000-0000-000000000001',
     'a0000006-0001-0000-0000-000000000001'
   )),
  12,
  'Matriz sem duplicidade'
);

-- ============================================================
-- BLOCO 3: Cada um dos 12 pares flow/step/order existe
-- ============================================================

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000001-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_gestor' AND step_order = 1),
  'Etapa 1: compras / aprovacao_gestor / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000002-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_supervisor' AND step_order = 1),
  'Etapa 2: abastecimento / aprovacao_supervisor / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000002-0001-0000-0000-000000000001'
           AND step_code = 'revisao_adm' AND step_order = 2),
  'Etapa 3: abastecimento / revisao_adm / order 2'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000003-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_gestor' AND step_order = 1),
  'Etapa 4: diaria / aprovacao_gestor / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000003-0001-0000-0000-000000000001'
           AND step_code = 'verificacao_horas' AND step_order = 2),
  'Etapa 5: diaria / verificacao_horas / order 2'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000003-0001-0000-0000-000000000001'
           AND step_code = 'confirmacao_pagamento' AND step_order = 3),
  'Etapa 6: diaria / confirmacao_pagamento / order 3'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000004-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_gestor' AND step_order = 1),
  'Etapa 7: reembolso / aprovacao_gestor / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000004-0001-0000-0000-000000000001'
           AND step_code = 'revisao_financeira' AND step_order = 2),
  'Etapa 8: reembolso / revisao_financeira / order 2'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000005-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_vaga' AND step_order = 1),
  'Etapa 9: admissoes / aprovacao_vaga / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000005-0001-0000-0000-000000000001'
           AND step_code = 'triagem' AND step_order = 2),
  'Etapa 10: admissoes / triagem / order 2'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000006-0001-0000-0000-000000000001'
           AND step_code = 'aprovacao_desligamento' AND step_order = 1),
  'Etapa 11: desligamentos / aprovacao_desligamento / order 1'
);

SELECT ok(
  EXISTS(SELECT 1 FROM public.approval_flow_steps
         WHERE flow_id = 'a0000006-0001-0000-0000-000000000001'
           AND step_code = 'processamento_rh' AND step_order = 2),
  'Etapa 12: desligamentos / processamento_rh / order 2'
);

-- ============================================================
-- BLOCO 4: Os 9 campos semânticos são NULL nas 12 etapas
-- ============================================================

-- Contagem NULL = 12 para cada campo individual
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND step_kind IS NULL),
  12,
  'step_kind NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND completion_action IS NULL),
  12,
  'completion_action NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND entity_status_on_entry IS NULL),
  12,
  'entity_status_on_entry NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND entity_status_on_success IS NULL),
  12,
  'entity_status_on_success NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND return_entity_status IS NULL),
  12,
  'return_entity_status NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND rejection_entity_status IS NULL),
  12,
  'rejection_entity_status NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND next_step_activation IS NULL),
  12,
  'next_step_activation NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND approval_request_status_after IS NULL),
  12,
  'approval_request_status_after NULL = 12'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND closes_workflow IS NULL),
  12,
  'closes_workflow NULL = 12'
);

-- closes_workflow false = 0 nas canônicas
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND closes_workflow IS FALSE),
  0,
  'closes_workflow false = 0'
);

-- closes_workflow true = 0 nas canônicas
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND closes_workflow IS TRUE),
  0,
  'closes_workflow true = 0'
);

-- ============================================================
-- BLOCO 5: Nullabilidade dos 9 campos
-- ============================================================

SELECT col_is_null('public', 'approval_flow_steps', 'step_kind', 'step_kind aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'completion_action', 'completion_action aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'entity_status_on_entry', 'entity_status_on_entry aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'entity_status_on_success', 'entity_status_on_success aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'return_entity_status', 'return_entity_status aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'rejection_entity_status', 'rejection_entity_status aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'next_step_activation', 'next_step_activation aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'approval_request_status_after', 'approval_request_status_after aceita null');
SELECT col_is_null('public', 'approval_flow_steps', 'closes_workflow', 'closes_workflow aceita null');

-- ============================================================
-- BLOCO 6: Ausência de default nos 9 campos
-- ============================================================

SELECT col_hasnt_default('public', 'approval_flow_steps', 'step_kind', 'step_kind sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'completion_action', 'completion_action sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'entity_status_on_entry', 'entity_status_on_entry sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'entity_status_on_success', 'entity_status_on_success sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'return_entity_status', 'return_entity_status sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'rejection_entity_status', 'rejection_entity_status sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'next_step_activation', 'next_step_activation sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'approval_request_status_after', 'approval_request_status_after sem default');
SELECT col_hasnt_default('public', 'approval_flow_steps', 'closes_workflow', 'closes_workflow sem default');

-- ============================================================
-- BLOCO 7: 4 constraints preservadas
-- ============================================================

SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_step_kind'), 'Constraint chk_step_kind existe');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_completion_action'), 'Constraint chk_completion_action existe');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_next_step_activation'), 'Constraint chk_next_step_activation existe');
SELECT ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'chk_approval_request_status_after'), 'Constraint chk_approval_request_status_after existe');

-- ============================================================
-- BLOCO 8: step_code e step_order correspondem à matriz
-- ============================================================

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE step_code IS NULL
     AND flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')),
  0,
  'step_code preservado — nenhum NULL'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE step_order IS NULL
     AND flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')),
  0,
  'step_order preservado — nenhum NULL'
);

-- ============================================================
-- BLOCO 9: Aprovadores preservados
-- ============================================================

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE approver_type IS NULL
     AND flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')),
  0,
  'approver_type preservado — nenhum NULL'
);

-- approver_role_key: 4 etapas têm role_key nulo (gestor_imediato), 8 têm valor
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND approver_type = 'gestor_imediato'),
  4,
  'approver_type gestor_imediato = 4'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND approver_type = 'cargo_perfil'),
  8,
  'approver_type cargo_perfil = 8'
);

-- approver_user_id deve ser NULL nas 12 canônicas (não há usuário fixo)
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND approver_user_id IS NOT NULL),
  0,
  'approver_user_id NULL nas 12 canonicas'
);

-- fixed_sector_id deve ser NULL nas 12 canônicas
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND fixed_sector_id IS NOT NULL),
  0,
  'fixed_sector_id NULL nas 12 canonicas'
);

-- ============================================================
-- BLOCO 10: SLAs preservados
-- ============================================================

SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps WHERE default_sla_hours IS NULL
     AND flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')),
  0,
  'default_sla_hours preservado — nenhum NULL'
);

-- active preservado: todos ativos
SELECT is(
  (SELECT COUNT(*)::integer FROM public.approval_flow_steps
   WHERE flow_id IN ('a0000001-0001-0000-0000-000000000001','a0000002-0001-0000-0000-000000000001','a0000003-0001-0000-0000-000000000001','a0000004-0001-0000-0000-000000000001','a0000005-0001-0000-0000-000000000001','a0000006-0001-0000-0000-000000000001')
     AND active = true),
  12,
  'active preservado — todos ativos'
);

-- ============================================================
-- BLOCO 11: Valor inválido rejeitado em fixture isolada
-- ============================================================

INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, step_code, step_name, approver_type, approver_role_key, default_sla_hours, active
)
SELECT
  '00000000-0000-0000-0000-000000007777',
  id,
  999,
  'TEST_NULLS_FIXTURE',
  'Test Nulls',
  'cargo_perfil',
  'diretoria',
  24,
  true
FROM public.approval_flows LIMIT 1;

PREPARE set_step_kind_invalid AS UPDATE public.approval_flow_steps SET step_kind = $1 WHERE id = '00000000-0000-0000-0000-000000007777';
SELECT throws_ok(
  'EXECUTE set_step_kind_invalid(''invalido'')',
  'new row for relation "approval_flow_steps" violates check constraint "chk_step_kind"',
  'step_kind rejeita valor invalido'
);

PREPARE set_completion_action_invalid AS UPDATE public.approval_flow_steps SET completion_action = $1 WHERE id = '00000000-0000-0000-0000-000000007777';
SELECT throws_ok(
  'EXECUTE set_completion_action_invalid(''invalido'')',
  'new row for relation "approval_flow_steps" violates check constraint "chk_completion_action"',
  'completion_action rejeita valor invalido'
);

PREPARE set_next_step_invalid AS UPDATE public.approval_flow_steps SET next_step_activation = $1 WHERE id = '00000000-0000-0000-0000-000000007777';
SELECT throws_ok(
  'EXECUTE set_next_step_invalid(''invalido'')',
  'new row for relation "approval_flow_steps" violates check constraint "chk_next_step_activation"',
  'next_step_activation rejeita valor invalido'
);

PREPARE set_status_after_invalid AS UPDATE public.approval_flow_steps SET approval_request_status_after = $1 WHERE id = '00000000-0000-0000-0000-000000007777';
SELECT throws_ok(
  'EXECUTE set_status_after_invalid(''invalido'')',
  'new row for relation "approval_flow_steps" violates check constraint "chk_approval_request_status_after"',
  'approval_request_status_after rejeita valor invalido'
);

-- NULL aceito em todos os campos da fixture
PREPARE set_all_nulls AS UPDATE public.approval_flow_steps
  SET step_kind = NULL, completion_action = NULL, entity_status_on_entry = NULL,
      entity_status_on_success = NULL, return_entity_status = NULL,
      rejection_entity_status = NULL, next_step_activation = NULL,
      approval_request_status_after = NULL, closes_workflow = NULL
  WHERE id = '00000000-0000-0000-0000-000000007777';
SELECT lives_ok('EXECUTE set_all_nulls', 'NULL aceito em todos os 9 campos na fixture');

DELETE FROM public.approval_flow_steps WHERE id = '00000000-0000-0000-0000-000000007777';

SELECT * FROM finish();
ROLLBACK;
