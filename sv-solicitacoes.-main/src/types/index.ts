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


