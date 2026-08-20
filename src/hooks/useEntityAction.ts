/**
 * useEntityAction.ts — Sprint Final 1 (Convergência V2)
 *
 * ÚNICO ponto de mutação de workflow do frontend.
 * Nenhum componente/hook pode chamar start_approval_flow, process_approval_action
 * ou *_set_status diretamente. Tudo converge aqui:
 *
 *   UI → execute_entity_action(module_key, entity_id, action, payload) → Motor
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatApprovalError } from '@/lib/formatApprovalError';
import { refreshApprovalData } from '@/lib/refreshApprovalData';

/** Ações canônicas V2 — o frontend não pode inventar alias. */
export type CanonicalAction =
  | 'enviar'
  | 'aprovar'
  | 'devolver'
  | 'rejeitar'
  | 'cancelar'
  | 'gerar_oc'
  | 'pagar'
  | 'informar_entrega'
  | 'concluir'
  | 'relatar_divergencia'
  | 'enviar_comprovantes'
  | 'concluir_revisao'
  | 'confirmar_horas'
  | 'concluir_triagem'
  | 'concluir_processamento_rh';

export interface EntityActionParams {
  moduleKey: string;
  entityId: string;
  action: CanonicalAction | string;
  payload?: Record<string, unknown>;
  /** Mensagem de sucesso. Só é exibida se a RPC realmente retornar sucesso. */
  successMessage?: string;
  /** Silencia o toast de sucesso (quando o chamador já mostra o seu). */
  silent?: boolean;
}

export async function executeEntityAction(params: EntityActionParams) {
  const { data, error } = await (supabase as any).rpc('execute_entity_action', {
    p_module_key: params.moduleKey,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_payload: params.payload ?? {},
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  // Erro nunca pode virar sucesso.
  if (!result) throw new Error('ENGINE_NO_RESULT');
  if (result.error) throw new Error(result.error);
  if (result.success === false) throw new Error(result.message || 'ENGINE_ACTION_FAILED');
  return result;
}

export function useEntityAction() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: executeEntityAction,
    onSuccess: (_result, params) => {
      refreshApprovalData(qc, params.entityId);
      if (!params.silent) {
        toast({ title: params.successMessage ?? 'Ação registrada com sucesso' });
      }
    },
    onError: (err: Error) => {
      toast({
        title: 'Não foi possível concluir a ação',
        description: formatApprovalError(err.message),
        variant: 'destructive',
      });
    },
  });
}
