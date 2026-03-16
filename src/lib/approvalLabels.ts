/** Centralized labels for approval system (Block 6.6) */

export const APPROVER_TYPE_LABELS: Record<string, string> = {
  usuario_fixo: 'Usuário fixo',
  diretor_do_setor_do_solicitante: 'Diretor do setor do solicitante',
  diretor_do_setor_do_colaborador_relacionado: 'Diretor do setor do colaborador relacionado',
  responsavel_do_setor_especifico: 'Responsável do setor específico',
  gestor_imediato: 'Gestor imediato',
};

export const APPROVAL_STEP_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
  returned: 'Devolvido',
};

export const APPROVAL_REQUEST_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending_approval: 'Pendente de aprovação',
  awaiting_step_1: 'Aguardando etapa 1',
  awaiting_step_2: 'Aguardando etapa 2',
  awaiting_step_3: 'Aguardando etapa 3',
  approved: 'Aprovado',
  rejected: 'Recusado',
  returned_for_adjustment: 'Devolvido para ajuste',
};

export function getApproverTypeLabel(type: string | null | undefined): string {
  if (!type) return APPROVER_TYPE_LABELS.usuario_fixo;
  return APPROVER_TYPE_LABELS[type] || type;
}

export function getStepStatusLabel(status: string): string {
  return APPROVAL_STEP_STATUS_LABELS[status] || status;
}
