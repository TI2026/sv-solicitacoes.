import { useFleetDetail } from '../contexts/FleetDetailContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DollarSign, FileCheck2, Loader2 } from 'lucide-react';

export function FleetPaymentBlock() {
  const {
    req, isPending, attachments, uploading, handleUpload,
    // [Sprint 2 — Onda 2] Fonte canônica substitui: isCompras, isFinanceiro, hasActiveFlow
    approvalCtx,
    paymentNotes, setPaymentNotes,
    showPaymentDialog, setShowPaymentDialog,
    handlePaymentConfirm,
  } = useFleetDetail();

  if (!req) return null;

  const canConfirmPayment = approvalCtx?.permissions.allowed_actions.includes('pagar') ?? false;
  const paymentProof = attachments.find((attachment: any) => attachment.type === 'comprovante_pagamento');

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mt-4">
        {canConfirmPayment && (
          <Button onClick={() => setShowPaymentDialog(true)} disabled={isPending} className="gap-2 w-full sm:w-auto">
            <DollarSign className="w-4 h-4" /> Confirmar Pagamento
          </Button>
        )}
      </div>



      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Comprovante bancário do pagamento *</Label>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => handleUpload(event, 'comprovante_pagamento')}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">
                {paymentProof ? 'Comprovante anexado e vinculado a esta solicitação.' : 'Não confundir com nota fiscal ou comprovante da despesa.'}
              </p>
              {paymentProof && <p className="flex items-center gap-1 text-xs text-emerald-700"><FileCheck2 className="h-3.5 w-3.5" /> Evidência pronta para auditoria</p>}
            </div>
            <div className="space-y-2">
              <Label>Observações de Pagamento (Opcional)</Label>
              <Textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Comprovante anexo, NSU, etc..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handlePaymentConfirm} disabled={isPending || uploading || !paymentProof}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
