import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, CheckCircle2, XCircle, RotateCcw, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getApproverTypeLabel, getStepStatusLabel } from '@/lib/approvalLabels';

interface ApprovalStatusBlockProps {
  approvalRequest: any;
}

export function ApprovalStatusBlock({ approvalRequest }: ApprovalStatusBlockProps) {
  if (!approvalRequest) return null;

  const ar = approvalRequest;
  const steps = (ar.approval_request_steps || []).sort((a: any, b: any) => a.step_order - b.step_order);
  const status = String(ar.status || '');
  const isAwaitingApprover = !ar.ended_at && !!ar.current_approver_user_id && status.startsWith('awaiting_step_');
  const isFinal = status === 'approved' || status === 'rejected';
  const statusLabel = status === 'approved' ? 'Aprovado'
    : status === 'rejected' ? 'Recusado'
    : status === 'returned_for_adjustment' ? 'Devolvido para ajuste'
    : status === 'returned_to_requester' ? 'Devolvido ao solicitante'
    : status.startsWith('awaiting_step_') ? `Etapa ${ar.current_step_order}`
    : status;

  return (
    <Card className={`border-l-4 ${status === 'rejected' ? 'border-l-destructive' : status === 'approved' ? 'border-l-green-500' : 'border-l-primary'}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <GitBranch className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Fluxo de Aprovação</h3>
          <Badge
            variant={status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : (status === 'returned_for_adjustment' || status === 'returned_to_requester') ? 'secondary' : 'outline'}
            className="text-xs"
          >
            {statusLabel}
          </Badge>
          {ar.approval_modules?.name && (
            <Badge variant="secondary" className="text-[10px]">{ar.approval_modules.name}</Badge>
          )}
        </div>

        {/* Info row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            Solicitante: {ar.profiles?.full_name || '—'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(ar.created_at), { addSuffix: true, locale: ptBR })}
          </span>
          {ar.approval_flows?.name && (
            <span>Fluxo: {ar.approval_flows.name}</span>
          )}
        </div>

        {/* Steps timeline */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {steps.map((step: any, idx: number) => {
            const isCurrentStep = isAwaitingApprover && step.step_order === ar.current_step_order;
            return (
              <div key={step.id} className="flex items-center gap-1">
                {idx > 0 && <span className="text-muted-foreground text-xs">→</span>}
                <Badge
                  variant={
                    step.status === 'approved' ? 'default' :
                    step.status === 'rejected' ? 'destructive' :
                    step.status === 'returned' ? 'secondary' :
                    isCurrentStep ? 'secondary' : 'outline'
                  }
                  className="text-[10px] gap-1"
                >
                  {step.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                  {step.status === 'rejected' && <XCircle className="w-3 h-3" />}
                  {step.status === 'returned' && <RotateCcw className="w-3 h-3" />}
                  {step.status === 'pending' && isCurrentStep && <Clock className="w-3 h-3 animate-pulse" />}
                  {step.step_order}. {step.profiles?.full_name || 'Aprovador'}
                </Badge>
              </div>
            );
          })}
        </div>

        {/* Current approver info */}
        {isAwaitingApprover && ar.current_step_order && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            Aguardando aprovação de <strong>
              {steps.find((s: any) => s.step_order === ar.current_step_order)?.profiles?.full_name || 'aprovador'}
            </strong>
            {steps.find((s: any) => s.step_order === ar.current_step_order)?.approver_rule && (
              <span className="ml-1">
                ({getApproverTypeLabel(steps.find((s: any) => s.step_order === ar.current_step_order)?.approver_rule)})
              </span>
            )}
          </div>
        )}

        {status === 'returned_to_requester' && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            Esta solicitação foi devolvida ao solicitante e não está aguardando aprovação neste momento.
          </div>
        )}

        {ar.ended_at && (
          <p className="text-[11px] text-muted-foreground">
            Encerrado em {new Date(ar.ended_at).toLocaleDateString('pt-BR')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
