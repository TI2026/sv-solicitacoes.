import { useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEntityAction } from '@/hooks/useEntityAction';
import type { ApprovalContextData } from '@/modules/fleet/hooks/useApprovalContext';

interface Props {
  moduleKey: string;
  entityId: string;
  context?: ApprovalContextData;
}

type ReasonAction = 'devolver' | 'rejeitar' | 'master_override';

export function WorkflowDecisionActions({ moduleKey, entityId, context }: Props) {
  const mutation = useEntityAction();
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState('');
  const allowed = context?.permissions.allowed_actions ?? [];
  const completionAction = context?.meta.step_action;
  const canApprove = !!completionAction && allowed.includes(completionAction);
  const canReturn = allowed.includes('devolver');
  const canReject = allowed.includes('rejeitar');
  const canMasterOverride = allowed.includes('master_override');

  if (!canApprove && !canReturn && !canReject && !canMasterOverride) return null;

  const execute = async (action: string, notes?: string) => {
    await mutation.mutateAsync({
      moduleKey,
      entityId,
      action,
      payload: notes ? { notes } : {},
    });
  };

  const confirmReason = async () => {
    if (!reasonAction || reason.trim().length < 10) return;
    await execute(reasonAction, reason.trim());
    setReasonAction(null);
    setReason('');
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <Button onClick={() => execute(completionAction!)} disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aprovar etapa
          </Button>
        )}
        {canReturn && (
          <Button variant="outline" onClick={() => setReasonAction('devolver')} disabled={mutation.isPending} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Devolver
          </Button>
        )}
        {canReject && (
          <Button variant="destructive" onClick={() => setReasonAction('rejeitar')} disabled={mutation.isPending} className="gap-2">
            <XCircle className="h-4 w-4" /> Rejeitar
          </Button>
        )}
        {canMasterOverride && (
          <Button variant="outline" onClick={() => setReasonAction('master_override')} disabled={mutation.isPending} className="gap-2 border-amber-500 text-amber-700">
            <ShieldAlert className="h-4 w-4" /> Override Master
          </Button>
        )}
      </div>

      <Dialog open={reasonAction !== null} onOpenChange={(open) => !open && setReasonAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonAction === 'master_override' ? 'Override Master explícito' : reasonAction === 'rejeitar' ? 'Rejeitar solicitação' : 'Devolver solicitação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label>Motivo obrigatório (mínimo 10 caracteres)</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonAction(null)}>Cancelar</Button>
            <Button onClick={confirmReason} disabled={reason.trim().length < 10 || mutation.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
