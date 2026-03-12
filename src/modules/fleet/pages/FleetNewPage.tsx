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
import { MoneyInput } from '@/components/MoneyInput';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { maskCPF, maskPhone, maskKM, maskAgency, maskAccount, minDateToday, todayBR, isValidPlate, isValidCPF } from '@/lib/masks';

export default function FleetNewPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'abastecimento';
  const createMutation = useCreateFuelRequest();
  const statusMutation = useFuelSetStatus();
  const [submitting, setSubmitting] = useState(false);

  const [type] = useState(initialType);
  const [valorFormatted, setValorFormatted] = useState('');
  const [valorNum, setValorNum] = useState(0);
  const [data, setData] = useState(todayBR());
  const [notes, setNotes] = useState('');

  // Abastecimento
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [motivo, setMotivo] = useState('');

  // Reembolso
  const [categoria, setCategoria] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'celular'>('cpf');
  const [pixKey, setPixKey] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAgency, setBankAgency] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  // Diária
  const [dailyCategory, setDailyCategory] = useState('');
  const [personName, setPersonName] = useState('');
  const [personCpf, setPersonCpf] = useState('');
  const [hours, setHours] = useState('');
  const [dailyValueFormatted, setDailyValueFormatted] = useState('');
  const [dailyValueNum, setDailyValueNum] = useState(0);

  const canCreateDiaria = hasAnyRole(['diretoria', 'administrativo']);
  if (type === 'diaria' && !canCreateDiaria) {
    navigate('/fleet');
    return null;
  }

  const handlePixKeyChange = (value: string) => {
    if (pixKeyType === 'cpf') {
      setPixKey(maskCPF(value));
    } else {
      setPixKey(maskPhone(value));
    }
  };

  const isPixValid = () => {
    if (paymentMethod !== 'pix') return true;
    if (!pixKey) return false;
    if (pixKeyType === 'cpf') return isValidCPF(pixKey);
    const digits = pixKey.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  };

  // Abastecimento: today + future only. Diária: any date.
  const isDateValid = () => {
    if (!data) return false;
    if (type === 'abastecimento') {
      return data >= minDateToday();
    }
    // reembolso and diaria: any date
    return true;
  };

  const isValid = () => {
    if (!isDateValid()) return false;
    if (type === 'abastecimento') {
      return valorNum > 0 && valorNum <= 50000 && !!placa && isValidPlate(placa) && !!data;
    }
    if (type === 'reembolso') {
      return valorNum > 0 && valorNum <= 50000 && !!categoria && !!data && (paymentMethod === 'pix' ? isPixValid() : !!bankName);
    }
    if (type === 'diaria') {
      return !!dailyCategory && !!personName && dailyValueNum > 0 && dailyValueNum <= 50000 && !!data;
    }
    return false;
  };

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!user || !isValid()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        requester_user_id: user.id,
        data_abastecimento: data,
        notes: notes.trim() || null,
        type,
        status: type === 'diaria' ? 'ativa' : 'rascunho',
      };

      if (type === 'abastecimento') {
        payload.valor = valorNum;
        payload.placa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        payload.km = km.replace(/\D/g, '') || null;
        payload.motivo = motivo.trim().slice(0, 200) || null;
      } else if (type === 'reembolso') {
        payload.valor = valorNum;
        payload.categoria = categoria;
        payload.payment_method = paymentMethod;
        payload.pix_key = paymentMethod === 'pix' ? pixKey.trim() : null;
        payload.pix_key_type = paymentMethod === 'pix' ? pixKeyType : null;
        payload.bank_name = paymentMethod === 'banco' ? bankName.trim() : null;
        payload.bank_agency = paymentMethod === 'banco' ? bankAgency.replace(/\D/g, '') : null;
        payload.bank_account = paymentMethod === 'banco' ? bankAccount.replace(/\D/g, '') : null;
      } else {
        payload.valor = dailyValueNum;
        payload.daily_category = dailyCategory;
        payload.person_name = personName.trim().slice(0, 100);
        payload.person_cpf = personCpf.replace(/\D/g, '') || null;
        payload.hours = hours ? parseFloat(hours) : null;
        payload.daily_value = dailyValueNum;
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
          {/* Abastecimento */}
          {type === 'abastecimento' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placa do Veículo *</Label>
                  <DynamicCategorySelect
                    module="fleet"
                    fieldKey="vehicle_plate"
                    value={placa}
                    onValueChange={setPlaca}
                    placeholder="Selecione ou adicione"
                  />
                  {placa && !isValidPlate(placa) && (
                    <p className="text-xs text-destructive">Placa inválida (ex: ABC1234)</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>KM Atual</Label>
                  <Input
                    value={km}
                    onChange={e => setKm(maskKM(e.target.value))}
                    placeholder="12345"
                    maxLength={7}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value.slice(0, 200))}
                  placeholder="Motivo do abastecimento"
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <MoneyInput
                    value={valorFormatted}
                    onChange={(fmt, num) => { setValorFormatted(fmt); setValorNum(num); }}
                  />
                  {valorFormatted && (valorNum <= 0 || valorNum > 50000) && (
                    <p className="text-xs text-destructive">Valor entre R$ 0,01 e R$ 50.000</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} min={minDateToday()} />
                  {data && data < minDateToday() && (
                    <p className="text-xs text-destructive">A data do abastecimento deve ser hoje ou uma data futura.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Reembolso */}
          {type === 'reembolso' && (
            <>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <DynamicCategorySelect
                  module="fleet"
                  fieldKey="reembolso_categoria"
                  value={categoria}
                  onValueChange={setCategoria}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <MoneyInput
                    value={valorFormatted}
                    onChange={(fmt, num) => { setValorFormatted(fmt); setValorNum(num); }}
                  />
                  {valorFormatted && (valorNum <= 0 || valorNum > 50000) && (
                    <p className="text-xs text-destructive">Valor entre R$ 0,01 e R$ 50.000</p>
                  )}
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
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tipo da Chave PIX *</Label>
                    <Select value={pixKeyType} onValueChange={(v) => { setPixKeyType(v as 'cpf' | 'celular'); setPixKey(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="celular">Celular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX ({pixKeyType === 'cpf' ? 'CPF' : 'Celular'}) *</Label>
                    <Input
                      value={pixKey}
                      onChange={e => handlePixKeyChange(e.target.value)}
                      placeholder={pixKeyType === 'cpf' ? '000.000.000-00' : '(00) 00000-0000'}
                      maxLength={pixKeyType === 'cpf' ? 14 : 15}
                      inputMode="numeric"
                    />
                    {pixKey && !isPixValid() && (
                      <p className="text-xs text-destructive">
                        {pixKeyType === 'cpf' ? 'CPF inválido' : 'Celular inválido'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Banco *</Label>
                    <Input value={bankName} onChange={e => setBankName(e.target.value.slice(0, 50))} placeholder="Banco" maxLength={50} />
                  </div>
                  <div className="space-y-2">
                    <Label>Agência</Label>
                    <Input
                      value={bankAgency}
                      onChange={e => setBankAgency(maskAgency(e.target.value))}
                      placeholder="0001"
                      maxLength={7}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conta</Label>
                    <Input
                      value={bankAccount}
                      onChange={e => setBankAccount(maskAccount(e.target.value))}
                      placeholder="12345-6"
                      maxLength={15}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Diária */}
          {type === 'diaria' && (
            <>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <DynamicCategorySelect
                  module="fleet"
                  fieldKey="diaria_categoria"
                  value={dailyCategory}
                  onValueChange={setDailyCategory}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome do Prestador *</Label>
                  <Input
                    value={personName}
                    onChange={e => setPersonName(e.target.value.slice(0, 100))}
                    placeholder="Nome completo"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF (opcional)</Label>
                  <Input
                    value={personCpf}
                    onChange={e => setPersonCpf(maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Horas</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={hours}
                    onChange={e => setHours(e.target.value)}
                    placeholder="8"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <MoneyInput
                    value={dailyValueFormatted}
                    onChange={(fmt, num) => { setDailyValueFormatted(fmt); setDailyValueNum(num); }}
                  />
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
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              placeholder="Detalhes adicionais..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
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
