import { useParams, useNavigate } from 'react-router-dom';
import { usePurchase } from '../hooks/usePurchase';
import { usePurchaseMutations } from '../hooks/usePurchaseMutations';
import { PurchaseDetails } from '../components/PurchaseDetails';
import { PurchaseForm } from '../components/PurchaseForm';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: purchase, isLoading, isError } = usePurchase(id);
  const { updatePurchase, submitPurchase, isUpdating, isSubmitting } = usePurchaseMutations();

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

  const isEditable = purchase.status === 'rascunho' || purchase.status === 'retornado';

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
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicitação');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Solicitação {purchase.id.split('-')[0].toUpperCase()}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualização de Compra
            </p>
          </div>
        </div>
        
        {isEditable && (
          <Button onClick={handleSubmitFlow} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar para Aprovação
          </Button>
        )}
      </div>

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
  );
}
