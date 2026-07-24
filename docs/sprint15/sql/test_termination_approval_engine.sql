-- ============================================================
-- SPRINT 15 — TESTES SQL LOCAIS
-- Approval Engine + Desligamentos + Compras
-- Execute via: docker exec -i <container> psql -U postgres -d postgres -f -
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SETUP: schema temporário de teste
-- ────────────────────────────────────────────────────────────
BEGIN;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 1: termination_set_status — contrato de colunas
-- ────────────────────────────────────────────────────────────

-- 1.1 collaborators NÃO tem user_id (campo removido/nunca existiu)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'collaborators'
      AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'FAIL: collaborators.user_id existe — deve ser user_profile_id';
  ELSE
    RAISE NOTICE 'PASS: collaborators.user_id não existe (correto)';
  END IF;
END $$;

-- 1.2 collaborators TEM user_profile_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'collaborators'
      AND column_name = 'user_profile_id'
  ) THEN
    RAISE NOTICE 'PASS: collaborators.user_profile_id existe';
  ELSE
    RAISE EXCEPTION 'FAIL: collaborators.user_profile_id não existe';
  END IF;
END $$;

-- 1.3 termination_requests TEM status do tipo termination_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'termination_requests'
      AND column_name = 'status'
      AND udt_name = 'termination_status'
  ) THEN
    RAISE NOTICE 'PASS: termination_requests.status é do tipo termination_status';
  ELSE
    RAISE EXCEPTION 'FAIL: termination_requests.status não é do tipo termination_status';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 2: Funções existem e têm assinatura correta
-- ────────────────────────────────────────────────────────────

-- 2.1 termination_set_status existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'termination_set_status'
  ) THEN
    RAISE NOTICE 'PASS: termination_set_status existe';
  ELSE
    RAISE EXCEPTION 'FAIL: termination_set_status não existe';
  END IF;
END $$;

-- 2.2 start_approval_flow existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'start_approval_flow'
  ) THEN
    RAISE NOTICE 'PASS: start_approval_flow existe';
  ELSE
    RAISE EXCEPTION 'FAIL: start_approval_flow não existe';
  END IF;
END $$;

-- 2.3 process_approval_action existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'process_approval_action'
  ) THEN
    RAISE NOTICE 'PASS: process_approval_action existe';
  ELSE
    RAISE EXCEPTION 'FAIL: process_approval_action não existe';
  END IF;
END $$;

-- 2.4 RPCs de Compras existem
DO $$
DECLARE
  _rpcs text[] := ARRAY[
    'cancel_purchase_request',
    'advance_purchase_to_oc',
    'confirm_purchase_payment',
    'confirm_purchase_delivery',
    'confirm_purchase_receipt'
  ];
  _rpc text;
BEGIN
  FOREACH _rpc IN ARRAY _rpcs LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = _rpc
    ) THEN
      RAISE NOTICE 'PASS: % existe', _rpc;
    ELSE
      RAISE EXCEPTION 'FAIL: % não existe', _rpc;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 3: Enums definidos
-- ────────────────────────────────────────────────────────────

-- 3.1 termination_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'termination_type'
  ) THEN
    RAISE NOTICE 'PASS: enum termination_type existe';
  ELSE
    RAISE EXCEPTION 'FAIL: enum termination_type não existe';
  END IF;
END $$;

-- 3.2 termination_status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'termination_status'
  ) THEN
    RAISE NOTICE 'PASS: enum termination_status existe';
  ELSE
    RAISE EXCEPTION 'FAIL: enum termination_status não existe';
  END IF;
END $$;

-- 3.3 Valores do termination_status
DO $$
DECLARE
  _expected text[] := ARRAY[
    'rascunho','em_aprovacao','aprovado','reprovado','retornado',
    'desligamento_concluido','cancelado'
  ];
  _actual text[];
  _v text;
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO _actual
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'termination_status';

  FOREACH _v IN ARRAY _expected LOOP
    IF _v = ANY(_actual) THEN
      RAISE NOTICE 'PASS: termination_status tem valor "%"', _v;
    ELSE
      RAISE EXCEPTION 'FAIL: termination_status não tem valor "%"', _v;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 4: Approval engine — tabelas e colunas
-- ────────────────────────────────────────────────────────────

-- 4.1 approval_flow_steps tem approver_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_flow_steps'
      AND column_name = 'approver_type'
  ) THEN
    RAISE NOTICE 'PASS: approval_flow_steps.approver_type existe';
  ELSE
    RAISE EXCEPTION 'FAIL: approval_flow_steps.approver_type não existe';
  END IF;
