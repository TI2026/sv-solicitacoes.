import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, RotateCcw, ShoppingCart, CreditCard, Truck, PackageCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ApprovalContextData } from '@/modules/fleet/hooks/useApprovalContext';
import { usePurchaseOperationalActions } from '../hooks/usePurchaseOperationalActions';

interface PurchaseApprovalBlockProps {
  purchaseId: string;
  approvalCtx: ApprovalContextData;
  approvalRequestId?: string | null;
  onActionCompleted?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho:             { label: 'Rascunho',             color: 'bg-gray-100 text-gray-700' },
  em_aprovacao:         { label: 'Em Aprovação',         color: 'bg-amber-100 text-amber-800' },
  aprovado:             { label: 'Aprovado',             color: 'bg-emerald-100 text-emerald-800' },
  retornado:            { label: 'Devolvido',            color: 'bg-orange-100 text-orange-800' },
  rejeitado:            { label: 'Rejeitado',            color: 'bg-red-100 text-red-800' },
  cancelado:            { label: 'Cancelado',            color: 'bg-red-100 text-red-800' },
  aguardando_pagamento: { label: 'Aguardando Pagamento', color: 'bg-blue-100 text-blue-800' },
  aguardando_entrega:   { label: 'Aguardando Entrega',  color: 'bg-indigo-100 text-indigo-800' },
  entregue:             { label: 'Entregue',             color: 'bg-violet-100 text-violet-800' },
  concluido:            { label: 'Concluído',            color: 'bg-emerald-100 text-emerald-800' },
};

