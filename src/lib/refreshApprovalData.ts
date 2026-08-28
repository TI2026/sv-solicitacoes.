/**
 * refreshApprovalData.ts
 *
 * Orquestrador central de sincronização.
 *
 * Esta função não deve conter regras de negócio.
 * Sua única responsabilidade é coordenar a invalidação de cache dos domínios.
 *
 * Todas as invalidações possuem queryKey explícita.
 * Nenhuma invalidação global (sem queryKey) é permitida.
 *
 * Queries invalidadas:
 *   approval_context         → useApprovalContext
 *   approval_request_for     → useApprovalRequestForReference
 *   approval_flow_steps      → useApprovalFlowSteps (ApprovalFlowViewer)
 *   fleet_timeline           → useFleetTimeline (FleetTimeline)
 *   diaria_progress          → useDiariaProgress (DiariaProgressBar)
 *   fuel_request             → useFuelRequest
 *   fuel_requests            → useFuelRequests (listas)
 *   fuel_requests_pending    → useFuelRequestsPending
 *   fuel_metrics             → useFuelMetrics
 *   my_approvals             → MyQueueWidget (Central Operacional)
 *   my_approval_history      → MyApprovalsTab (histórico)
 *   my_requests              → MyRequestsWidget (Central Operacional)
 *   recent_activity          → RecentActivityWidget (Central Operacional)
 *   critical_pendings        → CriticalPendingWidget (Central Operacional)
 *   dashboard_metrics        → FuelMetricsBlock / AdmissionMetricsBlock
 *   purchases                → usePurchases
 *   purchase                 → usePurchase
 *   admission_requests       → useAdmissionRequests (lista)
 *   admission_request        → useAdmissionRequest (detalhe)
 *   admission_list_items     → useAdmissionListItems (view paginada)
 *   termination_requests     → useTerminations (lista)
 *   termination_request      → useTermination (detalhe)
 */
import type { QueryClient } from '@tanstack/react-query';

function refreshApprovalContext(qc: QueryClient, referenceId?: string, moduleKey?: string) {
  qc.invalidateQueries({ queryKey: ['my_approvals'] });
  qc.invalidateQueries({ queryKey: ['my_approval_history'] });
  // Chaves de contexto são escopadas por módulo (['approval_context', module, id]).
  // Invalidamos por prefixo para cobrir todos os módulos sem duplicar regra.
  qc.invalidateQueries({
    queryKey: moduleKey && referenceId
      ? ['approval_context', moduleKey, referenceId]
      : ['approval_context'],
  });
  if (referenceId) {
    qc.invalidateQueries({
      queryKey: moduleKey
        ? ['approval_request_for', moduleKey, referenceId]
        : ['approval_request_for'],
    });
    qc.invalidateQueries({ queryKey: ['approval_flow_steps', referenceId] });
  }
}

function refreshFleetDomain(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['fuel_requests'] });
  qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['fuel_request', referenceId] });
    qc.invalidateQueries({ queryKey: ['fleet_timeline', referenceId] });
    qc.invalidateQueries({ queryKey: ['diaria_progress', referenceId] });
  }
}

function refreshPurchasesDomain(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['purchases'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['purchase', referenceId] });
  }
}

function refreshAdmissionsDomain(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['admission_requests'] });
  qc.invalidateQueries({ queryKey: ['admission_list_items'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['admission_request', referenceId] });
  }
}

function refreshTerminationsDomain(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['termination_requests'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['termination_request', referenceId] });
  }
}

function refreshMetrics(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
  qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
}

/**
 * Invalida os widgets da Central Operacional (Sprint 7+).
 * Chamado sempre que qualquer ação de aprovação, criação ou mutação ocorre.
 */
function refreshDashboardWidgets(qc: QueryClient, userId?: string) {
  qc.invalidateQueries({ queryKey: ['my_approvals'] });
  qc.invalidateQueries({ queryKey: ['my_approval_history'] });
  qc.invalidateQueries({ queryKey: ['my_requests'] });
  qc.invalidateQueries({ queryKey: ['recent_activity'] });
  qc.invalidateQueries({ queryKey: ['critical_pendings'] });
}

/**
 * Orquestrador central de sincronização.
 *
 * Esta função não deve conter regras de negócio.
 * Sua única responsabilidade é coordenar
 * a invalidação de cache dos domínios.
 */
export function refreshApprovalData(qc: QueryClient, referenceId?: string, moduleKey?: string): void {
  refreshApprovalContext(qc, referenceId, moduleKey);
  if (!moduleKey || ['abastecimento', 'diaria', 'reembolso'].includes(moduleKey)) {
    refreshFleetDomain(qc, referenceId);
  }
  if (!moduleKey || moduleKey === 'compras') refreshPurchasesDomain(qc, referenceId);
  if (!moduleKey || ['admissoes', 'admissions'].includes(moduleKey)) refreshAdmissionsDomain(qc, referenceId);
  if (!moduleKey || moduleKey === 'desligamentos') refreshTerminationsDomain(qc, referenceId);
  refreshMetrics(qc);
  refreshDashboardWidgets(qc);
}
