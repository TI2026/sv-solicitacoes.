import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { approvalKeys, STEP_COMPLETION_ACTIONS } from '@/lib/approvalKeys';

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
    /** Ação canônica que conclui a etapa atual (ex.: aprovar, pagar, concluir_revisao). */
    step_action?: string | null;
    /** Rótulo informativo quando o usuário não pode agir (nunca deixar tela vazia). */
    waiting_label?: string | null;
    sla_deadline?: string | null;
    overdue?: boolean;
  };
  /** Contrato bruto do Motor V2 — fonte de verdade para telas novas. */
  raw: EntityActionContextRaw;
}

/** Contrato bruto V2 devolvido por get_entity_action_context. */
export interface EntityActionContextRaw {
  module_key: string;
  entity_id: string;
  current_status: string;
  requester_user_id: string;
  requester_name: string | null;
  approval_request_id: string | null;
  flow_id: string | null;
  flow_version: string | null;
  current_step: string | null;
  current_step_name: string | null;
  current_step_code: string | null;
  current_step_kind: string | null;
  current_step_order: number | null;
  total_steps: number | null;
  current_approver_user_id: string | null;
  current_approver_name: string | null;
  next_step_name: string | null;
  next_step_code: string | null;
  next_step_order: number | null;
  sla_deadline: string | null;
  overdue: boolean;
  is_current_actor: boolean;
  can_edit: boolean;
  allowed_actions: string[];
  blocked_reasons: string[] | null;
  waiting_label: string | null;
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
  const moduleKey = moduleCode ?? 'purchases';
  return useQuery<ApprovalContextData>({
    queryKey: approvalKeys.context(moduleKey, referenceId),
    queryFn: async () => {
      if (!referenceId) {
        throw new EngineContextError('referenceId is required to load ApprovalContext');
      }

      const { data, error } = await (supabase as any).rpc('get_entity_action_context', {
        p_module_key: moduleKey,
        p_entity_id: referenceId,
      } as any);

      if (error) {
        throw new EngineContextError(`Backend error loading ActionContext: ${error.message}`);
      }

      const result = data as EntityActionContextRaw | null;
      if (!result) {
        throw new EngineContextError(`Context not found`);
      }

      const allowed: string[] = (result.allowed_actions as any) || [];

      // Ações que concluem a etapa atual no motor V2 (contrato: cada etapa tem
      // uma ação canônica própria — "aprovar" é apenas o caso mais comum).
      const isStepActor = !!result.current_step_order && !!result.approval_request_id;
      const stepAction: string | undefined = isStepActor
        ? allowed.find((a: string) => (STEP_COMPLETION_ACTIONS as readonly string[]).includes(a))
        : undefined;

      // Mapeamento para o formato consumido pelas telas.
      // Sem placeholders: todos os campos vêm do contrato real do Motor V2.
      const ctx: ApprovalContextData = {
        is_in_flow: !!result.approval_request_id,
        status: result.current_status,
        flow: {
          id: result.flow_id ?? null,
          name: null,
          current_step: result.current_step_order ?? 0,
          total_steps: result.total_steps ?? 0,
          current_step_name: result.current_step_name ?? result.current_step ?? null,
        },
        current_approver: result.current_approver_user_id
          ? { id: result.current_approver_user_id, name: result.current_approver_name ?? '—' }
          : null,
        requester: { id: result.requester_user_id, name: result.requester_name ?? '—' },
        visibility: { mode: result.is_current_actor ? 'approver' : 'self' },
        permissions: {
          approve: !!stepAction,
          reject: allowed.includes('rejeitar'),
          return: allowed.includes('devolver'),
          // can_edit é a ÚNICA autoridade — "editar" não é workflow action.
          edit: result.can_edit === true,
          cancel: allowed.includes('cancelar'),
          generate_oc: allowed.includes('gerar_oc'),
          confirm_payment: allowed.includes('pagar') && !stepAction,
          allowed_actions: allowed,
        },
        meta: {
          reason_blocked: result.blocked_reasons?.length ? result.blocked_reasons.join(' | ') : null,
          step_action: stepAction ?? null,
          waiting_label: result.waiting_label ?? null,
          sla_deadline: result.sla_deadline ?? null,
          overdue: !!result.overdue,
        },
        raw: result,
      };

      return ctx;
    },
    enabled: !!referenceId,
    staleTime: 30_000,
    gcTime:    60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
