/** Centralized labels for approval system (Block 6.6) */

export const APPROVER_TYPE_LABELS: Record<string, string> = {
  usuario_fixo: 'Usuário fixo',
  responsavel_do_setor_do_solicitante: 'Responsável do setor do solicitante',
  responsavel_do_setor_especifico: 'Responsável do setor específico',
  gestor_imediato: 'Gestor imediato',
  cargo_perfil: 'Cargo / Perfil aprovador',
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
  // Legacy support: any leftover "cargo_perfil:<role>" string still renders as Cargo/Perfil.
  const normalized = type.startsWith('cargo_perfil') ? 'cargo_perfil' : type;
  return APPROVER_TYPE_LABELS[normalized] || type;
}

export function getStepStatusLabel(status: string): string {
  return APPROVAL_STEP_STATUS_LABELS[status] || status;
}
