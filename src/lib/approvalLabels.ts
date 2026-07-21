export const APPROVER_TYPE_LABELS: Record<string, string> = {
  specific_user: 'Usuário Específico',
  sector: 'Aprovação por Setor',
};

export const APPROVER_TYPE_HELPERS: Record<string, string> = {
  specific_user: 'A solicitação será enviada exatamente para este usuário.',
  sector: 'A solicitação será enviada para o responsável do setor selecionado. Caso não haja responsável ou ele estoure o timeout, a solicitação passará automaticamente para o substituto do mesmo setor.',
};

/**
 * Normaliza o valor bruto de `approval_flow_steps.approver_type` (schema real)
 * para as duas categorias exibidas na UI (`specific_user` | `sector`).
 * O schema atual aceita: usuario_fixo, gestor_imediato,
 * responsavel_do_setor_do_solicitante, responsavel_do_setor_especifico,
 * cargo_perfil. Como a UI de Fluxos hoje só oferece 2 opções, mapeamos
 * qualquer variante baseada em setor para `sector` e o restante para
 * `specific_user`.
 */
export function getDisplayApproverType(raw: string): 'specific_user' | 'sector' {
  if (
    raw === 'sector' ||
    raw === 'responsavel_do_setor_especifico' ||
    raw === 'responsavel_do_setor_do_solicitante'
  ) {
    return 'sector';
  }
  return 'specific_user';
}

/** Converte a categoria da UI para o valor aceito pelo backend/RPC. */
export function toBackendApproverType(ui: 'specific_user' | 'sector'): string {
  return ui === 'sector' ? 'responsavel_do_setor_especifico' : 'usuario_fixo';
}

export function getApproverTypeLabel(raw: string | undefined): string {
  if (!raw) return APPROVER_TYPE_LABELS.specific_user;
  const display = getDisplayApproverType(raw);
  return APPROVER_TYPE_LABELS[display] || raw;
}
