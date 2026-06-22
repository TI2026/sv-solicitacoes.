// =============================================
// RBAC Types
// =============================================
export type AppRole =
  | 'master'
  | 'diretoria'
  | 'supervisor'
  | 'administrativo'
  | 'financeiro'
  | 'compras'
  | 'rh'
  | 'colaborador';

export const ROLE_LABELS: Record<AppRole, string> = {
  master: 'Master',
  diretoria: 'Diretoria',
  supervisor: 'Supervisor',
  administrativo: 'Administrativo',
  financeiro: 'Financeiro',
  compras: 'Compras',
  rh: 'Recursos Humanos',
  colaborador: 'Colaborador',
};

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  master: 1000,
  diretoria: 100,
  supervisor: 70,
  administrativo: 50,
  financeiro: 45,
  compras: 45,
  rh: 40,
  colaborador: 10,
};

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  department: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithRoles extends Profile {
  roles: AppRole[];
}

// =============================================
// Fleet Module Types (Solicitações)
// =============================================
export type RequestType = 'FUEL' | 'REIMBURSEMENT' | 'ALLOWANCE';

export type RequestStatus =
  | 'PENDENTE_CONFERENCIA_INICIAL'
  | 'AGUARDANDO_APROVACAO_DIRETORIA'
  | 'AGUARDANDO_ANEXOS'
  | 'PENDENTE_CONFERENCIA_FINAL'
  | 'CONCLUIDO'
  | 'DEVOLVIDO'
  | 'REJEITADO';

export type AttachmentType = 'FOTO_PAINEL' | 'NOTA_FISCAL' | 'RECIBO' | 'OUTRO';

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  FUEL: 'Abastecimento',
  REIMBURSEMENT: 'Reembolso',
  ALLOWANCE: 'Diária',
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  PENDENTE_CONFERENCIA_INICIAL: 'Conferência Inicial',
  AGUARDANDO_APROVACAO_DIRETORIA: 'Aguardando Diretoria',
  AGUARDANDO_ANEXOS: 'Aguardando Anexos',
  PENDENTE_CONFERENCIA_FINAL: 'Conferência Final',
  CONCLUIDO: 'Concluído',
  DEVOLVIDO: 'Devolvido',
  REJEITADO: 'Rejeitado',
};

export const STATUS_VARIANT: Record<RequestStatus, string> = {
  PENDENTE_CONFERENCIA_INICIAL: 'pending',
  AGUARDANDO_APROVACAO_DIRETORIA: 'pending',
  AGUARDANDO_ANEXOS: 'info',
  PENDENTE_CONFERENCIA_FINAL: 'pending',
  CONCLUIDO: 'approved',
  DEVOLVIDO: 'pending',
  REJEITADO: 'rejected',
};

export const REIMBURSEMENT_CATEGORIES = ['Viagem', 'Alimentação', 'Hospedagem', 'Transporte', 'Outros'];
export const ALLOWANCE_CATEGORIES = ['Faxineira', 'Pedreiro', 'Ajudante', 'Pintor', 'Eletricista', 'Encanador', 'Outros'];
