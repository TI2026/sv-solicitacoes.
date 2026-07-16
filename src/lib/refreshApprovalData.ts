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
 *   my_approvals             → painel de aprovações pendentes
 */
import type { QueryClient } from '@tanstack/react-query';

function refreshApprovalContext(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['my_approvals'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['approval_context', referenceId] });
    qc.invalidateQueries({ queryKey: ['approval_request_for', referenceId] });
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

function refreshMetrics(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
}

/**
 * Orquestrador central de sincronização.
 *
 * Esta função não deve conter regras de negócio.
 * Sua única responsabilidade é coordenar
 * a invalidação de cache dos domínios.
 */
export function refreshApprovalData(qc: QueryClient, referenceId?: string): void {
  refreshApprovalContext(qc, referenceId);
  refreshFleetDomain(qc, referenceId);
  refreshMetrics(qc);
}
