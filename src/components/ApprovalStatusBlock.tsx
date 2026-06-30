import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, CheckCircle2, XCircle, RotateCcw, Clock, User, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getApproverTypeLabel } from '@/lib/approvalLabels';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ApprovalStatusBlockProps {
  approvalRequest: any;
  /** Previous approval cycles for the same reference */
  previousCycles?: any[];
}

import { useQuery } from '@tanstack/react-query';

interface HistoryEntry {
  id: string;
  action: string;
  action_by: string;
  step_order: number | null;
  comments: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  flow_started: 'Fluxo iniciado',
  approve: 'Aprovado',
  reject: 'Recusado',
  return: 'Devolvido',
};

export function ApprovalStatusBlock({ approvalRequest, previousCycles }: ApprovalStatusBlockProps) {
  const ar = approvalRequest;

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: historyData } = useQuery({
    queryKey: ['approval_history', ar?.id, ar?.status],
    enabled: !!ar?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('approval_history')
        .select('*, profiles:action_by(full_name)')
        .eq('approval_request_id', ar.id)
        .order('created_at', { ascending: false });
      return (data as any[]) || [];
    }
  });

  const history = historyData || [];

  if (!approvalRequest) return null;

  const steps = (ar.approval_request_steps || []).sort((a: any, b: any) => a.step_order - b.step_order);
  const status = String(ar.status || '');
  const isAwaitingApprover = !ar.ended_at && !!ar.current_approver_user_id && (status.startsWith('awaiting_step_') || status === 'pending_approval');
  const statusLabel = status === 'approved' ? 'Aprovado'
    : status === 'rejected' ? 'Recusado'
    : status === 'returned_for_adjustment' ? 'Devolvido para ajuste'
    : status === 'returned_to_requester' ? 'Devolvido ao solicitante'
    : status.startsWith('awaiting_step_') ? `Etapa ${ar.current_step_order}`
    : status;

  return (
    <div className="space-y-2">
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

          {/* Action history */}
          {history.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                <ChevronDown className={`w-3 h-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                Histórico de ações ({history.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1.5">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2 text-[11px] text-muted-foreground border-l-2 border-border pl-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">
                          {ACTION_LABELS[h.action] || h.action}
                        </span>
                        {h.step_order && <span className="ml-1">(etapa {h.step_order})</span>}
                        {h.comments && (
                          <p className="text-muted-foreground mt-0.5 italic">"{h.comments}"</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div>{(h as any).profiles?.full_name || 'Sistema'}</div>
                        <div>{new Date(h.created_at).toLocaleString('pt-BR')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Previous cycles */}
      {previousCycles && previousCycles.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1">
            <ChevronDown className="w-3 h-3" />
            Ciclos anteriores de aprovação ({previousCycles.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2">
              {previousCycles.map((cycle: any) => {
                const cStatus = String(cycle.status || '');
                const cLabel = cStatus === 'approved' ? 'Aprovado'
                  : cStatus === 'rejected' ? 'Recusado'
                  : cStatus === 'returned_to_requester' ? 'Devolvido'
                  : cStatus;
                return (
                  <Card key={cycle.id} className="opacity-60">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <Badge variant={cStatus === 'approved' ? 'default' : cStatus === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {cLabel}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(cycle.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {cycle.ended_at && (
                          <span className="text-muted-foreground">
                            → {new Date(cycle.ended_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                        {cycle.approval_request_steps?.map((s: any) => (
                          <Badge key={s.id} variant="outline" className="text-[9px]">
                            {s.step_order}. {s.profiles?.full_name || '—'} ({s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : s.status})
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
