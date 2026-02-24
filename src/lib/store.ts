import { User, Request, Attachment, StatusHistory, AuditLog, Notification, AuditAction, RequestStatus } from '@/types';

const generateId = () => Math.random().toString(36).substring(2, 11);

function getStore<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function setStore<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Initialize default admin user if no users exist
export function initializeStore() {
  const users = getStore<User>('gc_users');
  if (users.length === 0) {
    const defaultUsers: User[] = [
      { id: 'admin1', name: 'Admin Sistema', email: 'admin@gestcorp.com', password: 'admin123', role: 'ADMIN', department: 'TI' },
      { id: 'adm1', name: 'Maria Santos', email: 'maria@gestcorp.com', password: '123456', role: 'ADMINISTRATIVO', department: 'Financeiro' },
      { id: 'dir1', name: 'Carlos Oliveira', email: 'carlos@gestcorp.com', password: '123456', role: 'DIRETOR', department: 'Operações' },
      { id: 'col1', name: 'João Silva', email: 'joao@gestcorp.com', password: '123456', role: 'COLABORADOR', department: 'Operações' },
      { id: 'col2', name: 'Ana Costa', email: 'ana@gestcorp.com', password: '123456', role: 'COLABORADOR', department: 'Manutenção' },
    ];
    setStore('gc_users', defaultUsers);

    // Seed some requests
    const now = new Date();
    const seedRequests: Request[] = [
      { id: 'req1', type: 'FUEL', category: 'Abastecimento', solicitanteId: 'col1', veiculoPlaca: 'ABC-1234', kmAtual: 45230, valor: 250.00, status: 'PENDENTE_CONFERENCIA_INICIAL', dataSolicitacao: new Date(now.getTime() - 86400000 * 2).toISOString() },
      { id: 'req2', type: 'REIMBURSEMENT', category: 'Viagem', solicitanteId: 'col1', valor: 1500.00, status: 'AGUARDANDO_APROVACAO_DIRETORIA', dataSolicitacao: new Date(now.getTime() - 86400000 * 5).toISOString(), descricao: 'Viagem a São Paulo para reunião com cliente' },
      { id: 'req3', type: 'ALLOWANCE', category: 'Pedreiro', solicitanteId: 'col2', valor: 300.00, status: 'AGUARDANDO_ANEXOS', dataSolicitacao: new Date(now.getTime() - 86400000 * 3).toISOString(), descricao: 'Reforma do escritório filial' },
      { id: 'req4', type: 'FUEL', category: 'Abastecimento', solicitanteId: 'col2', veiculoPlaca: 'XYZ-5678', kmAtual: 78900, valor: 180.50, status: 'CONCLUIDO', dataSolicitacao: new Date(now.getTime() - 86400000 * 10).toISOString() },
      { id: 'req5', type: 'REIMBURSEMENT', category: 'Alimentação', solicitanteId: 'col1', valor: 85.90, status: 'REJEITADO', dataSolicitacao: new Date(now.getTime() - 86400000 * 7).toISOString(), descricao: 'Almoço com fornecedor' },
    ];
    setStore('gc_requests', seedRequests);

    const seedHistory: StatusHistory[] = [
      { id: 'sh1', solicitacaoId: 'req1', statusAnterior: null, statusNovo: 'PENDENTE_CONFERENCIA_INICIAL', data: seedRequests[0].dataSolicitacao, usuarioResponsavel: 'col1', comentario: 'Solicitação criada' },
      { id: 'sh2', solicitacaoId: 'req2', statusAnterior: null, statusNovo: 'PENDENTE_CONFERENCIA_INICIAL', data: seedRequests[1].dataSolicitacao, usuarioResponsavel: 'col1' },
      { id: 'sh3', solicitacaoId: 'req2', statusAnterior: 'PENDENTE_CONFERENCIA_INICIAL', statusNovo: 'AGUARDANDO_APROVACAO_DIRETORIA', data: new Date(now.getTime() - 86400000 * 4).toISOString(), usuarioResponsavel: 'adm1', comentario: 'Conferência inicial aprovada' },
    ];
    setStore('gc_status_history', seedHistory);
  }
}

// Users
export function getUsers(): User[] { return getStore('gc_users'); }
export function getUserById(id: string): User | undefined { return getUsers().find(u => u.id === id); }
export function getUserByEmail(email: string): User | undefined { return getUsers().find(u => u.email === email); }
export function createUser(user: Omit<User, 'id'>): User {
  const newUser = { ...user, id: generateId() };
  setStore('gc_users', [...getUsers(), newUser]);
  addAuditLog(newUser.id, 'REGISTER', 'user', newUser.id, `Novo usuário registrado: ${newUser.name}`);
  return newUser;
}

