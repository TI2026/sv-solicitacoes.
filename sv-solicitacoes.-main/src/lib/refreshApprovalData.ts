import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalida as queries essenciais afetadas por qualquer ação do Approval Engine.
 *
 * @param qc         - instância do QueryClient
 * @param referenceId - ID da solicitação (fuel_request, admission_request, etc.)
 *                      Quando fornecido, invalida também as queries específicas do item.
 *                      Quando omitido (ex: batch), invalida apenas as queries globais.
 *
 * Sprint 5 — fontes intencionalmente limitadas:
 * Listas como fuel_requests_completed/_pending/_rejected só devem ser invalidadas
 * pelos hooks que as gerenciam diretamente, não por esta função genérica.
 */
export function refreshApprovalData(qc: QueryClient, referenceId?: string): void {
  // Sempre invalidar: impactam qualquer aprovador ou dashboard
  qc.invalidateQueries({ queryKey: ['my_approvals'] });
  qc.invalidateQueries({ queryKey: ['fuel_metrics'] });

  if (referenceId) {
    // Específicas do item: approval_context, approval_request, domínio
    qc.invalidateQueries({ queryKey: ['approval_context', referenceId] });
    qc.invalidateQueries({ queryKey: ['approval_request_for', referenceId] });
    qc.invalidateQueries({ queryKey: ['fuel_request', referenceId] });
  }
}
