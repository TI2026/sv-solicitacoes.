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
  const canConfirmPayment = approvalCtx?.permissions.allowed_actions.includes('pagar') ?? false;

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mt-4">
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
