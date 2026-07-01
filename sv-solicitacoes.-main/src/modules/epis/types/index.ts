// =============================================
// EPI Module Types
// =============================================

export interface EpiItem {
  id: string;
  code: string;
  name: string;
  category: string;
  manufacturer: string;
  ca_number: string;
  ca_valid_until: string | null;
  useful_life_days: number | null;
  size_required: boolean;
  unit: string;
  active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Collaborator {
  id: string;
  full_name: string;
  cpf: string | null;
  sector_id: string | null;
  role_name: string;
  worksite: string;
  status: string;
  admission_request_id: string | null;
  user_profile_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  sector?: { id: string; name: string } | null;
}

export interface EpiDelivery {
  id: string;
  collaborator_id: string;
  epi_item_id: string;
  quantity: number;
  size: string | null;
  delivered_by_user_id: string;
  delivered_at: string;
  sector_id: string | null;
  worksite: string;
  reason: string;
  current_status: string;
  notes: string;
  signature_employee_url: string | null;
  signature_responsible_url: string | null;
  document_url: string | null;
  created_at: string;
  updated_at: string;
  // joined
  collaborator?: Collaborator;
  epi_item?: EpiItem;
  delivered_by?: { id: string; full_name: string };
  sector?: { id: string; name: string } | null;
}

export interface EpiMovement {
  id: string;
  delivery_id: string;
  movement_type: string;
  moved_by_user_id: string;
  moved_at: string;
  condition: string;
  reason: string;
  notes: string;
  attachment_url: string | null;
  created_at: string;
  moved_by?: { id: string; full_name: string };
}

export interface EpiKitRule {
  id: string;
  sector_id: string | null;
  role_name: string;
  epi_item_id: string;
  quantity: number;
  required: boolean;
  active: boolean;
  created_at: string;
  epi_item?: EpiItem;
  sector?: { id: string; name: string } | null;
}

// Status constants
export const EPI_DELIVERY_STATUS_LABELS: Record<string, string> = {
  entregue: 'Entregue',
  em_uso: 'Em Uso',
  devolvido: 'Devolvido',
  substituido: 'Substituído',
  pendente_devolucao: 'Pend. Devolução',
  perdido: 'Perdido',
  baixado: 'Baixado',
};

export const EPI_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  delivery: 'Entrega',
  return: 'Devolução',
  replacement: 'Substituição',
  loss: 'Perda',
  disposal: 'Descarte',
  adjustment: 'Ajuste',
};

export const EPI_REASON_LABELS: Record<string, string> = {
  primeira_entrega: 'Primeira Entrega',
  troca: 'Troca',
  reposicao: 'Reposição',
  desgaste: 'Desgaste',
  perda: 'Perda',
  outro: 'Outro',
};

export const EPI_CATEGORIES = [
  'Proteção da Cabeça',
  'Proteção dos Olhos',
  'Proteção Auditiva',
  'Proteção Respiratória',
  'Proteção das Mãos',
  'Proteção dos Pés',
  'Proteção contra Quedas',
  'Proteção do Corpo',
  'UNIFORME',
  'EPI',
  'APOIO OPERACIONAL',
  'Outros',
];
