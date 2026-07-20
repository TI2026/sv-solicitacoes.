import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Clock, CheckCircle2, XCircle, RotateCcw, ClipboardCheck, User, Info, Send, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMyApprovals, useProcessApproval, usePendingFuelRequests } from '../hooks/usePermissionsData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getApproverTypeLabel } from '@/lib/approvalLabels';
import { REQUEST_TYPE_LABELS } from '@/lib/constants';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approved: { label: 'Aprovado', variant: 'default' },
  rejected: { label: 'Recusado', variant: 'destructive' },
  returned_for_adjustment: { label: 'Devolvido', variant: 'secondary' },
  returned_to_requester: { label: 'Devolvido ao solicitante', variant: 'secondary' },
  pending_approval: { label: 'Pendente', variant: 'outline' },
};

function getApprovalLastActivityDate(approval: any) {
  const timestamps = [
    approval.created_at,
    ...(Array.isArray(approval.approval_request_steps) ? approval.approval_request_steps.map((step: any) => step.action_at ?? null) : []),
  ]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  return new Date(timestamps.length ? Math.max(...timestamps) : Date.now());
}

function getStatusBadge(status: string) {
  if (status.startsWith('awaiting_step_')) {
    return { label: `Etapa ${status.replace('awaiting_step_', '')}`, variant: 'outline' as const };
  }
  return STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
}

