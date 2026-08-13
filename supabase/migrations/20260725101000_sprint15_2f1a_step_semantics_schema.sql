-- Migration: Sprint 15.2F1A - Schema Semântico de Etapas do Workflow
-- Descrição: Adiciona colunas para definir a semântica e consequências da aprovação em cada etapa.
-- Todas as colunas são NULLABLE para permitir retrocompatibilidade temporária.

ALTER TABLE public.approval_flow_steps
  ADD COLUMN IF NOT EXISTS step_kind text,
  ADD COLUMN IF NOT EXISTS completion_action text,
  ADD COLUMN IF NOT EXISTS entity_status_on_entry text,
  ADD COLUMN IF NOT EXISTS entity_status_on_success text,
  ADD COLUMN IF NOT EXISTS return_entity_status text,
  ADD COLUMN IF NOT EXISTS rejection_entity_status text,
  ADD COLUMN IF NOT EXISTS next_step_activation boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_request_status_after text,
  ADD COLUMN IF NOT EXISTS closes_workflow boolean DEFAULT false;

COMMENT ON COLUMN public.approval_flow_steps.step_kind IS 'Natureza da etapa: aprovação, revisão, operacional, contabilidade, pagamento';
COMMENT ON COLUMN public.approval_flow_steps.completion_action IS 'Ação de conclusão da etapa: aprovar, concluir_revisao, pagar, preencher_dados, verificar';
COMMENT ON COLUMN public.approval_flow_steps.entity_status_on_entry IS 'Status que a entidade recebe ao entrar na etapa';
COMMENT ON COLUMN public.approval_flow_steps.entity_status_on_success IS 'Status que a entidade recebe se for a última etapa ou se a próxima não ativar';
COMMENT ON COLUMN public.approval_flow_steps.return_entity_status IS 'Status da entidade caso a etapa seja devolvida';
COMMENT ON COLUMN public.approval_flow_steps.rejection_entity_status IS 'Status da entidade caso a etapa seja rejeitada';
COMMENT ON COLUMN public.approval_flow_steps.next_step_activation IS 'Se true, a aprovação ativa a próxima etapa. Se false, o motor pausa (espera ação externa)';
COMMENT ON COLUMN public.approval_flow_steps.approval_request_status_after IS 'Status do approval_request (ex: waiting_operational) após conclusão desta etapa (se não for terminal e não ativar próxima)';
COMMENT ON COLUMN public.approval_flow_steps.closes_workflow IS 'Se true, a aprovação nesta etapa encerra o ciclo completo de workflow';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_step_kind'
  ) THEN
    ALTER TABLE public.approval_flow_steps
      ADD CONSTRAINT chk_step_kind CHECK (step_kind IN ('aprovação', 'revisão', 'operacional', 'contabilidade', 'pagamento'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_completion_action'
  ) THEN
    ALTER TABLE public.approval_flow_steps
      ADD CONSTRAINT chk_completion_action CHECK (completion_action IN ('aprovar', 'concluir_revisao', 'pagar', 'preencher_dados', 'verificar'));
  END IF;
END $$;
