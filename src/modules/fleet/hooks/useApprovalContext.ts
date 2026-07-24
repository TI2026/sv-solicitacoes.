import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApprovalContextPermissions {
  approve: boolean;
  reject: boolean;
  return: boolean;
  edit: boolean;
  cancel: boolean;
  generate_oc: boolean;
  confirm_payment: boolean;
  // [Sprint 3.0] Ações dinâmicas por módulo — array de strings configurado via module_action_rules.
  // O frontend não conhece a semântica de cada ação. Ele apenas verifica se a ação está presente.
  // Exemplo: ctx.permissions.allowed_actions.includes('confirm_fuel')
  allowed_actions: string[];
}

export interface ApprovalContextData {
  is_in_flow: boolean;
  status: string;
  flow: {
    id: string | null;
    name: string | null;
    current_step: number;
    total_steps: number;
    current_step_name: string | null;
  };
  current_approver: { id: string; name: string } | null;
  requester: { id: string; name: string };
  visibility: {
    mode: 'self' | 'approver' | 'sector' | 'global';
  };
  permissions: ApprovalContextPermissions;
  meta: {
    reason_blocked?: string | null;
    last_action_at?: string | null;
  };
}

// ENGINE_CONTEXT_ERROR: never silently swallow a missing context.
// A null context means the backend failed — surface it explicitly.
export class EngineContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ENGINE_CONTEXT_ERROR';
  }
}

export function useApprovalContext(referenceId: string | undefined, moduleCode?: string) {
  return useQuery<ApprovalContextData>({
    queryKey: ['approval_context', referenceId],
    queryFn: async () => {
      if (!referenceId) {
        throw new EngineContextError('referenceId is required to load ApprovalContext');
      }

      const { data, error } = await (supabase as any).rpc('get_entity_action_context', {
        p_module_key: moduleCode ?? 'purchases',
        p_entity_id: referenceId,
      } as any);

      if (error) {
        throw new EngineContextError(`Backend error loading ActionContext: ${error.message}`);
      }

      const result = data as any;
      if (!result) {
        throw new EngineContextError(`Context not found`);
      }

      const allowed = result.allowed_actions || [];

      // Mapear resultado para o formato esperado pelo frontend legado
      const legacyCtx: ApprovalContextData = {
        is_in_flow: !!result.current_step,
        status: result.current_status,
        flow: {
          id: null,
          name: null,
          current_step: 1,
          total_steps: 1,
          current_step_name: result.current_step,
        },
        current_approver: result.current_approver_user_id ? { id: result.current_approver_user_id, name: 'Aprovador' } : null,
        requester: { id: result.requester_user_id, name: 'Solicitante' },
        visibility: { mode: 'self' },
        permissions: {
          approve: allowed.includes('aprovar'),
          reject: allowed.includes('rejeitar'),
          return: allowed.includes('devolver'),
          edit: allowed.includes('editar'),
          cancel: allowed.includes('cancelar'),
          generate_oc: allowed.includes('gerar_oc'),
          confirm_payment: allowed.includes('pagar'),
          allowed_actions: allowed, // o componente novo consome isso diretamente (e.g. inform_delivery, etc)
        },
        meta: {
          reason_blocked: result.blocked_reasons?.length ? result.blocked_reasons.join(' | ') : null,
        }
      };

      return legacyCtx;
    },
    enabled: !!referenceId,
    staleTime: 30_000,
    gcTime:    60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
