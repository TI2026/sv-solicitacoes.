import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateFuelRequest, useFuelSetStatus } from '../hooks/useFleetQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REEMBOLSO_CATEGORIAS, DIARIA_CATEGORIAS } from '@/lib/constants';
import { ArrowLeft, Loader2, Send } from 'lucide-react';

export default function FleetNewPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'abastecimento';
  const createMutation = useCreateFuelRequest();
  const statusMutation = useFuelSetStatus();
  const [submitting, setSubmitting] = useState(false);

  // Shared
  const [type] = useState(initialType);
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Abastecimento
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [motivo, setMotivo] = useState('');

  // Reembolso
  const [categoria, setCategoria] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [pixKey, setPixKey] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAgency, setBankAgency] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  // Diária
  const [dailyCategory, setDailyCategory] = useState('');
  const [personName, setPersonName] = useState('');
  const [personCpf, setPersonCpf] = useState('');
  const [hours, setHours] = useState('');
  const [dailyValue, setDailyValue] = useState('');

  const canCreateDiaria = hasAnyRole(['diretoria', 'administrativo']);
  if (type === 'diaria' && !canCreateDiaria) {
    navigate('/fleet');
    return null;
  }

  const isValid = () => {
    if (type === 'abastecimento') return !!valor && !!placa && !!data;
    if (type === 'reembolso') return !!valor && !!categoria && !!data && (paymentMethod === 'pix' ? !!pixKey : !!bankName);
    if (type === 'diaria') return !!dailyCategory && !!personName && !!dailyValue && !!data;
    return false;
  };

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!user || !isValid()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        requester_user_id: user.id,
        data_abastecimento: data,
        notes: notes || null,
        type,
        status: type === 'diaria' ? 'ativa' : 'rascunho',
      };

      if (type === 'abastecimento') {
        payload.valor = parseFloat(valor);
        payload.placa = placa;
        payload.km = km;
        payload.motivo = motivo;
      } else if (type === 'reembolso') {
        payload.valor = parseFloat(valor);
        payload.categoria = categoria;
        payload.payment_method = paymentMethod;
        payload.pix_key = paymentMethod === 'pix' ? pixKey : null;
        payload.bank_name = paymentMethod === 'banco' ? bankName : null;
        payload.bank_agency = paymentMethod === 'banco' ? bankAgency : null;
        payload.bank_account = paymentMethod === 'banco' ? bankAccount : null;
      } else {
        payload.valor = parseFloat(dailyValue);
        payload.daily_category = dailyCategory;
        payload.person_name = personName;
        payload.person_cpf = personCpf || null;
        payload.hours = hours ? parseFloat(hours) : null;
        payload.daily_value = parseFloat(dailyValue);
      }

      const result = await createMutation.mutateAsync(payload);
      if (sendImmediately && result?.id && type !== 'diaria') {
        await statusMutation.mutateAsync({ requestId: result.id, toStatus: 'enviado' });
      }
      navigate('/fleet');
    } catch {
      // toast handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabels: Record<string, string> = { abastecimento: 'Abastecimento', reembolso: 'Reembolso', diaria: 'Diária' };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova Solicitação — {typeLabels[type]}</CardTitle>
          <CardDescription>
            {type === 'abastecimento' && 'Solicitação de abastecimento de combustível'}
            {type === 'reembolso' && 'Solicitação de reembolso de despesas'}
            {type === 'diaria' && 'Registro de diária de prestador'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Abastecimento fields */}
          {type === 'abastecimento' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placa *</Label>
                  <Input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-1234" />
                </div>
                <div className="space-y-2">
                  <Label>KM</Label>
                  <Input value={km} onChange={e => setKm(e.target.value)} placeholder="12345" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo do abastecimento" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Reembolso fields */}
          {type === 'reembolso' && (
            <>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {REEMBOLSO_CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="banco">Dados Bancários</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === 'pix' ? (
                <div className="space-y-2">
                  <Label>Chave PIX *</Label>
                  <Input value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Banco *</Label>
                    <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Banco" />
                  </div>
                  <div className="space-y-2">
                    <Label>Agência</Label>
                    <Input value={bankAgency} onChange={e => setBankAgency(e.target.value)} placeholder="0001" />
                  </div>
                  <div className="space-y-2">
                    <Label>Conta</Label>
                    <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="12345-6" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Diária fields */}
          {type === 'diaria' && (
            <>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select value={dailyCategory} onValueChange={setDailyCategory}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {DIARIA_CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Nome do prestador" />
                </div>
                <div className="space-y-2">
                  <Label>CPF (opcional)</Label>
                  <Input value={personCpf} onChange={e => setPersonCpf(e.target.value)} placeholder="000.000.000-00" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Horas</Label>
                  <Input type="number" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="8" />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={dailyValue} onChange={e => setDailyValue(e.target.value)} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            {type === 'diaria' ? (
              <Button onClick={() => handleSubmit(false)} disabled={submitting || !isValid()} className="gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar Diária
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting || !isValid()}>
                  {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Salvar Rascunho
                </Button>
                <Button onClick={() => handleSubmit(true)} disabled={submitting || !isValid()} className="gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Send className="w-4 h-4" /> Enviar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
