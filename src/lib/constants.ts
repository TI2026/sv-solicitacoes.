// =============================================
// Status labels and state machines
// =============================================

export const ADMISSION_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_triagem: 'Aguardando Triagem',
  em_triagem: 'Em Triagem',
  aguardando_documentos: 'Aguardando Documentos',
  documentos_em_analise: 'Documentos em Análise',
  aguardando_exame: 'Aguardando Exame',
  exame_realizado: 'Exame Realizado',
  aguardando_registro: 'Aguardando Registro',
  registros_concluidos: 'Registros Concluídos',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const FUEL_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_aprovacao: 'Em Aprovação',
  retornado: 'Retornado',
  aprovado: 'Aprovado',
  aguardando_fotos: 'Aguardando Fotos',
  em_revisao_admin: 'Em Revisão Admin',
  reprovado: 'Reprovado',
  encerrado: 'Encerrado',
};

export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_triagem: 'Em Triagem',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  desistente: 'Desistente',
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  submitted: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export const EXAM_STATUS_LABELS: Record<string, string> = {
  aguardando: 'Aguardando',
  apto: 'Apto',
  apto_com_restricao: 'Apto com Restrição',
  inapto: 'Inapto',
};

export function getStatusVariant(status: string): 'pending' | 'approved' | 'rejected' | 'info' {
  if (['concluido', 'aprovado', 'encerrado', 'apto', 'approved', 'registros_concluidos'].includes(status)) return 'approved';
  if (['rejeitado', 'reprovado', 'cancelado', 'inapto', 'rejected'].includes(status)) return 'rejected';
  if (['aguardando_fotos', 'aguardando_documentos', 'submitted'].includes(status)) return 'info';
  return 'pending';
}
