import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckDailyLimit } from '@/hooks/useRequestLimits';
import { useCreateFuelRequest, useFuelSetStatus } from '../hooks/useFleetQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';
import { ArrowLeft, Loader2, Send, AlertCircle, FileText } from 'lucide-react';
import { maskCPF, maskPhone, maskKM, maskAgency, maskAccount, minDateToday, todayBR, isValidPlate, isValidCPF } from '@/lib/masks';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVehicles } from '../hooks/useVehicles';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FleetNewPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'abastecimento';
  const createMutation = useCreateFuelRequest();
  const statusMutation = useFuelSetStatus();
  const checkLimit = useCheckDailyLimit();
  const [submitting, setSubmitting] = useState(false);

  const [type] = useState(initialType);
  const backRoute = type === 'diaria' ? '/diarias' : type === 'reembolso' ? '/reembolsos' : '/fleet';
  const typeLabels: Record<string, string> = { abastecimento: 'Abastecimento', reembolso: 'Reembolso', diaria: 'Diária' };
  const { data: vehiclesList } = useVehicles({ onlyActive: true });
  const [placaPopoverOpen, setPlacaPopoverOpen] = useState(false);
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

  // ===== DRAFT PERSISTENCE (sessionStorage) =====
  const DRAFT_KEY = `draft_${type}`;
  const [showSessionDraft, setShowSessionDraft] = useState(false);
  const [showDbDraft, setShowDbDraft] = useState(false);
  const draftLoaded = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: existingDbDraft } = useQuery({
    queryKey: ['existing_draft', user?.id, type],
    queryFn: async () => {
      const { data } = await supabase
        .from('fuel_requests')
        .select('id')
        .eq('requester_user_id', user!.id)
        .eq('type', type)
        .eq('status', 'rascunho' as any)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (draftLoaded.current) return;
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) setShowSessionDraft(true);
    if (existingDbDraft) setShowDbDraft(true);
    draftLoaded.current = true;
  }, [existingDbDraft]);

  const restoreFromSession = () => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      if (d.valorFormatted) setValorFormatted(d.valorFormatted);
      if (d.valorNum) setValorNum(d.valorNum);
      if (d.data) setData(d.data);
      if (d.notes) setNotes(d.notes);
      if (d.placa) setPlaca(d.placa);
      if (d.km) setKm(d.km);
      if (d.motivo) setMotivo(d.motivo);
      if (d.categoria) setCategoria(d.categoria);
      if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
      if (d.pixKeyType) setPixKeyType(d.pixKeyType);
      if (d.pixKey) setPixKey(d.pixKey);
      if (d.bankName) setBankName(d.bankName);
      if (d.bankAgency) setBankAgency(d.bankAgency);
      if (d.bankAccount) setBankAccount(d.bankAccount);
      if (d.dailyCategory) setDailyCategory(d.dailyCategory);
      if (d.personName) setPersonName(d.personName);
      if (d.personCpf) setPersonCpf(d.personCpf);
      if (d.hours) setHours(d.hours);
      if (d.dailyValueFormatted) setDailyValueFormatted(d.dailyValueFormatted);
      if (d.dailyValueNum) setDailyValueNum(d.dailyValueNum);
    } catch { /* ignore */ }
    setShowSessionDraft(false);
  };

  const discardSessionDraft = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    setShowSessionDraft(false);
  };

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(DRAFT_KEY);
  }, [DRAFT_KEY]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const draft = {
        valorFormatted, valorNum, data, notes, placa, km, motivo,
        categoria, paymentMethod, pixKeyType, pixKey, bankName, bankAgency, bankAccount,
        dailyCategory, personName, personCpf, hours, dailyValueFormatted, dailyValueNum,
      };
      const hasContent = valorNum > 0 || placa || categoria || personName || notes;
      if (hasContent) {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [valorFormatted, valorNum, data, notes, placa, km, motivo, categoria, paymentMethod, pixKeyType, pixKey, bankName, bankAgency, bankAccount, dailyCategory, personName, personCpf, hours, dailyValueFormatted, dailyValueNum]);

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

  // Abastecimento: somente de hoje.
  // Diária: atual ou futura.
  // Reembolso: atual ou passada.
  const isDateValid = () => {
    if (!data) return false;
    const today = todayBR();
    if (type === 'abastecimento') return data === today;
    if (type === 'diaria') return data >= today;
    if (type === 'reembolso') return data <= today;
    return false;
  };

  const isValid = () => {
    if (!isDateValid()) return false;
    if (type === 'abastecimento') {
      return valorNum > 0 && valorNum <= 50000 && !!placa && isValidPlate(placa) && !!data && !!motivo.trim();
    }
    if (type === 'reembolso') {
      return valorNum > 0 && valorNum <= 50000 && !!categoria && !!data && (paymentMethod === 'pix' ? isPixValid() : !!bankName) && !!notes.trim();
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
      // Check daily limit
      const limitResult = await checkLimit.mutateAsync({
        userId: user.id,
        requestType: type,
        roles: user.roles || [],
      });
      if (!limitResult.canCreate) {
        toast({
          title: 'Limite diário atingido',
          description: `Você já criou ${limitResult.used} de ${limitResult.limit} solicitações hoje.`,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      const payload: Record<string, any> = {
        requester_user_id: user.id,
        data_abastecimento: data,
        notes: notes.trim() || null,
        type,
        status: 'rascunho',
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
      clearDraft();
      navigate(backRoute);
    } catch {
      // toast handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate(backRoute)}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      {showSessionDraft && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">Preenchimento não salvo encontrado</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Você tem dados de um preenchimento anterior. Deseja continuar de onde parou?
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={restoreFromSession}>Continuar</Button>
              <Button size="sm" variant="ghost" onClick={discardSessionDraft}>Descartar</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {showDbDraft && existingDbDraft && (
        <Alert className="border-primary/50 bg-primary/5">
          <FileText className="h-4 w-4 text-primary" />
          <AlertTitle>Rascunho salvo encontrado</AlertTitle>
          <AlertDescription>
            Você tem uma solicitação em rascunho. Deseja continuar de onde parou?
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => navigate(`/fleet/${existingDbDraft.id}`)}>Abrir rascunho</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDbDraft(false)}>Criar nova</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

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
                  <Popover open={placaPopoverOpen} onOpenChange={setPlacaPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className={cn('w-full justify-between font-mono uppercase', !placa && 'text-muted-foreground font-sans normal-case')}
                      >
                        {placa
                          ? (() => {
                              const v = vehiclesList?.find(x => x.placa === placa.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                              return v ? `${v.placa} — ${v.modelo}` : placa.toUpperCase();
                            })()
                          : 'Selecione um veículo'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar placa ou modelo..." />
                        <CommandList>
                          <CommandEmpty>
                            <div className="py-3 px-2 text-xs text-muted-foreground">
                              <p>Nenhum veículo encontrado.</p>
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            {(vehiclesList || []).map(v => (
                              <CommandItem
                                key={v.id}
                                value={`${v.placa} ${v.modelo}`}
                                onSelect={() => { setPlaca(v.placa); setPlacaPopoverOpen(false); }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', placa === v.placa ? 'opacity-100' : 'opacity-0')} />
                                <span className="font-mono font-semibold mr-2">{v.placa}</span>
                                <span className="text-muted-foreground text-xs truncate">{v.modelo}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting || !isValid()}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting || !isValid()} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <Send className="w-4 h-4" /> Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
