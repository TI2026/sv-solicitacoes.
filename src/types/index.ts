export type UserRole = 'COLABORADOR' | 'DIRETOR' | 'ADMINISTRATIVO' | 'ADMIN';

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

export type AuditAction = 'LOGIN' | 'LOGOUT' | 'CREATE_REQUEST' | 'UPDATE_STATUS' | 'ADD_ATTACHMENT' | 'REGISTER';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
}

export interface Request {
  id: string;
  type: RequestType;
  category: string;
  solicitanteId: string;
  veiculoPlaca?: string;
  kmAtual?: number;
  valor: number;
  status: RequestStatus;
  dataSolicitacao: string;
  descricao?: string;
}

export interface Attachment {
  id: string;
  solicitacaoId: string;
  tipoDocumento: AttachmentType;
  url: string;
  fileName: string;
  dataUpload: string;
}

export interface StatusHistory {
  id: string;
  solicitacaoId: string;
  statusAnterior: RequestStatus | null;
  statusNovo: RequestStatus;
  data: string;
  usuarioResponsavel: string;
  comentario?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

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

export const ROLE_LABELS: Record<UserRole, string> = {
  COLABORADOR: 'Colaborador',
  DIRETOR: 'Diretor',
  ADMINISTRATIVO: 'Administrativo',
  ADMIN: 'Administrador',
};

export const REIMBURSEMENT_CATEGORIES = ['Viagem', 'Alimentação', 'Hospedagem', 'Transporte', 'Outros'];
export const ALLOWANCE_CATEGORIES = ['Faxineira', 'Pedreiro', 'Ajudante', 'Pintor', 'Eletricista', 'Encanador', 'Outros'];
