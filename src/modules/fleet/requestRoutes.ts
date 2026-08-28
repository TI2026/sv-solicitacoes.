export type FleetBusinessModule = 'abastecimento' | 'diaria' | 'reembolso';

export function isFleetBusinessModule(type: string | null | undefined): type is FleetBusinessModule {
  return type === 'abastecimento' || type === 'diaria' || type === 'reembolso';
}

export function requestListRoute(type: string): string {
  if (type === 'abastecimento') return '/abastecimento';
  if (type === 'diaria') return '/diarias';
  if (type === 'reembolso') return '/reembolsos';
  throw new Error(`FLEET_REQUEST_TYPE_INVALID:${type}`);
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
    abastecimento: '/abastecimento',
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
