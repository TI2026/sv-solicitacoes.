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
import { AlertTriangle, ArrowRight, CalendarClock, ListChecks, Pencil, UserCheck, UserCircle2 } from 'lucide-react';
import type { ApprovalContextData } from '@/modules/fleet/hooks/useApprovalContext';

export function ApprovalContextSummary({ ctx }: { ctx?: ApprovalContextData | null }) {
  if (!ctx) return null;

  const raw = ctx.raw;
  const allowedActions = ctx.permissions.allowed_actions;
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
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>{raw.waiting_label}</span>
        </div>
      )}

      {raw.next_step_name && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          <span>
            Próxima etapa{raw.next_step_order ? ` ${raw.next_step_order}` : ''}: <span className="text-foreground">{raw.next_step_name}</span>
          </span>
        </div>
      )}

      {raw.sla_deadline && (
        <div className={`flex items-center gap-1.5 ${raw.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>
            SLA: {new Date(raw.sla_deadline).toLocaleString('pt-BR')}
            {raw.overdue ? ' · vencido' : ''}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Pencil className="w-3.5 h-3.5 shrink-0" />
        <span>Edição: <span className="text-foreground">{raw.can_edit ? 'permitida' : 'não permitida'}</span></span>
      </div>

      {allowedActions.length > 0 && (
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <ListChecks className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Ações disponíveis: <span className="text-foreground">{allowedActions.map(action => action.replaceAll('_', ' ')).join(', ')}</span>
          </span>
        </div>
      )}

      {raw.blocked_reasons && raw.blocked_reasons.length > 0 && (
        <div className="flex items-start gap-1.5 text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{raw.blocked_reasons.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