END $$;

-- 4.2 approval_flow_steps tem fixed_sector_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_flow_steps'
      AND column_name = 'fixed_sector_id'
  ) THEN
    RAISE NOTICE 'PASS: approval_flow_steps.fixed_sector_id existe';
  ELSE
    RAISE EXCEPTION 'FAIL: approval_flow_steps.fixed_sector_id não existe';
  END IF;
END $$;

-- 4.3 approval_flow_steps tem approver_role_key
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_flow_steps'
      AND column_name = 'approver_role_key'
  ) THEN
    RAISE NOTICE 'PASS: approval_flow_steps.approver_role_key existe';
  ELSE
    RAISE EXCEPTION 'FAIL: approval_flow_steps.approver_role_key não existe';
  END IF;
END $$;

-- 4.4 approval_requests não referencia user_id inexistente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_requests'
      AND column_name = 'requester_user_id'
  ) THEN
    RAISE NOTICE 'PASS: approval_requests.requester_user_id existe';
  ELSE
    RAISE EXCEPTION 'FAIL: approval_requests.requester_user_id não existe';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 5: RLS habilitado nas tabelas críticas
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _tables text[] := ARRAY[
    'termination_requests',
    'purchases',
    'approval_requests',
    'collaborators',
    'profiles'
  ];
  _t text;
  _has_rls boolean;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    SELECT relrowsecurity INTO _has_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = _t;

    IF _has_rls THEN
      RAISE NOTICE 'PASS: RLS habilitado em public.%', _t;
    ELSE
      RAISE WARNING 'WARN: RLS NÃO habilitado em public.%', _t;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 6: Módulo desligamentos registrado
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.approval_modules WHERE code = 'desligamentos'
  ) THEN
    RAISE NOTICE 'PASS: módulo desligamentos registrado no approval engine';
  ELSE
    RAISE EXCEPTION 'FAIL: módulo desligamentos não registrado';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 7: Purchases tem colunas operacionais do sprint 15
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _cols text[] := ARRAY[
    'deleted_at', 'purchase_number', 'supplier', 'approved_value',
    'purchase_notes', 'delivery_address', 'delivery_date',
    'tracking_code', 'confirmed_at', 'confirmed_by'
  ];
  _c text;
BEGIN
  FOREACH _c IN ARRAY _cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'purchases'
        AND column_name = _c
    ) THEN
      RAISE NOTICE 'PASS: purchases.% existe', _c;
    ELSE
      RAISE EXCEPTION 'FAIL: purchases.% não existe', _c;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 8: termination_set_status usa user_profile_id
-- (via pg_get_functiondef)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'termination_set_status'
  ORDER BY p.oid DESC
  LIMIT 1;

  IF _def LIKE '%user_profile_id%' THEN
    RAISE NOTICE 'PASS: termination_set_status usa user_profile_id';
  ELSE
    RAISE EXCEPTION 'FAIL: termination_set_status NÃO usa user_profile_id — verificar migration 005';
  END IF;

  IF _def LIKE '%_collab.user_id%' THEN
    RAISE EXCEPTION 'FAIL: termination_set_status ainda referencia _collab.user_id (inexistente)';
  ELSE
    RAISE NOTICE 'PASS: termination_set_status não referencia _collab.user_id';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- VERIFICAÇÃO 9: SECURITY DEFINER nas funções críticas
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _funcs text[] := ARRAY[
    'termination_set_status',
    'start_approval_flow',
    'cancel_purchase_request',
    'advance_purchase_to_oc',
    'confirm_purchase_payment',
    'confirm_purchase_delivery',
    'confirm_purchase_receipt'
  ];
  _f text;
  _is_definer boolean;
BEGIN
  FOREACH _f IN ARRAY _funcs LOOP
    SELECT p.prosecdef INTO _is_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = _f
    ORDER BY p.oid DESC
    LIMIT 1;

    IF _is_definer THEN
      RAISE NOTICE 'PASS: % tem SECURITY DEFINER', _f;
    ELSE
      RAISE WARNING 'WARN: % NÃO tem SECURITY DEFINER', _f;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- RESUMO FINAL
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SPRINT 15 — TESTES SQL CONCLUÍDOS';
  RAISE NOTICE 'Se chegou até aqui sem EXCEPTION = todos os testes passaram';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;
