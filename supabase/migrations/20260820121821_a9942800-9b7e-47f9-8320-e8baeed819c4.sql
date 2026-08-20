ALTER TABLE public.approval_flows
ADD COLUMN IF NOT EXISTS version text DEFAULT 'v1';

ALTER TABLE public.approval_flow_steps
ADD COLUMN IF NOT EXISTS step_code text,
ADD COLUMN IF NOT EXISTS step_name text,
ADD COLUMN IF NOT EXISTS purpose text,
ADD COLUMN IF NOT EXISTS default_sla_hours integer DEFAULT 48,
ADD COLUMN IF NOT EXISTS substitute_user_id uuid;

ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS uq_flow_step_code;
ALTER TABLE public.approval_flow_steps ADD CONSTRAINT uq_flow_step_code UNIQUE (flow_id, step_code);

INSERT INTO public.approval_modules (id, code, name, active)
VALUES
  ('00000000-0001-0000-0000-000000000001', 'compras', 'Compras', true),
  ('00000000-0001-0000-0000-000000000002', 'abastecimento', 'Abastecimento', true),
  ('00000000-0001-0000-0000-000000000003', 'diaria', 'Diária', true),
  ('00000000-0001-0000-0000-000000000004', 'reembolso', 'Reembolso', true),
  ('00000000-0001-0000-0000-000000000005', 'admissoes', 'Admissões', true),
  ('00000000-0001-0000-0000-000000000006', 'desligamentos', 'Desligamentos', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = true;

UPDATE public.approval_flows SET active = false
WHERE module_id IN (
  SELECT id FROM public.approval_modules
  WHERE code IN ('compras','abastecimento','diaria','reembolso','admissoes','desligamentos')
);

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000001-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Compras v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'compras'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000002-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Abastecimento v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'abastecimento'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000003-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Diária v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'diaria'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000004-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Reembolso v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'reembolso'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000005-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Admissões v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'admissoes'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

INSERT INTO public.approval_flows (id, module_id, name, approval_type, active, version)
SELECT 'a0000006-0001-0000-0000-000000000001'::uuid, id, 'Fluxo Desligamentos v1', 'sequential', true, 'v1' FROM public.approval_modules WHERE code = 'desligamentos'
ON CONFLICT (id) DO UPDATE SET active = true, version = 'v1';

DELETE FROM public.approval_flow_steps
WHERE flow_id IN (
  'a0000001-0001-0000-0000-000000000001'::uuid,
  'a0000002-0001-0000-0000-000000000001'::uuid,
  'a0000003-0001-0000-0000-000000000001'::uuid,
  'a0000004-0001-0000-0000-000000000001'::uuid,
  'a0000005-0001-0000-0000-000000000001'::uuid,
  'a0000006-0001-0000-0000-000000000001'::uuid
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000001-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_gestor', 'Aprovação do Gestor', 'Validação da necessidade da compra',
  'gestor_imediato', null, 48, true
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000002-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_supervisor', 'Aprovação da Solicitação', 'Autorizar o abastecimento',
  'gestor_imediato', null, 24, true
), (
  'a0000002-0001-0000-0000-000000000001'::uuid, 2, 'revisao_adm', 'Revisão Administrativa', 'Conferência de documentos e KM',
  'cargo_perfil', 'administrativo', 48, true
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000003-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_gestor', 'Aprovação da Diária', 'Autorizar agendamento da diária',
  'gestor_imediato', null, 24, true
), (
  'a0000003-0001-0000-0000-000000000001'::uuid, 2, 'verificacao_horas', 'Verificação de Horas', 'Confirmar execução da diária',
  'cargo_perfil', 'supervisor', 24, true
), (
  'a0000003-0001-0000-0000-000000000001'::uuid, 3, 'confirmacao_pagamento', 'Pagamento Financeiro', 'Realizar pagamento da diária',
  'cargo_perfil', 'financeiro', 48, true
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000004-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_gestor', 'Aprovação de Reembolso', 'Autorizar mérito do reembolso',
  'gestor_imediato', null, 24, true
), (
  'a0000004-0001-0000-0000-000000000001'::uuid, 2, 'revisao_financeira', 'Revisão Financeira', 'Validar NFs e realizar pagamento',
  'cargo_perfil', 'financeiro', 48, true
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000005-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_vaga', 'Aprovação da Vaga', 'Autorizar abertura do processo',
  'cargo_perfil', 'diretoria', 48, true
), (
  'a0000005-0001-0000-0000-000000000001'::uuid, 2, 'triagem', 'Triagem de Candidato', 'Seleção inicial pelo RH',
  'cargo_perfil', 'rh', 72, true
);

INSERT INTO public.approval_flow_steps (
  flow_id, step_order, step_code, step_name, purpose,
  approver_type, approver_role_key, default_sla_hours, is_required
) VALUES (
  'a0000006-0001-0000-0000-000000000001'::uuid, 1, 'aprovacao_desligamento', 'Aprovação de Desligamento', 'Autorizar demissão',
  'cargo_perfil', 'diretoria', 48, true
), (
  'a0000006-0001-0000-0000-000000000001'::uuid, 2, 'processamento_rh', 'Processamento RH', 'Executar rotinas de desligamento',
  'cargo_perfil', 'rh', 72, true
);

CREATE OR REPLACE FUNCTION public.check_single_active_flow_per_module()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active = true THEN
    IF EXISTS (
      SELECT 1 FROM public.approval_flows
      WHERE module_id = NEW.module_id AND active = true AND id <> NEW.id
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

-- Semântica de etapas (nullable, sem efeito de comportamento ainda)
ALTER TABLE public.approval_flow_steps
  ADD COLUMN IF NOT EXISTS step_kind text,
  ADD COLUMN IF NOT EXISTS completion_action text,
  ADD COLUMN IF NOT EXISTS entity_status_on_entry text,
  ADD COLUMN IF NOT EXISTS entity_status_on_success text,
  ADD COLUMN IF NOT EXISTS return_entity_status text,
  ADD COLUMN IF NOT EXISTS rejection_entity_status text,
  ADD COLUMN IF NOT EXISTS next_step_activation text,
  ADD COLUMN IF NOT EXISTS approval_request_status_after text,
  ADD COLUMN IF NOT EXISTS closes_workflow boolean;

DO $$
BEGIN
  ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_step_kind;
  ALTER TABLE public.approval_flow_steps
    ADD CONSTRAINT chk_step_kind CHECK (step_kind IS NULL OR step_kind IN ('approval', 'review', 'verification', 'payment', 'hr_processing'));

  ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_completion_action;
  ALTER TABLE public.approval_flow_steps
    ADD CONSTRAINT chk_completion_action CHECK (completion_action IS NULL OR completion_action IN ('aprovar', 'concluir_revisao', 'confirmar_horas', 'pagar', 'concluir_triagem', 'concluir_processamento_rh'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_next_step_activation') THEN
    ALTER TABLE public.approval_flow_steps
      ADD CONSTRAINT chk_next_step_activation CHECK (next_step_activation IS NULL OR next_step_activation IN ('enviar_comprovantes'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_approval_request_status_after') THEN
    ALTER TABLE public.approval_flow_steps
      ADD CONSTRAINT chk_approval_request_status_after CHECK (approval_request_status_after IS NULL OR approval_request_status_after IN ('awaiting_step', 'waiting_operational', 'completed'));
  END IF;
END $$;