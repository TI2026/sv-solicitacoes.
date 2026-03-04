import type { UserWithRoles } from '@/types';

const ADMISSION_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['aguardando_triagem'],
  aguardando_triagem: ['em_triagem'],
  em_triagem: ['aguardando_documentos', 'cancelado', 'arquivado'],
  aguardando_documentos: ['documentos_em_analise', 'cancelado', 'arquivado'],
  documentos_em_analise: ['aguardando_exame', 'aguardando_documentos', 'cancelado', 'arquivado'],
  aguardando_exame: ['exame_realizado', 'cancelado', 'arquivado'],
  exame_realizado: ['aguardando_registro', 'cancelado', 'arquivado'],
  aguardando_registro: ['registros_concluidos', 'cancelado', 'arquivado'],
  registros_concluidos: ['concluido', 'cancelado', 'arquivado'],
  concluido: ['arquivado'],
  cancelado: ['arquivado'],
  arquivado: [],
};

const MANAGER_ROLES = ['diretoria', 'administrativo', 'rh'] as const;

export function canEditAdmission(user: UserWithRoles | null, item: { requester_user_id: string; status: string }): boolean {
  if (!user) return false;
  if (MANAGER_ROLES.some(r => user.roles.includes(r as any))) return true;
  return item.requester_user_id === user.id && item.status === 'rascunho';
}

export function canAdvanceAdmission(user: UserWithRoles | null, item: { status: string }): boolean {
  if (!user) return false;
  const targets = ADMISSION_TRANSITIONS[item.status] || [];
  if (targets.length === 0) return false;
  if (item.status === 'rascunho') return true;
  return MANAGER_ROLES.some(r => user.roles.includes(r as any));
}

export function canDeleteAdmission(user: UserWithRoles | null): boolean {
  if (!user) return false;
  return user.roles.includes('diretoria') || user.roles.includes('administrativo');
}

export function getNextStatus(status: string): string | null {
  const targets = ADMISSION_TRANSITIONS[status] || [];
  return targets.find(t => t !== 'cancelado' && t !== 'arquivado') || null;
}

export function getNextStatusLabel(status: string): string | null {
  const next = getNextStatus(status);
  if (!next) return null;
  const labels: Record<string, string> = {
    aguardando_triagem: 'Enviar para Triagem',
    em_triagem: 'Iniciar Triagem',
    aguardando_documentos: 'Avançar Candidatos',
    documentos_em_analise: 'Confirmar Docs WhatsApp',
    aguardando_exame: 'Agendar Exame',
    exame_realizado: 'Registrar Exame',
    aguardando_registro: 'Gerar Link Assinatura',
    registros_concluidos: 'Concluir Registros',
    concluido: 'Concluir Admissão',
  };
  return labels[next] || next;
}
