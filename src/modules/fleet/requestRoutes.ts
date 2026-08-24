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
