export function formatApprovalError(errorMessage: string): string {
  // [P1-11] Correção: tornar erro visível — IP-PLAN Onda 2
  if (!errorMessage) return 'Ocorreu um erro desconhecido ao processar a aprovação.';

  const lowerMsg = errorMessage.toLowerCase();

  if (lowerMsg.includes('sem permissão para iniciar fluxo em nome de outro usuário')) {
    return 'Você não tem permissão para enviar uma solicitação em nome de outro usuário.';
  }
  if (lowerMsg.includes('já existe um fluxo de aprovação ativo')) {
    return 'Já existe um fluxo de aprovação ativo para esta solicitação.';
  }
  if (lowerMsg.includes('módulo de aprovação não encontrado')) {
    return 'O módulo de aprovação não está configurado ou está inativo.';
  }
  if (lowerMsg.includes('nenhum fluxo de aprovação ativo')) {
    return 'Nenhum fluxo de aprovação está ativo no momento.';
  }
  if (lowerMsg.includes('fluxo sem aprovadores')) {
    return 'O fluxo de aprovação não possui aprovadores configurados.';
  }
  if (lowerMsg.includes('fluxo sem aprovador inicial resolvido')) {
    return 'Não foi possível encontrar um aprovador válido para a primeira etapa.';
  }
  if (lowerMsg.includes('gestor imediato ativo cadastrado')) {
    return 'Você não possui um gestor imediato cadastrado no sistema.';
  }
  if (lowerMsg.includes('setor do solicitante não possui responsável')) {
    return 'O seu setor não possui um responsável cadastrado.';
  }
  if (lowerMsg.includes('setor configurado para esta etapa não possui responsável')) {
    return 'O setor configurado nesta etapa não possui um responsável.';
  }

  return errorMessage;
}