// Requests
export function getRequests(): Request[] { return getStore('gc_requests'); }
export function getRequestById(id: string): Request | undefined { return getRequests().find(r => r.id === id); }
export function getRequestsByUser(userId: string): Request[] { return getRequests().filter(r => r.solicitanteId === userId); }
export function createRequest(req: Omit<Request, 'id' | 'dataSolicitacao' | 'status'>): Request {
  const newReq: Request = { ...req, id: generateId(), dataSolicitacao: new Date().toISOString(), status: 'PENDENTE_CONFERENCIA_INICIAL' };
  setStore('gc_requests', [...getRequests(), newReq]);
  addStatusHistory(newReq.id, null, 'PENDENTE_CONFERENCIA_INICIAL', req.solicitanteId, 'Solicitação criada');
  addAuditLog(req.solicitanteId, 'CREATE_REQUEST', 'request', newReq.id, `Nova solicitação criada: ${newReq.type}`);
  addNotification(req.solicitanteId, `Sua solicitação foi criada com sucesso.`);
  return newReq;
}
export function updateRequestStatus(reqId: string, newStatus: RequestStatus, userId: string, comentario?: string) {
  const requests = getRequests();
  const idx = requests.findIndex(r => r.id === reqId);
  if (idx === -1) return;
  const oldStatus = requests[idx].status;
  requests[idx].status = newStatus;
  setStore('gc_requests', requests);
  addStatusHistory(reqId, oldStatus, newStatus, userId, comentario);
  addAuditLog(userId, 'UPDATE_STATUS', 'request', reqId, `Status alterado: ${oldStatus} → ${newStatus}`);
  // Notify solicitante
  const req = requests[idx];
  addNotification(req.solicitanteId, `Sua solicitação teve o status atualizado para: ${newStatus}`);
}

// Attachments
export function getAttachments(reqId: string): Attachment[] { return getStore<Attachment>('gc_attachments').filter(a => a.solicitacaoId === reqId); }
export function addAttachment(att: Omit<Attachment, 'id' | 'dataUpload'>): Attachment {
  const newAtt: Attachment = { ...att, id: generateId(), dataUpload: new Date().toISOString() };
  setStore('gc_attachments', [...getStore<Attachment>('gc_attachments'), newAtt]);
  addAuditLog(att.solicitacaoId, 'ADD_ATTACHMENT', 'attachment', newAtt.id, `Anexo adicionado: ${att.fileName}`);
  return newAtt;
}

// Status History
export function getStatusHistory(reqId: string): StatusHistory[] {
  return getStore<StatusHistory>('gc_status_history').filter(h => h.solicitacaoId === reqId).sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
}
function addStatusHistory(reqId: string, oldStatus: RequestStatus | null, newStatus: RequestStatus, userId: string, comentario?: string) {
  const entry: StatusHistory = { id: generateId(), solicitacaoId: reqId, statusAnterior: oldStatus, statusNovo: newStatus, data: new Date().toISOString(), usuarioResponsavel: userId, comentario };
  setStore('gc_status_history', [...getStore<StatusHistory>('gc_status_history'), entry]);
}

// Audit Logs
export function getAuditLogs(): AuditLog[] { return getStore<AuditLog>('gc_audit_logs').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); }
function addAuditLog(userId: string, action: AuditAction, entityType: string, entityId: string, details: string) {
  const log: AuditLog = { id: generateId(), userId, action, entityType, entityId, details, timestamp: new Date().toISOString() };
  setStore('gc_audit_logs', [...getStore<AuditLog>('gc_audit_logs'), log]);
}
export { addAuditLog };

// Notifications
export function getNotifications(userId: string): Notification[] {
  return getStore<Notification>('gc_notifications').filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export function getUnreadCount(userId: string): number {
  return getNotifications(userId).filter(n => !n.read).length;
}
export function markNotificationsRead(userId: string) {
  const all = getStore<Notification>('gc_notifications');
  const updated = all.map(n => n.userId === userId ? { ...n, read: true } : n);
  setStore('gc_notifications', updated);
}
function addNotification(userId: string, message: string) {
  const notif: Notification = { id: generateId(), userId, message, read: false, createdAt: new Date().toISOString() };
  setStore('gc_notifications', [...getStore<Notification>('gc_notifications'), notif]);
}
