import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Clock, CheckCircle2, XCircle, RotateCcw, ClipboardCheck, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyApprovals, useProcessApproval } from '../hooks/usePermissionsData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approved: { label: 'Aprovado', variant: 'default' },
  rejected: { label: 'Recusado', variant: 'destructive' },
  returned_for_adjustment: { label: 'Devolvido', variant: 'secondary' },
  pending_approval: { label: 'Pendente', variant: 'outline' },
};

function getStatusBadge(status: string) {
  if (status.startsWith('awaiting_step_')) {
    return { label: `Etapa ${status.replace('awaiting_step_', '')}`, variant: 'outline' as const };
  }
  return STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
}

export default function MyApprovalsTab() {
  const { user } = useAuth();
  const { data: approvals, isLoading } = useMyApprovals(user?.id);
  const processAction = useProcessApproval();
  const [actionDialog, setActionDialog] = useState<{ id: string; type: 'reject' | 'return' } | null>(null);
  const [actionReason, setActionReason] = useState('');

  const myPending = approvals?.filter((a: any) => a.current_approver_user_id === user?.id && !a.ended_at) || [];
  const otherApprovals = approvals?.filter((a: any) => !(a.current_approver_user_id === user?.id && !a.ended_at)) || [];

  const handleApprove = (id: string) => {
    processAction.mutate({ approvalRequestId: id, action: 'approve' });
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
              <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myPending.map((a: any) => {
              const statusInfo = getStatusBadge(a.status);
              const canReturn = a.approval_flows?.allow_return_for_adjustment;
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
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span>Solicitante: {a.profiles?.full_name || 'Desconhecido'}</span>
                          <span>·</span>
                          <Clock className="w-3 h-3" />
                          <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}</span>
                        </div>
                        {/* Steps timeline */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {a.approval_request_steps
                            ?.sort((x: any, y: any) => x.step_order - y.step_order)
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
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        <Button size="sm" onClick={() => handleApprove(a.id)} disabled={processAction.isPending} className="gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setActionDialog({ id: a.id, type: 'reject' }); setActionReason(''); }} disabled={processAction.isPending} className="gap-1">
                          <XCircle className="w-4 h-4" /> Recusar
                        </Button>
                        {canReturn && (
                          <Button size="sm" variant="outline" onClick={() => { setActionDialog({ id: a.id, type: 'return' }); setActionReason(''); }} disabled={processAction.isPending} className="gap-1">
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

      {/* Other approvals */}
      {otherApprovals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Histórico de aprovações
          </h3>
          <div className="space-y-2">
            {otherApprovals.map((a: any) => {
              const statusInfo = getStatusBadge(a.status);
              return (
                <Card key={a.id} className={a.ended_at ? 'opacity-70' : ''}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{a.approval_modules?.name}</Badge>
                      <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {a.profiles?.full_name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Reject/Return Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === 'reject' ? 'Motivo da Recusa' : 'Motivo da Devolução'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
