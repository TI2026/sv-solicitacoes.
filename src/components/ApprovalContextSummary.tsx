/**
 * ApprovalContextSummary.tsx
 *
 * CAMADA: Component (apresentação pura)
 *
 * Fonte ÚNICA de exibição do contexto de aprovação nas telas de detalhe.
 * Todos os campos vêm do contrato real de `get_entity_action_context`
 * (total_steps, requester_name, current_approver_name, waiting_label).
 *
 * Proibido: placeholders inventados ("Aprovador", "Solicitante"),
 * total_steps calculado no cliente ou etapa hardcoded.
 */
import { Clock, UserCheck, UserCircle2 } from 'lucide-react';
import type { ApprovalContextData } from '@/modules/fleet/hooks/useApprovalContext';

export function ApprovalContextSummary({ ctx }: { ctx?: ApprovalContextData | null }) {
  if (!ctx) return null;

  const raw = ctx.raw;
  const hasStep = !!raw.current_step_order && !!raw.total_steps;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs">
      {hasStep && (
        <div className="flex items-center gap-1.5 text-foreground">
          <span className="font-medium">
            Etapa {raw.current_step_order}/{raw.total_steps}
          </span>
          {raw.current_step_name && (
            <span className="text-muted-foreground truncate">· {raw.current_step_name}</span>
          )}
        </div>
      )}

      {raw.requester_name && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Solicitado por <span className="text-foreground">{raw.requester_name}</span></span>
        </div>
      )}

      {raw.current_approver_name && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <UserCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Responsável atual: <span className="text-foreground">{raw.current_approver_name}</span></span>
        </div>
      )}

      {raw.waiting_label && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{raw.waiting_label}</span>
        </div>
      )}
    </div>
  );
}