export function PurchaseApprovalBlock({
  purchaseId,
  approvalCtx,
  approvalRequestId,
  onActionCompleted,
}: PurchaseApprovalBlockProps) {
  const actions = usePurchaseOperationalActions(purchaseId);

  // Dialog state
  const [actionDialog, setActionDialog] = useState<
    null | 'approve' | 'reject' | 'return' | 'oc' | 'payment' | 'delivery' | 'receipt' | 'cancel'
  >(null);

  // Form fields
  const [comments, setComments]             = useState('');
  const [ocNumber, setOcNumber]             = useState('');
  const [supplier, setSupplier]             = useState('');
  const [approvedValue, setApprovedValue]   = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDate, setDeliveryDate]     = useState('');
  const [trackingCode, setTrackingCode]     = useState('');
  const [notes, setNotes]                   = useState('');

  const perm = approvalCtx.permissions;
  const allowedActions = perm.allowed_actions || [];
  const status = approvalCtx.status;

  const statusInfo = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-700' };

  const resetAndClose = () => {
    setActionDialog(null);
    setComments('');
    setOcNumber('');
    setSupplier('');
    setApprovedValue('');
    setDeliveryAddress('');
    setDeliveryDate('');
    setTrackingCode('');
    setNotes('');
  };

  const handleAction = async () => {
    try {
      switch (actionDialog) {
        case 'approve':
          if (!approvalRequestId) throw new Error('ID do fluxo de aprovação ausente');
          await actions.approvalAction.mutateAsync({
            approvalRequestId,
            action: 'approve',
            comments,
          });
          toast.success('Compra aprovada com sucesso!');
          break;

        case 'reject':
          if (!approvalRequestId) throw new Error('ID do fluxo de aprovação ausente');
          if (!comments.trim()) { toast.error('Justificativa obrigatória para rejeitar.'); return; }
          await actions.approvalAction.mutateAsync({
            approvalRequestId,
            action: 'reject',
            comments,
          });
          toast.success('Solicitação rejeitada.');
          break;

        case 'return':
          if (!approvalRequestId) throw new Error('ID do fluxo de aprovação ausente');
          if (!comments.trim()) { toast.error('Justificativa obrigatória para devolver.'); return; }
          await actions.approvalAction.mutateAsync({
            approvalRequestId,
            action: 'return',
            comments,
          });
          toast.success('Solicitação devolvida para ajuste.');
          break;

        case 'oc': {
          if (!ocNumber.trim()) { toast.error('Número da OC obrigatório.'); return; }
          if (!supplier.trim()) { toast.error('Fornecedor obrigatório.'); return; }
          const val = parseFloat(approvedValue);
          if (isNaN(val) || val < 0) { toast.error('Valor final inválido.'); return; }
          await actions.advanceToOc.mutateAsync({
            requestId:      purchaseId,
            ocNumber:       ocNumber.trim(),
            supplier:       supplier.trim(),
            approvedValue:  val,
            notes:          notes.trim() || undefined,
            deliveryAddress: deliveryAddress.trim() || undefined,
            deliveryDate:   deliveryDate || undefined,
            trackingCode:   trackingCode.trim() || undefined,
          });
          toast.success('Ordem de Compra gerada!');
          break;
        }

        case 'payment':
          await actions.confirmPayment.mutateAsync({
            requestId: purchaseId,
            notes:     notes.trim() || undefined,
          });
          toast.success('Pagamento confirmado!');
          break;

        case 'delivery':
          await actions.confirmDelivery.mutateAsync({
            requestId:      purchaseId,
            deliveryAddress: deliveryAddress.trim() || undefined,
            deliveryDate:   deliveryDate || undefined,
            notes:          notes.trim() || undefined,
            trackingCode:   trackingCode.trim() || undefined,
          });
          toast.success('Entrega confirmada!');
          break;

        case 'receipt':
          await actions.confirmReceipt.mutateAsync({
            requestId: purchaseId,
            notes:     notes.trim() || undefined,
          });
          toast.success('Recebimento confirmado! Compra concluída.');
          break;

        case 'cancel':
          if (!comments.trim()) { toast.error('Justificativa obrigatória para cancelar.'); return; }
          await actions.cancelPurchase.mutateAsync({
            requestId: purchaseId,
            reason:    comments.trim(),
          });
          toast.success('Solicitação cancelada.');
          break;
      }

      resetAndClose();
      onActionCompleted?.();
    } catch (err: any) {
      toast.error(err.message || 'Ocorreu um erro ao processar a ação.');
    }
  };

  const isLoading =
    actions.isActingApproval ||
    actions.isAdvancingToOc ||
    actions.isConfirmingPayment ||
    actions.isConfirmingDelivery ||
    actions.isConfirmingReceipt ||
    actions.isCanceling;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Status da Solicitação</CardTitle>
            <Badge className={`text-xs ${statusInfo.color} border-0`}>{statusInfo.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Informação de Etapa */}
          {approvalCtx.is_in_flow && approvalCtx.flow?.current_step_name && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">Etapa {approvalCtx.flow.current_step}/{approvalCtx.flow.total_steps}:</span>{' '}
                {approvalCtx.flow.current_step_name}
                {approvalCtx.meta?.reason_blocked && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    {approvalCtx.meta.reason_blocked}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Ações de Aprovação (Motor Canônico) */}
          {(perm.approve || perm.reject || perm.return) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ações de Aprovação</p>
              <div className="flex flex-wrap gap-2">
                {perm.approve && (
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionDialog('approve')}>
                    <CheckCircle2 className="w-4 h-4" /> Aprovar
                  </Button>
                )}
                {perm.return && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setActionDialog('return')}>
                    <RotateCcw className="w-4 h-4" /> Devolver
                  </Button>
                )}
                {perm.reject && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-700 border-red-300 hover:bg-red-50" onClick={() => setActionDialog('reject')}>
                    <XCircle className="w-4 h-4" /> Rejeitar
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Ações Operacionais (allowed_actions do Motor) */}
          {(allowedActions.includes('generate_oc') || allowedActions.includes('confirm_payment') ||
            allowedActions.includes('confirm_delivery') || allowedActions.includes('confirm_receipt')) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ações Operacionais</p>
              <div className="flex flex-wrap gap-2">
                {allowedActions.includes('generate_oc') && (
                  <Button size="sm" className="gap-1.5" onClick={() => setActionDialog('oc')}>
                    <ShoppingCart className="w-4 h-4" /> Gerar Ordem de Compra
                  </Button>
                )}
                {allowedActions.includes('confirm_payment') && (
                  <Button size="sm" className="gap-1.5" onClick={() => setActionDialog('payment')}>
                    <CreditCard className="w-4 h-4" /> Confirmar Pagamento
                  </Button>
                )}
                {allowedActions.includes('confirm_delivery') && (
                  <Button size="sm" className="gap-1.5" onClick={() => setActionDialog('delivery')}>
                    <Truck className="w-4 h-4" /> Confirmar Entrega
                  </Button>
                )}
                {allowedActions.includes('confirm_receipt') && (
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionDialog('receipt')}>
                    <PackageCheck className="w-4 h-4" /> Confirmar Recebimento
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Cancelamento */}
          {perm.cancel && (
            <div className="pt-2 border-t">
              <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setActionDialog('cancel')}>
                <XCircle className="w-4 h-4" /> Cancelar Solicitação
              </Button>
            </div>
          )}

          {/* Sem ações disponíveis */}
          {!perm.approve && !perm.reject && !perm.return && !perm.cancel &&
           allowedActions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhuma ação disponível para seu perfil nesta etapa.
            </p>
          )}

        </CardContent>
      </Card>

      {/* ── Diálogo de Confirmação ─────────────────────────────── */}
      <Dialog open={actionDialog !== null} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' && 'Confirmar Aprovação'}
              {actionDialog === 'reject' && 'Rejeitar Solicitação'}
              {actionDialog === 'return' && 'Devolver para Ajuste'}
              {actionDialog === 'oc' && 'Gerar Ordem de Compra'}
              {actionDialog === 'payment' && 'Confirmar Pagamento'}
              {actionDialog === 'delivery' && 'Confirmar Entrega'}
              {actionDialog === 'receipt' && 'Confirmar Recebimento'}
              {actionDialog === 'cancel' && 'Cancelar Solicitação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Campos da OC */}
            {actionDialog === 'oc' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="oc-number">Número da OC *</Label>
                  <Input id="oc-number" value={ocNumber} onChange={e => setOcNumber(e.target.value)} placeholder="OC-2025-001" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-supplier">Fornecedor *</Label>
                  <Input id="oc-supplier" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nome do fornecedor" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-value">Valor Final (R$) *</Label>
                  <Input id="oc-value" type="number" min="0" step="0.01" value={approvedValue} onChange={e => setApprovedValue(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-address">Local de Entrega</Label>
                  <Input id="oc-address" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Endereço de entrega" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-date">Data Prevista de Entrega</Label>
                  <Input id="oc-date" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-tracking">Código de Rastreio</Label>
                  <Input id="oc-tracking" value={trackingCode} onChange={e => setTrackingCode(e.target.value)} placeholder="Código de rastreio (opcional)" />
                </div>
              </>
            )}

            {/* Campos de Entrega */}
            {actionDialog === 'delivery' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="del-address">Local de Entrega</Label>
                  <Input id="del-address" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="del-date">Data de Entrega</Label>
                  <Input id="del-date" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="del-tracking">Código de Rastreio</Label>
                  <Input id="del-tracking" value={trackingCode} onChange={e => setTrackingCode(e.target.value)} />
                </div>
              </>
            )}

            {/* Observações */}
            {(['payment', 'delivery', 'receipt'].includes(actionDialog || '')) && (
              <div className="space-y-1">
                <Label htmlFor="action-notes">Observações</Label>
                <Textarea id="action-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações opcionais..." />
              </div>
            )}

            {/* Justificativa obrigatória */}
            {(['reject', 'return', 'cancel'].includes(actionDialog || '')) && (
              <div className="space-y-1">
                <Label htmlFor="action-comments">Justificativa *</Label>
                <Textarea
                  id="action-comments"
                  rows={3}
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder={
                    actionDialog === 'reject' ? 'Motivo da rejeição...' :
                    actionDialog === 'return' ? 'O que precisa ser ajustado...' :
                    'Motivo do cancelamento...'
                  }
                />
              </div>
            )}

            {/* Confirmação de aprovação */}
            {actionDialog === 'approve' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Confirma a aprovação desta solicitação de compra? Esta ação avançará o fluxo para a próxima etapa.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="approve-notes">Observações (opcional)</Label>
                  <Textarea id="approve-notes" rows={2} value={comments} onChange={e => setComments(e.target.value)} placeholder="Observações opcionais..." />
                </div>
              </>
            )}

            {/* Confirmação de recebimento */}
            {actionDialog === 'receipt' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Confirma que o item foi recebido corretamente? Isso encerrará a solicitação.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="receipt-notes">Observações (opcional)</Label>
                  <Textarea id="receipt-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações opcionais..." />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetAndClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleAction}
              disabled={isLoading}
              className={
                ['reject', 'return', 'cancel'].includes(actionDialog || '') ? 'bg-red-600 hover:bg-red-700' :
                actionDialog === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : ''
              }
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
