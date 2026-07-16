import { useNavigate } from 'react-router-dom';
import { PurchaseForm } from '../components/PurchaseForm';
import { usePurchaseMutations } from '../hooks/usePurchaseMutations';
import { toast } from 'sonner';

export default function PurchaseFormPage() {
  const navigate = useNavigate();
  const { createPurchase, isCreating } = usePurchaseMutations();

  const handleSubmit = async (data: any) => {
    try {
      const res = await createPurchase(data);
      toast.success('Solicitação de compra salva com sucesso!');
      navigate(`/purchases/${res.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar solicitação');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova Solicitação de Compra</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie um novo rascunho de compra. O fluxo de aprovação só inicia após o envio.
        </p>
      </div>

      <PurchaseForm onSubmit={handleSubmit} isLoading={isCreating} />
    </div>
  );
}
