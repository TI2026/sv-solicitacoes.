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
  | 'concluir_processamento_rh'
  | 'master_override';

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

export interface EntityActionResult {
  code?: number | string;
  message?: string;
  data?: unknown;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Contrato único do executor. A RPC pode transportar o código como número ou
 * string, mas somente 2xx representa sucesso. Respostas legadas com
 * `success:false` continuam sendo falha.
 */
export function parseEntityActionResult(data: unknown): EntityActionResult {
  if (!data || typeof data !== 'object') throw new Error('ENGINE_NO_RESULT');

  const result = data as EntityActionResult;
  if (result.error) throw new Error(result.message || result.error);
  if (result.success === false) throw new Error(result.message || 'ENGINE_ACTION_FAILED');

  if (result.code !== undefined && result.code !== null) {
    const code = Number(result.code);
    if (!Number.isInteger(code)) throw new Error(result.message || 'ENGINE_INVALID_CODE');
    if (code < 200 || code >= 300) throw new Error(result.message || `ENGINE_HTTP_${code}`);
  }

  return result;
}

export async function executeEntityAction(params: EntityActionParams) {
  const { data, error } = await (supabase as any).rpc('execute_entity_action', {
    p_module_key: params.moduleKey,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_payload: params.payload ?? {},
  });
  if (error) throw new Error(error.message);
  return parseEntityActionResult(data);
}

export function useEntityAction() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: executeEntityAction,
    onSuccess: (_result, params) => {
      refreshApprovalData(qc, params.entityId, params.moduleKey);
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

export interface ModuleWorkflowActionParams {
  requestId: string;
  action: CanonicalAction | string;
  payload?: Record<string, unknown>;
  /** Justificativa — enviada como `notes` ao motor. */
  reason?: string;
  successMessage?: string;
}

/**
 * Açúcar sintático para módulos cuja entidade é a própria solicitação.
 * Mantém o executor único como caminho real (executeEntityAction).
 */
export function useModuleWorkflowAction(moduleKey: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (vars: ModuleWorkflowActionParams) =>
      executeEntityAction({
        moduleKey,
        entityId: vars.requestId,
        action: vars.action,
        payload: { ...(vars.payload ?? {}), ...(vars.reason ? { notes: vars.reason } : {}) },
      }),
    onSuccess: (_result, vars) => {
      refreshApprovalData(qc, vars.requestId, moduleKey);
      toast({ title: vars.successMessage ?? 'Ação registrada com sucesso' });
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
