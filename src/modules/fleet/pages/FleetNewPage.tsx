import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateFuelRequest, useFuelRequest } from '../hooks/useFleetQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';
import { ArrowLeft, Loader2, Send, AlertCircle, FileText, CalendarDays } from 'lucide-react';
import { maskCPF, maskPhone, maskKM, maskAgency, maskAccount, maskCurrency, minDateToday, todayBR, isValidPlate, isValidCPF } from '@/lib/masks';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVehicles } from '../hooks/useVehicles';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseEntityActionResult, useEntityAction } from '@/hooks/useEntityAction';
import { requestDetailRoute, requestListRoute } from '../requestRoutes';
import { validateFileMagicNumber } from '@/lib/fileValidation';
import { calculateDailyQuantity, calculateDailyTotal, isDailyDateTimeRangeValid, normalizeDailyPeriod } from '../dailyPeriod';

export default function FleetNewPage({ requestType }: { requestType?: 'abastecimento' | 'diaria' | 'reembolso' }) {
  const { user, hasAnyRole } = useAuth();
  const { id: editId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const initialType = requestType || 'abastecimento';
  const createMutation = useCreateFuelRequest();
  const statusMutation = useEntityAction();
  const [submitting, setSubmitting] = useState(false);
  const { data: editRequest } = useFuelRequest(editId || '');

  const [type] = useState(initialType);
  const backRoute = requestListRoute(type);
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
  const [reimbursementProof, setReimbursementProof] = useState<File | null>(null);

  // Diária
  const [dailyCategory, setDailyCategory] = useState('');
  const [personName, setPersonName] = useState('');
  const [personCpf, setPersonCpf] = useState('');
  const [hours, setHours] = useState('');
  const [dailyValueFormatted, setDailyValueFormatted] = useState('');
  const [dailyValueNum, setDailyValueNum] = useState(0);
  const [dailyPeriodMode, setDailyPeriodMode] = useState<'single' | 'period'>('single');
  const [dailyStartDate, setDailyStartDate] = useState(todayBR());
  const [dailyEndDate, setDailyEndDate] = useState(todayBR());
  const [dailyStartTime, setDailyStartTime] = useState('08:00');
  const [dailyEndTime, setDailyEndTime] = useState('18:00');
  const [dailyDestination, setDailyDestination] = useState('');

  const dailyQuantity = useMemo(() => {
    try { return calculateDailyQuantity(dailyStartDate, dailyEndDate); }
    catch { return 0; }
  }, [dailyStartDate, dailyEndDate]);
  const dailyTotal = useMemo(() => {
    try { return calculateDailyTotal(dailyQuantity, dailyValueNum); }
    catch { return 0; }
  }, [dailyQuantity, dailyValueNum]);

  // ===== DRAFT PERSISTENCE (sessionStorage) =====
  const DRAFT_KEY = `draft_${type}`;
  const [showSessionDraft, setShowSessionDraft] = useState(false);
  const [showDbDraft, setShowDbDraft] = useState(false);
  const draftLoaded = useRef(false);
  const editLoaded = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!editId || !editRequest || editLoaded.current || editRequest.type !== 'diaria') return;
    const period = normalizeDailyPeriod(editRequest as any);
    setDailyStartDate(period.startDate);
    setDailyEndDate(period.endDate);
    setDailyPeriodMode(period.startDate === period.endDate ? 'single' : 'period');
    setDailyStartTime((editRequest as any).daily_start_time?.slice(0, 5) || '08:00');
    setDailyEndTime((editRequest as any).daily_end_time?.slice(0, 5) || '18:00');
    setDailyValueNum(period.dailyRate);
    setDailyValueFormatted(maskCurrency(String(Math.round(period.dailyRate * 100))));
    setDailyCategory((editRequest as any).daily_category || '');
    setDailyDestination((editRequest as any).daily_destination || '');
    setPersonName((editRequest as any).person_name || '');
    setPersonCpf(maskCPF((editRequest as any).person_cpf || ''));
    setNotes((editRequest as any).notes || '');
    editLoaded.current = true;
  }, [editId, editRequest]);

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
    enabled: !!user?.id && !editId,
  });

  useEffect(() => {
    if (editId) return;
    if (draftLoaded.current) return;
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) setShowSessionDraft(true);
    if (existingDbDraft) setShowDbDraft(true);
    draftLoaded.current = true;
  }, [DRAFT_KEY, editId, existingDbDraft]);

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
      if (d.dailyPeriodMode) setDailyPeriodMode(d.dailyPeriodMode);
      if (d.dailyStartDate) setDailyStartDate(d.dailyStartDate);
      if (d.dailyEndDate) setDailyEndDate(d.dailyEndDate);
      if (d.dailyStartTime) setDailyStartTime(d.dailyStartTime);
      if (d.dailyEndTime) setDailyEndTime(d.dailyEndTime);
      if (d.dailyDestination) setDailyDestination(d.dailyDestination);
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
    if (editId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const draft = {
        valorFormatted, valorNum, data, notes, placa, km, motivo,
        categoria, paymentMethod, pixKeyType, pixKey, bankName, bankAgency, bankAccount,
        dailyCategory, personName, personCpf, hours, dailyValueFormatted, dailyValueNum,
        dailyPeriodMode, dailyStartDate, dailyEndDate, dailyStartTime, dailyEndTime, dailyDestination,
      };
      const hasContent = valorNum > 0 || placa || categoria || personName || notes;
      if (hasContent) {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [DRAFT_KEY, editId, valorFormatted, valorNum, data, notes, placa, km, motivo, categoria, paymentMethod, pixKeyType, pixKey, bankName, bankAgency, bankAccount, dailyCategory, personName, personCpf, hours, dailyValueFormatted, dailyValueNum, dailyPeriodMode, dailyStartDate, dailyEndDate, dailyStartTime, dailyEndTime, dailyDestination]);

  const canCreateDiaria = hasAnyRole(['diretoria', 'administrativo']);
  if (type === 'diaria' && !canCreateDiaria) {
    return <Navigate to="/dashboard" replace />;
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

  const applyDailyShortcut = (days: number) => {
    const start = new Date(`${dailyStartDate || todayBR()}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + days - 1);
    setDailyPeriodMode(days === 1 ? 'single' : 'period');
    setDailyEndDate(start.toISOString().slice(0, 10));
  };

  // Abastecimento: atual ou futura.
  // Diária: atual ou futura.
  // Reembolso: atual ou passada.
  const isDateValid = () => {
    const today = todayBR();
    if (type === 'diaria') {
      return !!dailyStartDate
        && !!dailyEndDate
        && dailyStartDate >= today
        && dailyEndDate >= dailyStartDate
        && isDailyDateTimeRangeValid(dailyStartDate, dailyStartTime, dailyEndDate, dailyEndTime);
    }
    if (!data) return false;
    if (type === 'abastecimento') return data >= today;
    if (type === 'reembolso') return data <= today;
    return false;
  };

  const isValid = (forSend = false) => {
    if (!isDateValid()) return false;
    if (type === 'abastecimento') {
      return valorNum > 0 && valorNum <= 50000 && !!placa && isValidPlate(placa) && !!data && !!motivo.trim();
    }
    if (type === 'reembolso') {
      return valorNum > 0 && valorNum <= 50000 && !!categoria && !!data &&
        (paymentMethod === 'pix' ? isPixValid() : !!bankName.trim() && !!bankAgency && !!bankAccount) && !!notes.trim() &&
        (!forSend || !!reimbursementProof);
    }
    if (type === 'diaria') {
      return !!dailyCategory
        && !!personName.trim()
        && !!dailyDestination.trim()
        && !!notes.trim()
        && dailyValueNum > 0
        && dailyQuantity > 0
        && dailyTotal > 0
        && dailyTotal <= 50000
        && isDateValid();
    }
    return false;
  };

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!user || !isValid(sendImmediately)) {
      toast({
        title: 'Revise os campos obrigatórios',
        description: type === 'reembolso' && sendImmediately && !reimbursementProof
          ? 'Anexe o comprovante da despesa antes de enviar.'
          : type === 'diaria'
            ? 'Informe período, horários, finalidade, destino, justificativa e valor unitário válidos.'
          : 'Preencha os campos destacados e verifique a data informada.',
        variant: 'destructive',
      });
      return;
    }
    let persistedRequestId = editId;
    let dataSaved = false;
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        requester_user_id: user.id,
        data_abastecimento: type === 'diaria' ? dailyStartDate : data,
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
        payload.valor = dailyTotal;
        payload.daily_category = dailyCategory;
        payload.person_name = personName.trim().slice(0, 100);
        payload.person_cpf = personCpf.replace(/\D/g, '') || null;
        payload.hours = hours ? parseFloat(hours) : null;
        payload.daily_value = dailyValueNum;
        payload.daily_start_date = dailyStartDate;
        payload.daily_end_date = dailyEndDate;
        payload.daily_start_time = dailyStartTime;
        payload.daily_end_time = dailyEndTime;
        payload.daily_quantity = dailyQuantity;
        payload.daily_destination = dailyDestination.trim().slice(0, 200);
      }

      let result: any;
      if (editId) {
        const { data: updateResult, error: updateError } = await (supabase as any).rpc('update_daily_request_draft', {
          p_entity_id: editId,
          p_start_date: dailyStartDate,
          p_end_date: dailyEndDate,
          p_start_time: dailyStartTime,
          p_end_time: dailyEndTime,
          p_daily_rate: dailyValueNum,
          p_service_type: dailyCategory,
          p_destination: dailyDestination.trim(),
          p_person_name: personName.trim(),
          p_person_cpf: personCpf.replace(/\D/g, '') || null,
          p_notes: notes.trim(),
        });
        if (updateError) throw updateError;
        parseEntityActionResult(updateResult);
        result = { id: editId };
        toast({ title: 'Rascunho atualizado!' });
      } else {
        result = await createMutation.mutateAsync(payload);
      }
      persistedRequestId = result?.id;
      dataSaved = true;
      if (result?.id && type === 'reembolso' && reimbursementProof) {
        const { data: signedData, error: fnError } = await supabase.functions.invoke('fleet-create-signed-upload', {
          body: {
            fuel_request_id: result.id,
            file_type: reimbursementProof.type,
            file_name: reimbursementProof.name,
            file_size: reimbursementProof.size,
            attachment_type: 'nota_fiscal',
          },
        });
        if (fnError || signedData?.error) throw new Error(signedData?.error || fnError?.message || 'Erro ao preparar comprovante');
        const { error: uploadError } = await supabase.storage
          .from('fleet')
          .uploadToSignedUrl(signedData.path, signedData.token, reimbursementProof);
        if (uploadError) throw uploadError;
        const { error: attachmentError } = await supabase.from('fuel_attachments').insert({
          fuel_request_id: result.id,
          type: 'nota_fiscal',
          file_path: signedData.path,
        });
        if (attachmentError) throw attachmentError;
      }
      if (sendImmediately && result?.id) {
        await statusMutation.mutateAsync({ moduleKey: type, entityId: result.id, action: 'enviar' });
      }
      clearDraft();
      navigate(backRoute);
    } catch (error: any) {
      if (editId && !dataSaved) {
        toast({ title: 'Não foi possível atualizar a Diária', description: error?.message, variant: 'destructive' });
      }
      if (persistedRequestId && sendImmediately) {
        navigate(requestDetailRoute(type, persistedRequestId));
      }
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
              <Button size="sm" onClick={() => navigate(requestDetailRoute(type, existingDbDraft.id))}>Abrir rascunho</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDbDraft(false)}>Criar nova</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editId ? 'Editar' : 'Nova Solicitação —'} {typeLabels[type]}</CardTitle>
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
                <Label>Motivo *</Label>
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
                  {data && data < todayBR() && (
                    <p className="text-xs text-destructive">A data do abastecimento deve ser hoje ou futura.</p>
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
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} max={todayBR()} />
                  {data && data > todayBR() && <p className="text-xs text-destructive">Data futura não é permitida para reembolso.</p>}
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
                    <Label>Agência *</Label>
                    <Input
                      value={bankAgency}
                      onChange={e => setBankAgency(maskAgency(e.target.value))}
                      placeholder="0001"
                      maxLength={7}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Conta *</Label>
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
              <div className="space-y-2">
                <Label>Comprovante da despesa *</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={async (event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) { setReimbursementProof(null); return; }
                    const allowed = ['image/jpeg', 'image/png', 'application/pdf'] as const;
                    if (file.size > 10 * 1024 * 1024 || !allowed.includes(file.type as any) || !(await validateFileMagicNumber(file, allowed as any))) {
                      setReimbursementProof(null);
                      event.target.value = '';
                      toast({ title: 'Comprovante inválido', description: 'Use JPEG, PNG ou PDF de até 10MB.', variant: 'destructive' });
                      return;
                    }
                    setReimbursementProof(file);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {reimbursementProof ? reimbursementProof.name : 'Obrigatório para enviar; o rascunho pode ser salvo sem comprovante.'}
                </p>
              </div>
            </>
          )}

          {/* Diária */}
          {type === 'diaria' && (
            <>
              <div className="space-y-2">
                <Label>Formato do período *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={dailyPeriodMode === 'single' ? 'default' : 'outline'}
                    onClick={() => { setDailyPeriodMode('single'); setDailyEndDate(dailyStartDate); }}
                  >Um dia</Button>
                  <Button
                    type="button"
                    variant={dailyPeriodMode === 'period' ? 'default' : 'outline'}
                    onClick={() => setDailyPeriodMode('period')}
                  >Período</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{dailyPeriodMode === 'single' ? 'Data' : 'Data inicial'} *</Label>
                  <Input
                    type="date"
                    value={dailyStartDate}
                    min={todayBR()}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDailyStartDate(next);
                      if (dailyPeriodMode === 'single' || dailyEndDate < next) setDailyEndDate(next);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horário inicial *</Label>
                  <Input type="time" value={dailyStartTime} onChange={event => setDailyStartTime(event.target.value)} />
                </div>
                {dailyPeriodMode === 'period' && (
                  <div className="space-y-2">
                    <Label>Data final *</Label>
                    <Input
                      type="date"
                      value={dailyEndDate}
                      min={dailyStartDate || todayBR()}
                      onChange={event => setDailyEndDate(event.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Horário final *</Label>
                  <Input type="time" value={dailyEndTime} onChange={event => setDailyEndTime(event.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Atalhos de período">
                {[1, 3, 5, 7, 14].map(days => (
                  <Button key={days} type="button" size="sm" variant="outline" onClick={() => applyDailyShortcut(days)}>
                    {days === 1 ? '1 dia' : days === 7 ? '1 semana' : days === 14 ? '2 semanas' : `${days} dias`}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Tipo / finalidade *</Label>
                <DynamicCategorySelect
                  module="fleet"
                  fieldKey="diaria_categoria"
                  value={dailyCategory}
                  onValueChange={setDailyCategory}
                />
              </div>
              <div className="space-y-2">
                <Label>Destino / local *</Label>
                <Input
                  value={dailyDestination}
                  onChange={event => setDailyDestination(event.target.value.slice(0, 200))}
                  placeholder="Cidade, unidade ou local da atividade"
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Valor unitário da diária *</Label>
                  <MoneyInput
                    value={dailyValueFormatted}
                    onChange={(fmt, num) => { setDailyValueFormatted(fmt); setDailyValueNum(num); }}
                  />
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Total calculado</p>
                  <p className="text-xl font-bold">{dailyTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  <p className="text-xs text-muted-foreground">{dailyQuantity} {dailyQuantity === 1 ? 'diária' : 'diárias'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Resumo da Diária</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <p><span className="text-muted-foreground">Período:</span><br />{dailyStartDate || '—'} às {dailyStartTime || '—'} até {dailyEndDate || '—'} às {dailyEndTime || '—'}</p>
                  <p><span className="text-muted-foreground">Duração:</span><br />{dailyQuantity} {dailyQuantity === 1 ? 'dia' : 'dias'}</p>
                  <p><span className="text-muted-foreground">Valor unitário:</span><br />{dailyValueNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  <p><span className="text-muted-foreground">Total:</span><br /><strong>{dailyTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                  <p><span className="text-muted-foreground">Destino:</span><br />{dailyDestination || '—'}</p>
                  <p><span className="text-muted-foreground">Finalidade:</span><br />{dailyCategory || '—'}</p>
                </div>
              </div>

              {!isDateValid() && (
                <p className="text-xs text-destructive">O período deve começar hoje ou no futuro e o término deve ser posterior ao início.</p>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label>{type === 'reembolso' ? 'Descrição / justificativa *' : type === 'diaria' ? 'Justificativa *' : 'Observações'}</Label>
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
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editId ? 'Salvar alterações' : 'Salvar Rascunho'}
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <Send className="w-4 h-4" /> Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
