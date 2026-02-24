import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createRequest } from '@/lib/store';
import { RequestType, REQUEST_TYPE_LABELS, REIMBURSEMENT_CATEGORIES, ALLOWANCE_CATEGORIES } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Fuel, Receipt, Banknote, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const typeOptions: { value: RequestType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'FUEL', label: 'Abastecimento', icon: <Fuel className="w-5 h-5" />, desc: 'Registro de abastecimento de veículo' },
  { value: 'REIMBURSEMENT', label: 'Reembolso', icon: <Receipt className="w-5 h-5" />, desc: 'Solicitação de reembolso de despesa' },
  { value: 'ALLOWANCE', label: 'Diária', icon: <Banknote className="w-5 h-5" />, desc: 'Solicitação de pagamento de diária' },
];

export default function NewRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [type, setType] = useState<RequestType | null>(null);
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [valor, setValor] = useState('');
  const [category, setCategory] = useState('');
  const [descricao, setDescricao] = useState('');

  const categories = type === 'REIMBURSEMENT' ? REIMBURSEMENT_CATEGORIES : type === 'ALLOWANCE' ? ALLOWANCE_CATEGORIES : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !type) return;

    const valorNum = parseFloat(valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({ title: 'Erro', description: 'Valor inválido', variant: 'destructive' });
      return;
    }

    createRequest({
      type,
      category: type === 'FUEL' ? 'Abastecimento' : category,
      solicitanteId: user.id,
      veiculoPlaca: type === 'FUEL' ? placa : undefined,
      kmAtual: type === 'FUEL' ? parseInt(km) : undefined,
      valor: valorNum,
      descricao,
    });

    toast({ title: 'Sucesso', description: 'Solicitação criada com sucesso!' });
    navigate('/dashboard');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {/* Type selection */}
      {!type ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Nova Solicitação</h2>
            <p className="text-sm text-muted-foreground mt-1">Selecione o tipo de solicitação</p>
          </div>
          <div className="grid gap-3">
            {typeOptions.map(opt => (
              <Card
                key={opt.value}
                className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
                onClick={() => setType(opt.value)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {opt.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{opt.label}</p>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <button onClick={() => setType(null)} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <CardTitle>{REQUEST_TYPE_LABELS[type]}</CardTitle>
                <CardDescription>Preencha os dados da solicitação</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {type === 'FUEL' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="placa">Placa do veículo</Label>
                    <Input id="placa" value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-1234" required maxLength={8} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="km">KM Atual</Label>
                    <Input id="km" type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="45000" required />
                  </div>
                </div>
              )}

              {(type === 'REIMBURSEMENT' || type === 'ALLOWANCE') && (
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory} required>
                    <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input id="valor" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição (opcional)</Label>
                <Textarea id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva a solicitação..." rows={3} />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setType(null)} className="flex-1">Cancelar</Button>
                <Button type="submit" className="flex-1">Criar solicitação</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
