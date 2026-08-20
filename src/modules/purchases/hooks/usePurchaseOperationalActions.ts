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
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'purchases',
        p_entity_id: params.requestId,
        p_action: 'gerar_oc',
        p_payload: {
          ocNumber: params.ocNumber,
          supplier: params.supplier,
          approvedValue: params.approvedValue,
          notes: params.notes,
          deliveryAddress: params.deliveryAddress,
          deliveryDate: params.deliveryDate,
          trackingCode: params.trackingCode,
        }
      });
      if (error) throw error;
      return handleRpcResult(data, 'gerar_oc');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Pagamento ──────────────────────────────────────
  const confirmPayment = useMutation({
    mutationFn: async (params: ConfirmPaymentParams) => {
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'purchases',
        p_entity_id: params.requestId,
        p_action: 'pagar',
        p_payload: { notes: params.notes }
      });
      if (error) throw error;
      return handleRpcResult(data, 'pagar');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Entrega ────────────────────────────────────────
  const confirmDelivery = useMutation({
    mutationFn: async (params: ConfirmDeliveryParams) => {
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'purchases',
        p_entity_id: params.requestId,
        p_action: 'informar_entrega',
        p_payload: {
          deliveryAddress: params.deliveryAddress,
          deliveryDate: params.deliveryDate,
          notes: params.notes,
          trackingCode: params.trackingCode,
        }
      });
      if (error) throw error;
      return handleRpcResult(data, 'informar_entrega');
    },
    onSuccess: invalidate,
  });

  // ── Confirmar Recebimento ────────────────────────────────────
  const confirmReceipt = useMutation({
    mutationFn: async (params: ConfirmReceiptParams) => {
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'purchases',
        p_entity_id: params.requestId,
        p_action: 'concluir',
        p_payload: { notes: params.notes }
      });
      if (error) throw error;
      return handleRpcResult(data, 'concluir');
    },
    onSuccess: invalidate,
  });

  // ── Cancelar (com reason obrigatório) ───────────────────────
  const cancelPurchase = useMutation({
    mutationFn: async (params: CancelPurchaseParams) => {
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'purchases',
        p_entity_id: params.requestId,
        p_action: 'cancelar',
        p_payload: { notes: params.reason }
      });
      if (error) throw error;
      return handleRpcResult(data, 'cancelar');
    },
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
      const { data, error } = await (supabase as any).rpc('execute_entity_action', {
        p_module_key: 'compras',
        p_entity_id:  params.entityId,
        p_action:     actionName,
        p_payload:    params.comments ? { comments: params.comments } : {},
      });
      if (error) throw new Error(error.message);
      const result = data as any;
      if (!result) throw new Error('ENGINE_NO_RESULT');
      if (result.error) throw new Error(result.error);
      if (result.success === false) throw new Error(result.message || 'ENGINE_ACTION_FAILED');
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