export default function MyApprovalsTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: approvals, isLoading } = useMyApprovals(user?.id);
  const { data: pendingFuel, isLoading: loadingFuel } = usePendingFuelRequests();
  const processAction = useProcessApproval();
  const [actionDialog, setActionDialog] = useState<{ id: string; type: 'reject' | 'return' } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const sortedApprovals = [...(Array.isArray(approvals) ? approvals : [])]
    .filter((a: any) => a.status !== 'cancelled')
    .sort(
      (a: any, b: any) => getApprovalLastActivityDate(b).getTime() - getApprovalLastActivityDate(a).getTime(),
    );

  // Only show as "my pending" if I am the CURRENT approver of the CURRENT step
  const myPending = sortedApprovals.filter((a: any) =>
    a.current_approver_user_id === user?.id && !a.ended_at
  );

  // Everything else: history or others' items
  const otherApprovals = sortedApprovals.filter((a: any) =>
    !(a.current_approver_user_id === user?.id && !a.ended_at)
  );

  // Only items where I participated (as requester or step approver)
  const myHistory = otherApprovals.filter((a: any) => {
    if (a.requester_user_id === user?.id) return true;
    return a.approval_request_steps?.some((s: any) => s.approver_user_id === user?.id);
  });

  const handleApprove = (id: string) => {
    processAction.mutate({ approvalRequestId: id, action: 'approve' });
  };

  const buildRoute = (a: any) => {
    const code = a.approval_modules?.code as string | undefined;
    if (!code || !a.reference_id) return null;
    if (code === 'admissions') return `/admissions/${a.reference_id}`;
    if (code === 'compras') return `/purchases/${a.reference_id}`;
    if (code === 'desligamentos') return `/desligamentos/${a.reference_id}`;
    if (['abastecimento', 'reembolso', 'diaria'].includes(code)) return `/fleet/${a.reference_id}`;
    return null;
  };

  const handleActionConfirm = () => {
    if (!actionDialog || actionReason.trim().length < 5) return;
    processAction.mutate(
      { approvalRequestId: actionDialog.id, action: actionDialog.type === 'reject' ? 'reject' : 'return', comments: actionReason },
      { onSuccess: () => { setActionDialog(null); setActionReason(''); } }
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Info box */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Apenas solicitações onde você é o aprovador elegível da etapa atual aparecem como pendentes.
            Ações de aprovação, recusa e devolução são exclusivas do aprovador da etapa em curso.
          </p>
        </CardContent>
      </Card>

      {/* Pending for me */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Pendentes para minha aprovação ({myPending.length})
        </h3>
        {myPending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <ClipboardCheck className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente para você</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myPending.map((a: any) => {
              const statusInfo = getStatusBadge(a.status);
              const canReturn = a.approval_flows?.allow_return_for_adjustment;
              const returnModeLabel = a.approval_flows?.return_mode === 'previous_step'
                ? 'Devolver à etapa anterior'
                : 'Devolver ao solicitante';
              const currentStep = a.approval_request_steps?.find((s: any) => s.step_order === a.current_step_order);
              const approverRule = currentStep?.approver_rule;
              return (
                <Card key={a.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{a.approval_modules?.name}</Badge>
                          <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                          {a.current_step_order && (
                            <Badge variant="outline" className="text-[10px]">Etapa {a.current_step_order}</Badge>
                          )}
                          {approverRule && (
                            <Badge variant="outline" className="text-[10px]">{getApproverTypeLabel(approverRule)}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 gap-y-1 text-sm text-muted-foreground flex-wrap min-w-0">
                          <User className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium text-foreground/90 truncate">
                            {a.profiles?.full_name || 'Desconhecido'}
                          </span>
                          <span className="hidden sm:inline">·</span>
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span className="shrink-0">{formatDistanceToNow(getApprovalLastActivityDate(a), { addSuffix: true, locale: ptBR })}</span>
                        </div>
                        {/* Steps timeline */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {[...(Array.isArray(a.approval_request_steps) ? a.approval_request_steps : [])]
                            .sort((x: any, y: any) => x.step_order - y.step_order)
                            .map((step: any) => (
                              <Badge
                                key={step.id}
                                variant={
                                  step.status === 'approved' ? 'default' :
                                  step.status === 'rejected' ? 'destructive' :
                                  step.status === 'returned' ? 'secondary' :
                                  step.step_order === a.current_step_order ? 'secondary' : 'outline'
                                }
                                className="text-[10px] gap-1"
                              >
                                {step.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                                {step.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                {step.status === 'returned' && <RotateCcw className="w-3 h-3" />}
                                {step.step_order}. {step.profiles?.full_name || 'Aprovador'}
                              </Badge>
                            ))
                        }
                        </div>
                      </div>
                      {/* Actions: ONLY for the eligible approver of the current step */}
                      <div className="flex gap-2 shrink-0 flex-wrap items-center">
                        {buildRoute(a) && (
                          <Button size="sm" variant="ghost" onClick={() => navigate(buildRoute(a)!)} className="gap-1">
                            <ExternalLink className="w-4 h-4" /> Detalhes
                          </Button>
                        )}
                        <Button size="default" onClick={() => handleApprove(a.id)} disabled={processAction.isPending} className="gap-1.5 font-semibold">
                          <CheckCircle2 className="w-4 h-4" /> Aprovar
                        </Button>
                        <Button size="default" variant="destructive" onClick={() => { setActionDialog({ id: a.id, type: 'reject' }); setActionReason(''); }} disabled={processAction.isPending} className="gap-1.5 font-semibold">
                          <XCircle className="w-4 h-4" /> Reprovar
                        </Button>
                        {canReturn && (
                          <Button size="default" variant="outline" onClick={() => { setActionDialog({ id: a.id, type: 'return' }); setActionReason(''); }} disabled={processAction.isPending} className="gap-1.5">
                            <RotateCcw className="w-4 h-4" /> Devolver
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending fuel requests (mine) */}
      {(() => {
        const myPendingFuel = (Array.isArray(pendingFuel) ? pendingFuel : []).filter((r: any) => r.requester_user_id === user?.id);
        if (myPendingFuel.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Send className="w-4 h-4" />
              Aguardando encaminhamento ({myPendingFuel.length})
            </h3>
            <div className="space-y-2">
              {myPendingFuel.map((r: any) => (
                <Card key={r.id} className="border-l-4 border-l-amber-400">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{REQUEST_TYPE_LABELS[r.type] || r.type}</Badge>
                      <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Aguardando encaminhamento</Badge>
                      {r.valor && (
                        <span className="text-sm font-semibold">R$ {Number(r.valor).toFixed(2)}</span>
                      )}
                      <span className="text-sm text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* History */}
      {myHistory.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Histórico de aprovações
          </h3>
          <div className="space-y-2">
            {myHistory.map((a: any) => {
              const statusInfo = getStatusBadge(a.status);
              return (
                <Card key={a.id} className={a.ended_at ? 'opacity-70' : ''}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <Badge variant="secondary" className="text-xs">{a.approval_modules?.name}</Badge>
                      <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      <span className="text-sm font-medium text-foreground/80 truncate max-w-[14rem]">
                        {a.profiles?.full_name}
                      </span>
                      {a.current_step_order && !a.ended_at && (
                        <Badge variant="outline" className="text-xs">Etapa {a.current_step_order}</Badge>
                      )}
                      <span className="text-sm text-muted-foreground ml-auto shrink-0">
                        {formatDistanceToNow(getApprovalLastActivityDate(a), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Reject/Return Dialog — justification always mandatory */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === 'reject' ? 'Motivo da Recusa' : 'Motivo da Devolução'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {actionDialog?.type === 'reject'
                ? 'A justificativa é obrigatória para recusar uma solicitação.'
                : 'A justificativa é obrigatória para devolver uma solicitação.'}
            </p>
            <Textarea
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder={actionDialog?.type === 'reject'
                ? 'Informe o motivo da recusa (mínimo 5 caracteres)'
                : 'Informe o motivo da devolução (mínimo 5 caracteres)'}
              rows={4}
            />
            {actionReason.length > 0 && actionReason.length < 5 && (
              <p className="text-xs text-destructive">O motivo deve ter pelo menos 5 caracteres.</p>
            )}
            <Button
              onClick={handleActionConfirm}
              disabled={processAction.isPending || actionReason.trim().length < 5}
              variant={actionDialog?.type === 'reject' ? 'destructive' : 'default'}
              className="w-full"
            >
              {processAction.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {actionDialog?.type === 'reject' ? 'Confirmar recusa' : 'Confirmar devolução'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
