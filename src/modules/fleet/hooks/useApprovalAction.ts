/**
 * useApprovalAction — Sprint Final 1
 *
 * Convergido para o executor único: execute_entity_action.
 * Não chama mais process_approval_action (motor V1) diretamente.
 */
import { useEntityAction } from '@/hooks/useEntityAction';

export interface ApprovalActionParams {
  moduleKey: string;
  entityId: string;
  action: 'approve' | 'reject' | 'return';
  /** Ação canônica de conclusão da etapa atual, vinda do Action Context. */
  completionAction?: string;
  comments?: string;
}

const ACTION_MAP: Record<'reject' | 'return', string> = {
  reject: 'rejeitar',
  return: 'devolver',
};

export function useApprovalAction() {
  const exec = useEntityAction();

  return {
    ...exec,
    mutateAsync: (params: ApprovalActionParams) =>
      exec.mutateAsync({
        moduleKey: params.moduleKey,
        entityId: params.entityId,
        action:
          params.action === 'approve'
            ? params.completionAction || 'aprovar'
            : ACTION_MAP[params.action],
        payload: params.comments ? { notes: params.comments } : {},
        successMessage: 'Ação de aprovação processada!',
      }),
  };
}
