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
  const isActive = !ar.ended_at;
  const isFinal = ar.status === 'approved' || ar.status === 'rejected';

  return (
    <Card className={`border-l-4 ${isFinal ? (ar.status === 'approved' ? 'border-l-green-500' : 'border-l-destructive') : 'border-l-primary'}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <GitBranch className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Fluxo de Aprovação</h3>
          <Badge
            variant={ar.status === 'approved' ? 'default' : ar.status === 'rejected' ? 'destructive' : ar.status === 'returned_for_adjustment' ? 'secondary' : 'outline'}
            className="text-xs"
          >
            {ar.status === 'approved' ? 'Aprovado' :
             ar.status === 'rejected' ? 'Recusado' :
             ar.status === 'returned_for_adjustment' ? 'Devolvido para ajuste' :
             ar.status.startsWith('awaiting_step_') ? `Etapa ${ar.current_step_order}` :
             ar.status}
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
            const isCurrentStep = isActive && step.step_order === ar.current_step_order;
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
        {isActive && ar.current_step_order && (
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

        {ar.ended_at && (
          <p className="text-[11px] text-muted-foreground">
            Encerrado em {new Date(ar.ended_at).toLocaleDateString('pt-BR')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
