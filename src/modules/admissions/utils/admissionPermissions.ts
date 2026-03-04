import type { UserWithRoles } from '@/types';

const ADMISSION_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['aguardando_triagem'],
  aguardando_triagem: ['em_triagem'],
  em_triagem: ['aguardando_documentos', 'cancelado'],
  aguardando_documentos: ['documentos_em_analise'],
  documentos_em_analise: ['aguardando_documentos', 'aguardando_exame', 'cancelado'],
  aguardando_exame: ['exame_realizado'],
  exame_realizado: ['aguardando_registro', 'cancelado'],
  aguardando_registro: ['registros_concluidos'],
  registros_concluidos: ['concluido'],
  concluido: [],
  cancelado: [],
};

const MANAGER_ROLES = ['diretoria', 'administrativo', 'rh'] as const;

export function canEditAdmission(user: UserWithRoles | null, item: { requester_user_id: string; status: string }): boolean {
  if (!user) return false;
  if (MANAGER_ROLES.some(r => user.roles.includes(r as any))) return true;
  // requester can edit own drafts
  return item.requester_user_id === user.id && item.status === 'rascunho';
}

export function canAdvanceAdmission(user: UserWithRoles | null, item: { status: string }): boolean {
  if (!user) return false;
  const targets = ADMISSION_TRANSITIONS[item.status] || [];
  if (targets.length === 0) return false;
  // rascunho -> aguardando_triagem: requester can do this
  if (item.status === 'rascunho') return true;
  return MANAGER_ROLES.some(r => user.roles.includes(r as any));
}

export function getNextStatus(status: string): string | null {
  const targets = ADMISSION_TRANSITIONS[status] || [];
  // Return first non-cancelado target
  return targets.find(t => t !== 'cancelado') || null;
}

export function getNextStatusLabel(status: string): string | null {
  const next = getNextStatus(status);
  if (!next) return null;
  const labels: Record<string, string> = {
    aguardando_triagem: 'Enviar para Triagem',
    em_triagem: 'Iniciar Triagem',
    aguardando_documentos: 'Solicitar Documentos',
    documentos_em_analise: 'Analisar Documentos',
    aguardando_exame: 'Agendar Exame',
    exame_realizado: 'Registrar Exame',
    aguardando_registro: 'Iniciar Registros',
    registros_concluidos: 'Concluir Registros',
    concluido: 'Concluir Admissão',
  };
  return labels[next] || next;
}
