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
    queryKey: ['approval_context', referenceId, moduleCode],
    queryFn: async () => {
      if (!referenceId) {
        throw new EngineContextError('referenceId is required to load ApprovalContext');
      }

      const { data, error } = await supabase.rpc('get_approval_context', {
        p_reference_id: referenceId,
        p_module_code: moduleCode ?? null,
      } as any);

      if (error) {
        throw new EngineContextError(`Backend error loading ApprovalContext: ${error.message}`);
      }

      const result = data as any;

      // ENGINE-403 / AUTH-009: backend explicitly denied access — surface it.
      if (result?.code && result.code !== '200') {
        throw new EngineContextError(`${result.code}: ${result.message}`);
      }

      return result as ApprovalContextData;
    },
    enabled: !!referenceId,
    staleTime: 5_000, // context is short-lived — revalidate frequently
    retry: false,     // never silently retry a context failure
  });
}
