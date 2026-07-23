import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

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

function handleRpcResult(result: any, label: string) {
  if (!result) throw new Error(`Resposta vazia do servidor (${label})`);
  if (result.code && result.code !== '200') {
    throw new Error(result.message || `Erro ao executar ${label}`);
  }
  return result;
}

export function usePurchaseOperationalActions(purchaseId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    if (purchaseId) {
      refreshApprovalData(qc, purchaseId);
      qc.invalidateQueries({ queryKey: ['purchase', purchaseId] });
      qc.invalidateQueries({ queryKey: ['approval_context', purchaseId] });
    }
    qc.invalidateQueries({ queryKey: ['purchases_list'] });
    qc.invalidateQueries({ queryKey: ['my_requests'] });
    qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });
  };

  // ── Gerar OC ────────────────────────────────────────────────
  const advanceToOc = useMutation({
    mutationFn: async (params: AdvanceToOcParams) => {
      const { data, error } = await (supabase as any).rpc('advance_purchase_to_oc', {
        p_request_id:      params.requestId,
        p_oc_number:       params.ocNumber,
        p_supplier:        params.supplier,
        p_approved_value:  params.approvedValue,
        p_notes:           params.notes ?? null,
        p_delivery_address: params.deliveryAddress ?? null,
        p_delivery_date:   params.deliveryDate ?? null,
        p_tracking_code:   params.trackingCode ?? null,
      });
      if (error) throw error;
      return handleRpcResult(data, 'advance_purchase_to_oc');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Pagamento ──────────────────────────────────────
  const confirmPayment = useMutation({
    mutationFn: async (params: ConfirmPaymentParams) => {
      const { data, error } = await (supabase as any).rpc('confirm_purchase_payment', {
        p_request_id: params.requestId,
        p_notes:      params.notes ?? null,
      });
      if (error) throw error;
      return handleRpcResult(data, 'confirm_purchase_payment');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Entrega ────────────────────────────────────────
  const confirmDelivery = useMutation({
    mutationFn: async (params: ConfirmDeliveryParams) => {
      const { data, error } = await (supabase as any).rpc('confirm_purchase_delivery', {
        p_request_id:      params.requestId,
        p_delivery_address: params.deliveryAddress ?? null,
        p_delivery_date:   params.deliveryDate ?? null,
        p_notes:           params.notes ?? null,
        p_tracking_code:   params.trackingCode ?? null,
      });
      if (error) throw error;
      return handleRpcResult(data, 'confirm_purchase_delivery');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Recebimento ────────────────────────────────────
  const confirmReceipt = useMutation({
    mutationFn: async (params: ConfirmReceiptParams) => {
      const { data, error } = await (supabase as any).rpc('confirm_purchase_receipt', {
        p_request_id: params.requestId,
        p_notes:      params.notes ?? null,
      });
      if (error) throw error;
      return handleRpcResult(data, 'confirm_purchase_receipt');
    },
    onSuccess: invalidate,
  });

  // ── Cancelar (com reason obrigatório) ───────────────────────
  const cancelPurchase = useMutation({
    mutationFn: async (params: CancelPurchaseParams) => {
      const { data, error } = await (supabase as any).rpc('cancel_purchase_request', {
        p_request_id: params.requestId,
        p_reason:     params.reason,
      });
      if (error) throw error;
      return handleRpcResult(data, 'cancel_purchase_request');
    },
    onSuccess: invalidate,
  });

  // ── Aprovação (via motor canônico process_approval_action) ───
  const approvalAction = useMutation({
    mutationFn: async (params: {
      approvalRequestId: string;
      action: 'approve' | 'reject' | 'return';
      comments?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('process_approval_action', {
        p_approval_request_id: params.approvalRequestId,
        p_action:              params.action,
        p_comments:            params.comments ?? null,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
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
