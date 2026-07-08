import { useFleetDetail } from '../contexts/FleetDetailContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';

export function FleetApprovalAction() {
  const {
    req, reqType, isPending,
    // [Sprint 2 — Onda 2] Fonte canônica substitui: isCurrentFlowApprover, flowAllowsReturn, hasActiveFlow, isAdmin
    approvalCtx,
    reembChecklist, setReembChecklist, reembChecklistComplete,
    handleApprovalAction, showReasonDialog, setShowReasonDialog,
    actionReason, setActionReason
  } = useFleetDetail();

  if (!req) return null;

  // [Sprint 2 — Onda 2] ctx.permissions é a única fonte de verdade para exibir botões.
  const canApprove = approvalCtx?.permissions.approve ?? false;
  const canReject  = approvalCtx?.permissions.reject  ?? false;
  const canReturn  = approvalCtx?.permissions.return  ?? false;
  const isGlobalViewer = approvalCtx?.visibility.mode === 'global';
  const isInFlow   = approvalCtx?.is_in_flow ?? false;
  const reasonBlocked = approvalCtx?.meta.reason_blocked;

  const handleReasonConfirm = () => {
    if (!showReasonDialog) return;
    if (canApprove) {
      if (showReasonDialog === 'reprovado') {
        handleApprovalAction('reject', actionReason);
      } else if (showReasonDialog === 'retornado') {
        handleApprovalAction('return', actionReason);
      }
    }
  };

  return (
    <>
      {/* [Sprint 2 — Onda 2] Botões de ação: ctx.permissions.approve é a fonte de verdade */}
      {canApprove && (
        <div className="space-y-3 mt-4">
          {reqType === 'reembolso' && (
            <div className="space-y-2 border border-amber-300/60 rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Checklist obrigatório antes de aprovar
              </p>
              <div className="space-y-1.5 text-xs">
                {[
                  { key: 'valorConfere', label: 'Valor confere com o comprovante' },
                  { key: 'beneficiarioConfere', label: 'Beneficiário e CPF conferidos' },
                  { key: 'comprovanteOk', label: 'Comprovante anexado e legível' },
                  { key: 'categoriaOk', label: 'Categoria de despesa correta' },
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={(reembChecklist as any)[item.key]}
                      onCheckedChange={(v) => setReembChecklist(prev => ({ ...prev, [item.key]: !!v }))}
                    />
                    <span className="text-foreground">{item.label}</span>
                  </label>
                ))}
              </div>
              {!reembChecklistComplete && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Marque todos os itens para liberar a aprovação.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <Button
                onClick={() => handleApprovalAction('approve')}
                disabled={isPending || (reqType === 'reembolso' && !reembChecklistComplete)}
                className="gap-2"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Aprovar
              </Button>
            )}
            {canReject && (
              <Button onClick={() => setShowReasonDialog('reprovado')} variant="destructive" className="gap-2" disabled={isPending}>
                <XCircle className="w-4 h-4" /> Reprovar
              </Button>
            )}
            {canReturn && (
              <Button onClick={() => setShowReasonDialog('retornado')} variant="outline" className="gap-2" disabled={isPending}>
                <RotateCcw className="w-4 h-4" /> Devolver
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sem fluxo ativo: aviso apenas para quem tem visão global */}
      {isInFlow && !canApprove && isGlobalViewer && !reasonBlocked && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 mt-4">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Sem fluxo de aprovação ativo</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Esta solicitação está em aprovação mas não possui fluxo ativo. Configure um fluxo em
            Permissões &gt; Cadeias de Aprovação para que a decisão possa ser registrada pelo motor.
          </AlertDescription>
        </Alert>
      )}

      {/* [Sprint 2 — Onda 2] meta.reason_blocked vem pronto do backend — zero IF de cargo */}
      {isInFlow && !canApprove && reasonBlocked && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 mt-4">
          {reasonBlocked}
        </p>
      )}

      {/* Reason Dialog for Reject/Return */}
      <Dialog open={!!showReasonDialog} onOpenChange={(open) => !open && setShowReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showReasonDialog === 'reprovado' ? 'Motivo da Reprovação' : 'Motivo da Devolução'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Justificativa (obrigatória)</Label>
            <Textarea
              className="mt-2"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Digite o motivo detalhado..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonDialog(null)}>Cancelar</Button>
            <Button onClick={handleReasonConfirm} disabled={!actionReason.trim() || isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
