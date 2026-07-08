import { useFleetDetail } from '../contexts/FleetDetailContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, DollarSign } from 'lucide-react';

export function FleetPaymentBlock() {
  const {
    req, reqType, isPending,
    // [Sprint 2 — Onda 2] Fonte canônica substitui: isCompras, isFinanceiro, hasActiveFlow
    approvalCtx,
    ocNumber, setOcNumber, ocNotes, setOcNotes,
    paymentNotes, setPaymentNotes,
    showOcDialog, setShowOcDialog,
    showPaymentDialog, setShowPaymentDialog,
    handleOcSubmit, handlePaymentConfirm,
  } = useFleetDetail();

  if (!req) return null;

  const requiresOC = reqType !== 'reembolso'; // Reembolso skips OC
  // [Sprint 2 — Onda 2] ctx.permissions é a fonte única — zero IF de cargo
  const canGenerateOC     = approvalCtx?.permissions.generate_oc ?? false;
  const canConfirmPayment = approvalCtx?.permissions.confirm_payment ?? false;

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mt-4">
        {canGenerateOC && requiresOC && (
          <Button onClick={() => setShowOcDialog(true)} disabled={isPending} className="gap-2 w-full sm:w-auto">
            Registrar OC e Liberar para Pagamento
          </Button>
        )}

        {canConfirmPayment && !requiresOC && (
          <Button onClick={() => setShowPaymentDialog(true)} disabled={isPending} className="gap-2 w-full sm:w-auto">
            <DollarSign className="w-4 h-4" /> Registrar Pagamento
          </Button>
        )}

        {canConfirmPayment && requiresOC && (
          <Button onClick={() => setShowPaymentDialog(true)} disabled={isPending} className="gap-2 w-full sm:w-auto">
            <CheckCircle2 className="w-4 h-4" /> Confirmar Pagamento
          </Button>
        )}
      </div>

      {/* OC Dialog */}
      <Dialog open={showOcDialog} onOpenChange={setShowOcDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Ordem de Compra (OC)</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Número da OC *</Label>
              <Input value={ocNumber} onChange={e => setOcNumber(e.target.value)} placeholder="Ex: OC-12345" />
            </div>
            <div className="space-y-2">
              <Label>Observações (Opcional)</Label>
              <Textarea value={ocNotes} onChange={e => setOcNotes(e.target.value)} placeholder="Detalhes sobre a OC..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOcDialog(false)}>Cancelar</Button>
            <Button onClick={handleOcSubmit} disabled={isPending || !ocNumber.trim()}>Confirmar OC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Observações de Pagamento (Opcional)</Label>
              <Textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Comprovante anexo, NSU, etc..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={handlePaymentConfirm} disabled={isPending}>Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
