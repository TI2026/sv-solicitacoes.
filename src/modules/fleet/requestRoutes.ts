export type FleetBusinessModule = 'abastecimento' | 'diaria' | 'reembolso';

export function requestListRoute(type: string): string {
  if (type === 'diaria') return '/diarias';
  if (type === 'reembolso') return '/reembolsos';
  return '/fleet';
}

export function requestNewRoute(type: string): string {
  return `${requestListRoute(type)}/new`;
}

export function requestDetailRoute(type: string, id: string): string {
  return `${requestListRoute(type)}/${id}`;
}

/** Rota canônica dos seis módulos empresariais do Motor V2. */
export function approvalModuleDetailRoute(moduleCode: string, id: string): string | null {
  const routes: Record<string, string> = {
    compras: '/purchases',
    purchases: '/purchases',
    abastecimento: '/fleet',
    diaria: '/diarias',
    reembolso: '/reembolsos',
    admissoes: '/admissions',
    admissions: '/admissions',
    desligamentos: '/desligamentos',
    terminations: '/desligamentos',
  };
  const base = routes[moduleCode];
  return base ? `${base}/${id}` : null;
}
