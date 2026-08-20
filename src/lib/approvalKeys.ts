/**
 * approvalKeys.ts — Sprint Final 1
 *
 * Fonte única das query keys do Motor de Aprovação V2.
 * Nenhum módulo deve inventar chave própria para contexto/fila/dashboard.
 */
export const approvalKeys = {
  /** Contexto de ação de UMA entidade — SEMPRE escopado por módulo + id. */
  context: (moduleKey: string | undefined, entityId: string | undefined) =>
    ['approval_context', moduleKey ?? 'unknown', entityId] as const,
  /** Prefixo para invalidar todos os contextos. */
  contextAll: () => ['approval_context'] as const,
  /** Minha Fila (get_my_approval_queue) — mesma semântica no Dashboard. */
  queue: () => ['my_approvals'] as const,
  dashboard: () => ['dashboard_metrics'] as const,
  pending: () => ['critical_pendings'] as const,
  notifications: () => ['notifications'] as const,
  v2Health: () => ['approval_v2_health'] as const,
  v2Cutover: () => ['approval_v2_cutover'] as const,
} as const;
