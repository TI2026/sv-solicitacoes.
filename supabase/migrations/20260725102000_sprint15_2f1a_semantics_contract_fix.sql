-- Migration: Sprint 15.2F1A-R1 - Correção Incremental do Schema Semântico
-- Descrição: Ajusta tipos, defaults e adiciona as constraints definitivas.

ALTER TABLE public.approval_flow_steps
  ALTER COLUMN closes_workflow DROP DEFAULT,
  ALTER COLUMN next_step_activation DROP DEFAULT,
  ALTER COLUMN next_step_activation TYPE text USING NULL;

DO $$
BEGIN
  -- step_kind
  ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_step_kind;
  ALTER TABLE public.approval_flow_steps 
    ADD CONSTRAINT chk_step_kind CHECK (step_kind IS NULL OR step_kind IN ('approval', 'review', 'verification', 'payment', 'hr_processing'));

  -- completion_action
  ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_completion_action;
  ALTER TABLE public.approval_flow_steps 
    ADD CONSTRAINT chk_completion_action CHECK (completion_action IS NULL OR completion_action IN ('aprovar', 'concluir_revisao', 'confirmar_horas', 'pagar', 'concluir_triagem', 'concluir_processamento_rh'));

  -- next_step_activation
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_next_step_activation') THEN
    ALTER TABLE public.approval_flow_steps 
      ADD CONSTRAINT chk_next_step_activation CHECK (next_step_activation IS NULL OR next_step_activation IN ('enviar_comprovantes'));
  END IF;

  -- approval_request_status_after
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_approval_request_status_after') THEN
    ALTER TABLE public.approval_flow_steps 
      ADD CONSTRAINT chk_approval_request_status_after CHECK (approval_request_status_after IS NULL OR approval_request_status_after IN ('awaiting_step', 'waiting_operational', 'completed'));
  END IF;
END $$;
