export interface AdmissionListItem {
  id: string;
  cargo: string;
  candidato_nome: string;
  candidato_id: string | null;
  obra_local: string;
  centro_custo: string;
  status: string;
  prioridade: string;
  solicitante: string;
  inicio_previsto: string | null;
  documentos_status: 'completo' | 'parcial' | 'pendente' | 'sem_candidato';
  criado_em: string;
  criado_por: string;
  salario_previsto: number | null;
  total_candidatos: number;
  requester_user_id: string;
  welcome_pdf_generated_at: string | null;
}

/**
 * Maps the raw row from vw_admissions_list_items (or admission_requests + profiles)
 * to the shape expected by AdmissionProcessCard.
 */
export function mapAdmissionListItem(raw: any): AdmissionListItem {
  return {
    id: raw.id,
    cargo: raw.cargo_funcao || 'Cargo não definido',
    candidato_nome: raw.candidato_nome || '(Sem candidato)',
    candidato_id: raw.candidato_id || null,
    obra_local: raw.local_contratacao || '—',
    centro_custo: raw.centro_custo || '—',
    status: raw.status || 'rascunho',
    prioridade: raw.priority || 'media',
    solicitante: raw.solicitante_nome || raw.profiles?.full_name || '—',
    inicio_previsto: raw.data_prevista_inicio || null,
    documentos_status: raw.documentos_status || 'sem_candidato',
    criado_em: raw.created_at,
    criado_por: raw.solicitante_nome || raw.profiles?.full_name || '—',
    salario_previsto: raw.salario_previsto ? Number(raw.salario_previsto) : null,
    total_candidatos: raw.total_candidatos ?? 0,
    requester_user_id: raw.requester_user_id,
    welcome_pdf_generated_at: raw.welcome_pdf_generated_at || null,
  };
}
