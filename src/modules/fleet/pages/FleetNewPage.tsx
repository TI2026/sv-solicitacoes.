import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateFuelRequest, useFuelSetStatus } from '../hooks/useFleetQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Send } from 'lucide-react';

export default function FleetNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createMutation = useCreateFuelRequest();
  const statusMutation = useFuelSetStatus();
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!user || !valor || !data) return;
    setSubmitting(true);
    try {
      const result = await createMutation.mutateAsync({
        valor: parseFloat(valor),
        data_abastecimento: data,
        notes,
        requester_user_id: user.id,
      });
      if (sendImmediately && result?.id) {
        await statusMutation.mutateAsync({ requestId: result.id, toStatus: 'enviado' });
      }
      navigate('/fleet');
    } catch {
      // toast handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova Solicitação</CardTitle>
          <CardDescription>Abastecimento ou reembolso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Valor (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Data do abastecimento *</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting || !valor}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting || !valor} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Send className="w-4 h-4" />
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
