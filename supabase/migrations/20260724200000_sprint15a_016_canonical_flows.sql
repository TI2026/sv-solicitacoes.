-- ============================================================
-- SPRINT 15A: Migration 016 - Fluxos Fixos Canônicos
-- Inserir os 6 módulos e seus fluxos de aprovação com etapas fixas
-- conforme SPRINT15_FONTE_UNICA_VERDADE.md
-- ============================================================

-- ============================================================
-- 1. GARANTIR QUE TODOS OS 6 MÓDULOS EXISTEM
-- ============================================================

INSERT INTO public.approval_modules (id, code, name, active)
VALUES
  ('00000000-0001-0000-0000-000000000001', 'compras',        'Compras',       true),
  ('00000000-0001-0000-0000-000000000002', 'abastecimento',  'Abastecimento', true),
  ('00000000-0001-0000-0000-000000000003', 'diaria',         'Diária',        true),
  ('00000000-0001-0000-0000-000000000004', 'reembolso',      'Reembolso',     true),
  ('00000000-0001-0000-0000-000000000005', 'admissoes',      'Admissões',     true),
  ('00000000-0001-0000-0000-000000000006', 'desligamentos',  'Desligamentos', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, active = true;

-- ============================================================
-- 2. DESATIVAR TODOS OS FLUXOS EXISTENTES (preservar histórico)
-- ============================================================

UPDATE public.approval_flows
SET active = false
WHERE module_id IN (
  SELECT id FROM public.approval_modules
  WHERE code IN ('compras','abastecimento','diaria','reembolso','admissoes','desligamentos')
);

-- ============================================================
-- 3. CRIAR OS FLUXOS CANÔNICOS (um por módulo, IDs fixos)
-- ============================================================

-- 3.1 COMPRAS
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000001-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Compras v1',
  'sequential',
  true, true, true, true, 'previous_step'
FROM public.approval_modules am
WHERE am.code = 'compras'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- 3.2 ABASTECIMENTO
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000002-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Abastecimento v1',
  'sequential',
  true, true, true, true, 'requester'
FROM public.approval_modules am
WHERE am.code = 'abastecimento'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- 3.3 DIÁRIA
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000003-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Diária v1',
  'sequential',
  true, true, true, true, 'requester'
FROM public.approval_modules am
WHERE am.code = 'diaria'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- 3.4 REEMBOLSO
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000004-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Reembolso v1',
  'sequential',
  true, true, true, true, 'requester'
FROM public.approval_modules am
WHERE am.code = 'reembolso'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- 3.5 ADMISSÕES
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000005-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Admissões v1',
  'sequential',
  true, true, true, true, 'previous_step'
FROM public.approval_modules am
WHERE am.code = 'admissoes'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- 3.6 DESLIGAMENTOS
INSERT INTO public.approval_flows (
  id, module_id, name, approval_type, active,
  require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
)
SELECT
  'a0000006-0001-0000-0000-000000000001'::uuid,
  am.id,
  'Fluxo Canônico — Desligamentos v1',
  'sequential',
  true, true, true, true, 'previous_step'
FROM public.approval_modules am
WHERE am.code = 'desligamentos'
ON CONFLICT (id) DO UPDATE
  SET active = true, module_id = EXCLUDED.module_id, name = EXCLUDED.name;

-- ============================================================
-- 4. CRIAR AS ETAPAS FIXAS
-- approver_type = 'cargo_perfil' com role_key padrão
-- Admin configura o usuário concreto via tela administrativa
-- ============================================================

-- Limpar etapas dos fluxos canônicos para re-execução idempotente
DELETE FROM public.approval_flow_steps
WHERE flow_id IN (
  'a0000001-0001-0000-0000-000000000001'::uuid,
  'a0000002-0001-0000-0000-000000000001'::uuid,
  'a0000003-0001-0000-0000-000000000001'::uuid,
  'a0000004-0001-0000-0000-000000000001'::uuid,
  'a0000005-0001-0000-0000-000000000001'::uuid,
  'a0000006-0001-0000-0000-000000000001'::uuid
);

-- 4.1 COMPRAS — Etapa 1: Diretoria aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000001-0001-0000-0000-000000000001'::uuid,
  'a0000001-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'diretoria',
  NULL, NULL, true, true
);

-- 4.2 ABASTECIMENTO — Etapa 1: Diretoria/Supervisor aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000002-0001-0000-0000-000000000001'::uuid,
  'a0000002-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'diretoria',
  NULL, NULL, true, true
);

-- 4.3 DIÁRIA — Etapa 1: Diretoria aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000003-0001-0000-0000-000000000001'::uuid,
  'a0000003-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'diretoria',
  NULL, NULL, true, true
);

-- 4.4 REEMBOLSO — Etapa 1: Diretoria aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000004-0001-0000-0000-000000000001'::uuid,
  'a0000004-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'diretoria',
  NULL, NULL, true, true
);

-- 4.5 ADMISSÕES — Etapa 1: RH aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000005-0001-0000-0000-000000000001'::uuid,
  'a0000005-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'rh',
  NULL, NULL, true, true
);

-- 4.6 DESLIGAMENTOS — Etapa 1: Diretoria aprova
INSERT INTO public.approval_flow_steps (
  id, flow_id, step_order, approver_type, approver_role_key,
  approver_user_id, fixed_sector_id, is_required, active
) VALUES (
  'b0000006-0001-0000-0000-000000000001'::uuid,
  'a0000006-0001-0000-0000-000000000001'::uuid,
  1, 'cargo_perfil', 'diretoria',
  NULL, NULL, true, true
);

-- ============================================================
-- 5. CONSTRAINT: único fluxo ativo por módulo (trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_single_active_flow_per_module()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.approval_flows
      WHERE module_id = NEW.module_id
        AND active = true
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Já existe um fluxo ativo para este módulo (id: %). Desative o anterior primeiro.', NEW.module_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_flow ON public.approval_flows;
CREATE TRIGGER trg_single_active_flow
  BEFORE INSERT OR UPDATE ON public.approval_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.check_single_active_flow_per_module();

-- ============================================================
-- 6. CONSTRAINT: step_order único por flow
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_flow_step_order' AND conrelid = 'public.approval_flow_steps'::regclass
  ) THEN
    ALTER TABLE public.approval_flow_steps
      ADD CONSTRAINT uq_flow_step_order UNIQUE (flow_id, step_order);
  END IF;
END;
$$;

-- ============================================================
-- 7. AUDITORIA
-- ============================================================

INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'MIGRATION_016_CANONICAL_FLOWS',
  'approval_modules',
  '00000000-0000-0000-0000-000000000000',
  jsonb_build_object(
    'version', '016',
    'description', 'Sprint 15A: Criação dos fluxos canônicos para os 6 módulos',
    'modules', jsonb_build_array('compras','abastecimento','diaria','reembolso','admissoes','desligamentos'),
    'applied_at', now()
  )
) ON CONFLICT DO NOTHING;

