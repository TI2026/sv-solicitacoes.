import { useParams, useNavigate } from 'react-router-dom';
import { usePurchase } from '../hooks/usePurchase';
import { usePurchaseMutations } from '../hooks/usePurchaseMutations';
import { useApprovalContext } from '@/modules/fleet/hooks/useApprovalContext';
import { PurchaseDetails } from '../components/PurchaseDetails';
import { PurchaseForm } from '../components/PurchaseForm';
import { PurchaseApprovalBlock } from '../components/PurchaseApprovalBlock';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Send, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

/**
 * PurchaseDetailPage — Sprint 15
 *
 * B2 Fix: integra o Motor de Aprovação (useApprovalContext) ao módulo Compras.
 * PurchaseApprovalBlock renderiza ações baseadas no approvalCtx.permissions,
 * incluindo ações operacionais pós-aprovação (OC, Pagamento, Entrega, Recebimento).
 *
 * - Rascunho/Retornado: exibe PurchaseForm editável + botões de envio/cancelamento.
 * - Em fluxo: exibe PurchaseDetails somente-leitura + PurchaseApprovalBlock com ações.
 * - Concluído/Cancelado/Rejeitado: exibe PurchaseDetails somente-leitura sem ações.
 */
export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: purchase, isLoading, isError, refetch } = usePurchase(id);

  const { updatePurchase, submitPurchase, isUpdating, isSubmitting } = usePurchaseMutations();

  // Motor de Aprovação — fonte canônica de permissões e ações disponíveis
  const {
    data: approvalCtx,
    isLoading: approvalCtxLoading,
    error: approvalCtxError,
  } = useApprovalContext(id, 'compras');

  // ── Estados derivados ─────────────────────────────────────
  const isEditable = purchase?.status === 'rascunho' || purchase?.status === 'retornado';
  const isTerminal  = ['concluido', 'cancelado', 'rejeitado'].includes(purchase?.status || '');
  const hasActiveFlow = purchase?.approval_request_id != null && !isEditable && !isTerminal;

  // ── Handlers ──────────────────────────────────────────────
  const handleUpdate = async (data: any) => {
    if (!id) return;
    try {
      await updatePurchase({ id, data });
      toast.success('Compra atualizada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar compra');
    }
  };

  const handleSubmitFlow = async () => {
    if (!id) return;
    try {
      await submitPurchase(id);
      toast.success('Solicitação enviada para aprovação!');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicitação');
    }
  };

  // ── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !purchase) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Solicitação não encontrada</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/purchases')}>
          Voltar para Lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-24 max-w-7xl mx-auto">

      {/* ── Cabeçalho ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Compra {purchase.id.split('-')[0].toUpperCase()}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {purchase.description}
            </p>
          </div>
        </div>

        {/* Botões de envio (apenas no modo edição) */}
        {isEditable && (
          <div className="flex gap-2">
            <Button
              onClick={handleSubmitFlow}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar para Aprovação
            </Button>
          </div>
        )}
      </div>

      {/* ── Aviso de erro do contexto de aprovação (não esconder) ── */}
      {approvalCtxError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar contexto de aprovação: {approvalCtxError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Layout principal ──────────────────────────────── */}
      <div className={`grid gap-6 ${hasActiveFlow || (approvalCtx && !isEditable) ? 'lg:grid-cols-3' : ''}`}>

        {/* ── Formulário / Detalhes ──────────────────────── */}
        <div className={hasActiveFlow || (approvalCtx && !isEditable) ? 'lg:col-span-2' : ''}>
          {isEditable ? (
            <PurchaseForm
              initialData={purchase}
              onSubmit={handleUpdate}
              isLoading={isUpdating}
            />
          ) : (
            <PurchaseDetails purchase={purchase} />
          )}
        </div>

        {/* ── Bloco de Aprovação / Ações Operacionais ───── */}
        {!isEditable && (
          <div className="space-y-4">
            {approvalCtxLoading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : approvalCtx ? (
              <PurchaseApprovalBlock
                purchaseId={purchase.id}
                approvalCtx={approvalCtx}
                approvalRequestId={purchase.approval_request_id}
                onActionCompleted={refetch}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
