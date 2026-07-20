export const APPROVER_TYPE_LABELS: Record<string, string> = {
  specific_user: 'Usuário Específico',
  sector: 'Aprovação por Setor',
};

export const APPROVER_TYPE_HELPERS: Record<string, string> = {
  specific_user: 'A solicitação será enviada exatamente para este usuário.',
  sector: 'A solicitação será enviada para o responsável do setor selecionado. Caso não haja responsável ou ele estoure o timeout, a solicitação passará automaticamente para o substituto do mesmo setor.',
};

export function getDisplayApproverType(raw: string): string {
  return raw;
}

export function getApproverTypeLabel(raw: string | undefined): string {
  if (!raw) return APPROVER_TYPE_LABELS.specific_user;
  const display = getDisplayApproverType(raw);
  return APPROVER_TYPE_LABELS[display] || raw;
}
