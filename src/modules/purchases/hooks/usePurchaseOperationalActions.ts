import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalKeys } from '@/lib/approvalKeys';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { executeEntityAction } from '@/hooks/useEntityAction';

/**
 * usePurchaseOperationalActions
 *
 * CAMADA: Hook
 *
 * Responsabilidade: encapsular todas as ações operacionais pós-aprovação
 * específicas do módulo Compras. Cada mutation chama uma RPC dedicada
 * (não reutiliza funções de fleet/fuel_requests).
 *
 * B2 Fix: Compras não reutiliza register_oc_and_advance (exclusivo fleet).
 * RPCs próprias: advance_purchase_to_oc, confirm_purchase_payment,
 * confirm_purchase_delivery, confirm_purchase_receipt, cancel_purchase_request.
 *
 * Padrão: Component → Hook (este arquivo) → RPC Supabase → purchases
 */

export interface AdvanceToOcParams {
  requestId: string;
  ocNumber: string;
  supplier: string;
  approvedValue: number;
  notes?: string;
  deliveryAddress?: string;
  deliveryDate?: string;
  trackingCode?: string;
}

export interface ConfirmPaymentParams {
  requestId: string;
  notes?: string;
}

export interface ConfirmDeliveryParams {
  requestId: string;
  deliveryAddress?: string;
  deliveryDate?: string;
  notes?: string;
  trackingCode?: string;
}

export interface ConfirmReceiptParams {
  requestId: string;
  notes?: string;
}

export interface CancelPurchaseParams {
  requestId: string;
  reason: string;
}

export function usePurchaseOperationalActions(purchaseId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    if (purchaseId) {
      refreshApprovalData(qc, purchaseId);
      qc.invalidateQueries({ queryKey: ['purchase', purchaseId] });
      qc.invalidateQueries({ queryKey: approvalKeys.context('compras', purchaseId) });
    }
    qc.invalidateQueries({ queryKey: ['purchases_list'] });
    qc.invalidateQueries({ queryKey: ['my_requests'] });
    qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
  };

  // ── Gerar OC ────────────────────────────────────────────────
  const advanceToOc = useMutation({
    mutationFn: (params: AdvanceToOcParams) => executeEntityAction({
        moduleKey: 'compras',
        entityId: params.requestId,
        action: 'gerar_oc',
        payload: {
          ocNumber: params.ocNumber,
          supplier: params.supplier,
          approvedValue: params.approvedValue,
          notes: params.notes,
          deliveryAddress: params.deliveryAddress,
          deliveryDate: params.deliveryDate,
          trackingCode: params.trackingCode,
        }
      }),
    onSuccess: invalidate,
  });

  // ── Confirmar Pagamento ──────────────────────────────────────
  const confirmPayment = useMutation({
    mutationFn: (params: ConfirmPaymentParams) => executeEntityAction({
      moduleKey: 'compras', entityId: params.requestId, action: 'pagar', payload: { notes: params.notes },
    }),
    onSuccess: invalidate,
  });

  // ── Confirmar Entrega ────────────────────────────────────────
  const confirmDelivery = useMutation({
    mutationFn: (params: ConfirmDeliveryParams) => executeEntityAction({
        moduleKey: 'compras',
        entityId: params.requestId,
        action: 'informar_entrega',
        payload: {
          deliveryAddress: params.deliveryAddress,
          deliveryDate: params.deliveryDate,
          notes: params.notes,
          trackingCode: params.trackingCode,
        }
      }),
    onSuccess: invalidate,
  });

  // ── Confirmar Recebimento ────────────────────────────────────
  const confirmReceipt = useMutation({
    mutationFn: (params: ConfirmReceiptParams) => executeEntityAction({
      moduleKey: 'compras', entityId: params.requestId, action: 'concluir', payload: { notes: params.notes },
    }),
    onSuccess: invalidate,
  });

  // ── Cancelar (com reason obrigatório) ───────────────────────
  const cancelPurchase = useMutation({
    mutationFn: (params: CancelPurchaseParams) => executeEntityAction({
      moduleKey: 'compras', entityId: params.requestId, action: 'cancelar', payload: { notes: params.reason },
    }),
    onSuccess: invalidate,
  });

  // ── Aprovação — Sprint Final 1: executor único (execute_entity_action) ───
  // process_approval_action não é mais chamado pelo frontend.
  const approvalAction = useMutation({
    mutationFn: async (params: {
      /** ID da COMPRA (entidade), não da approval_request. */
      entityId: string;
      action: 'approve' | 'reject' | 'return';
      /** Ação canônica de conclusão da etapa, vinda do Action Context. */
      completionAction?: string;
      comments?: string;
    }) => {
      const actionName =
        params.action === 'approve'
          ? params.completionAction || 'aprovar'
          : params.action === 'reject'
            ? 'rejeitar'
            : 'devolver';
      return executeEntityAction({
        moduleKey: 'compras',
        entityId: params.entityId,
        action: actionName,
        payload: params.comments ? { notes: params.comments } : {},
      });
    },
    onSuccess: invalidate,
  });

  return {
    advanceToOc,
    confirmPayment,
    confirmDelivery,
    confirmReceipt,
    cancelPurchase,
    approvalAction,
    isAdvancingToOc:     advanceToOc.isPending,
    isConfirmingPayment: confirmPayment.isPending,
    isConfirmingDelivery: confirmDelivery.isPending,
    isConfirmingReceipt: confirmReceipt.isPending,
    isCanceling:         cancelPurchase.isPending,
    isActingApproval:    approvalAction.isPending,
  };
}
