-- Migration: Sprint 15.2F1A-R2 - Restauração do Contrato Nullable
-- Descrição: Corrige o efeito residual da migration 20260725101000 que materializou
--            closes_workflow = false nas 12 etapas canônicas ao criar a coluna com DEFAULT false.
--            A migration 20260725102000 removeu o default, mas não restaurou os valores
--            existentes para NULL. Esta migration faz exclusivamente esse ajuste.
-- Scope: somente UPDATE closes_workflow = NULL onde closes_workflow IS FALSE
--        nas 12 etapas identificadas por (flow_id, step_code, step_order).

DO $$
DECLARE
  v_canonical_count  integer;
  v_matched_count    integer;
  v_pre_false_count  integer;
  v_pre_true_count   integer;
  v_pre_null_count   integer;
  v_post_null_count  integer;
  v_post_false_count integer;
  v_post_true_count  integer;
BEGIN

  -- 1. Definir a matriz canônica exata
  CREATE TEMP TABLE canonical_steps (flow_id uuid, step_code text, step_order integer) ON COMMIT DROP;

  INSERT INTO canonical_steps (flow_id, step_code, step_order) VALUES
    ('a0000001-0001-0000-0000-000000000001', 'aprovacao_gestor',      1),
    ('a0000002-0001-0000-0000-000000000001', 'aprovacao_supervisor',  1),
    ('a0000002-0001-0000-0000-000000000001', 'revisao_adm',           2),
    ('a0000003-0001-0000-0000-000000000001', 'aprovacao_gestor',      1),
    ('a0000003-0001-0000-0000-000000000001', 'verificacao_horas',     2),
    ('a0000003-0001-0000-0000-000000000001', 'confirmacao_pagamento', 3),
    ('a0000004-0001-0000-0000-000000000001', 'aprovacao_gestor',      1),
    ('a0000004-0001-0000-0000-000000000001', 'revisao_financeira',    2),
    ('a0000005-0001-0000-0000-000000000001', 'aprovacao_vaga',        1),
    ('a0000005-0001-0000-0000-000000000001', 'triagem',               2),
    ('a0000006-0001-0000-0000-000000000001', 'aprovacao_desligamento',1),
    ('a0000006-0001-0000-0000-000000000001', 'processamento_rh',      2);

  -- 2. Invariante: a matriz deve ter exatamente 12 linhas únicas
  SELECT COUNT(DISTINCT (flow_id, step_code, step_order)) INTO v_canonical_count FROM canonical_steps;
  IF v_canonical_count <> 12 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: a matriz canônica não possui exatamente 12 linhas únicas (encontrado: %)', v_canonical_count;
  END IF;

  -- 3. Invariante: exatamente 12 linhas do banco devem corresponder à matriz
  SELECT COUNT(*) INTO v_matched_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order;

  IF v_matched_count <> 12 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: exatamente 12 linhas do banco devem corresponder à matriz (encontrado: %)', v_matched_count;
  END IF;

  -- 4. Invariante: os 8 campos text semânticos devem estar NULL nas 12 etapas canônicas
  SELECT COUNT(*) INTO v_pre_false_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.step_kind IS NOT NULL
     OR afs.completion_action IS NOT NULL
     OR afs.entity_status_on_entry IS NOT NULL
     OR afs.entity_status_on_success IS NOT NULL
     OR afs.return_entity_status IS NOT NULL
     OR afs.rejection_entity_status IS NOT NULL
     OR afs.next_step_activation IS NOT NULL
     OR afs.approval_request_status_after IS NOT NULL;

  IF v_pre_false_count > 0 THEN
    RAISE EXCEPTION 'SEMANTICA_JA_MATERIALIZADA_INESPERADAMENTE: % etapas canônicas possuem semântica preenchida nos 8 campos text', v_pre_false_count;
  END IF;

  -- 5. Invariante: closes_workflow deve ser somente NULL ou false nas 12 etapas
  SELECT COUNT(*) INTO v_pre_true_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.closes_workflow IS TRUE;

  IF v_pre_true_count > 0 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: % etapas canônicas têm closes_workflow = true (inesperado)', v_pre_true_count;
  END IF;

  SELECT COUNT(*) INTO v_pre_false_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.closes_workflow IS FALSE;

  SELECT COUNT(*) INTO v_pre_null_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.closes_workflow IS NULL;

  RAISE NOTICE 'PRE-UPDATE: closes_workflow false=%, null=%, true=%', v_pre_false_count, v_pre_null_count, v_pre_true_count;

  -- 6. Executar a única DML permitida: UPDATE closes_workflow false -> NULL
  UPDATE public.approval_flow_steps afs
  SET closes_workflow = NULL
  FROM canonical_steps cs
  WHERE afs.flow_id = cs.flow_id
    AND afs.step_code = cs.step_code
    AND afs.step_order = cs.step_order
    AND afs.closes_workflow IS FALSE;

  -- 7. Invariante pós-UPDATE: os 9 campos devem estar NULL nas 12 etapas
  SELECT COUNT(*) INTO v_post_null_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.step_kind IS NULL
    AND afs.completion_action IS NULL
    AND afs.entity_status_on_entry IS NULL
    AND afs.entity_status_on_success IS NULL
    AND afs.return_entity_status IS NULL
    AND afs.rejection_entity_status IS NULL
    AND afs.next_step_activation IS NULL
    AND afs.approval_request_status_after IS NULL
    AND afs.closes_workflow IS NULL;

  IF v_post_null_count <> 12 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: após o UPDATE, % etapas têm todos os 9 campos NULL (esperado: 12)', v_post_null_count;
  END IF;

  SELECT COUNT(*) INTO v_post_false_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.closes_workflow IS FALSE;

  SELECT COUNT(*) INTO v_post_true_count
  FROM public.approval_flow_steps afs
  JOIN canonical_steps cs
    ON afs.flow_id = cs.flow_id
   AND afs.step_code = cs.step_code
   AND afs.step_order = cs.step_order
  WHERE afs.closes_workflow IS TRUE;

  IF v_post_false_count <> 0 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: após o UPDATE, closes_workflow ainda false em % etapas', v_post_false_count;
  END IF;

  IF v_post_true_count <> 0 THEN
    RAISE EXCEPTION 'INVARIANT FAIL: closes_workflow true em % etapas canônicas após o UPDATE', v_post_true_count;
  END IF;

  RAISE NOTICE 'POS-UPDATE: closes_workflow null=%, false=%, true=%. Contrato nullable restaurado com sucesso.', v_post_null_count, v_post_false_count, v_post_true_count;

END $$;
