import type { QueryClient } from '@tanstack/react-query';

function refreshApprovalContext(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['my_approvals'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['approval_context', referenceId] });
    qc.invalidateQueries({ queryKey: ['approval_request_for', referenceId] });
    qc.invalidateQueries({ queryKey: ['approval_flow_steps'] }); // Invalidate all for now, to be safe. Will fix later if needed, but per plan, it's ok for now or we can scope it if we pass approvalRequestId. Actually the plan said "referenceId". Let's just invalidate the prefix which invalidates any approval_flow_steps query.
  }
}

function refreshFleetDomain(qc: QueryClient, referenceId?: string) {
  qc.invalidateQueries({ queryKey: ['fuel_requests'] });
  qc.invalidateQueries({ queryKey: ['fuel_requests_pending'] });
  // status_history: consumed by FleetTimeline (still useEffect-based until Sprint 6B).
  // Once FleetTimeline migrates to useQuery, fleet_timeline invalidation below replaces this.
  qc.invalidateQueries({ queryKey: ['status_history'] });
  if (referenceId) {
    qc.invalidateQueries({ queryKey: ['fuel_request', referenceId] });
    qc.invalidateQueries({ queryKey: ['fleet_timeline', referenceId] });
  }
}

function refreshMetrics(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['fuel_metrics'] });
}

/**
 * Orquestrador central de invalidações.
 * Coordena as invalidações divididas por domínio de negócio.
 * Nenhuma query deve ser invalidada diretamente fora daqui (para regras de negócio).
 */
export function refreshApprovalData(qc: QueryClient, referenceId?: string): void {
  refreshApprovalContext(qc, referenceId);
  refreshFleetDomain(qc, referenceId);
  refreshMetrics(qc);
}
