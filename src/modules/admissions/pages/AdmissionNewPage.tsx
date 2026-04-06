import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateAdmission, useAdmissionSetStatus } from '../hooks/useAdmissionQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { DynamicCategorySelect } from '@/components/DynamicCategorySelect';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { minDateToday } from '@/lib/masks';
import { useToast } from '@/hooks/use-toast';

export default function AdmissionNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMutation = useCreateAdmission();
  const statusMutation = useAdmissionSetStatus();
  const [submitting, setSubmitting] = useState(false);

  const [salarioFormatted, setSalarioFormatted] = useState('');
  const [salarioNum, setSalarioNum] = useState(0);
  const [showSizes, setShowSizes] = useState(false);
  const [sizes, setSizes] = useState({ shirt_size: '', pants_size: '', shoe_size: '' });
  const [form, setForm] = useState({
    local_contratacao: '',
    cargo_funcao: '',
    tipo_contrato: 'CLT',
    jornada: '',
    data_prevista_inicio: '',
    gestor_responsavel: '',
    motivo: '',
    justificativa: '',
    priority: 'media',
  });

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  // All fields required EXCEPT motivo and justificativa
  const isFormValid = () => {
    return (
      form.cargo_funcao.trim() &&
      form.local_contratacao.trim() &&
      form.tipo_contrato.trim() &&
      form.jornada.trim() &&
      form.data_prevista_inicio &&
      form.gestor_responsavel.trim() &&
      salarioNum > 0
    );
  };

  const handleSubmit = async (send: boolean) => {
    if (!user) return;
    if (!isFormValid()) {
      toast({ title: 'Preencha todos os campos obrigatórios para continuar.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        requester_user_id: user.id,
        local_contratacao: form.local_contratacao.trim().slice(0, 100),
        centro_custo: '',
        cargo_funcao: form.cargo_funcao.trim().slice(0, 100),
        tipo_contrato: form.tipo_contrato,
        salario_previsto: salarioNum > 0 ? salarioNum : null,
        jornada: form.jornada.trim().slice(0, 50),
        data_prevista_inicio: form.data_prevista_inicio || null,
        gestor_responsavel: form.gestor_responsavel.trim().slice(0, 100),
        motivo: form.motivo.trim().slice(0, 200),
        justificativa: form.justificativa.trim().slice(0, 500) || null,
        priority: form.priority,
        status: 'rascunho' as any,
        shirt_size: showSizes ? sizes.shirt_size || null : null,
        pants_size: showSizes ? sizes.pants_size || null : null,
        shoe_size: showSizes ? sizes.shoe_size || null : null,
      };
      const result = await createMutation.mutateAsync(payload);
      if (send && result?.id) {
        await statusMutation.mutateAsync({
          requestId: result.id,
          toStatus: 'aguardando_triagem',
          startApproval: { requesterUserId: user.id },
        });
      }
      navigate('/admissions');
    } catch {
      // handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/admissions')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova Solicitação de Admissão</CardTitle>
          <CardDescription>Preencha os dados da vaga. Campos com * são obrigatórios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cargo / Função *</Label>
              <DynamicCategorySelect
                module="admissions"
                fieldKey="job_title"
                value={form.cargo_funcao}
                onValueChange={v => set('cargo_funcao', v)}
                placeholder="Selecione ou adicione"
              />
            </div>
            <div className="space-y-2">
              <Label>Local de Contratação *</Label>
              <DynamicCategorySelect
                module="admissions"
                fieldKey="hiring_location"
                value={form.local_contratacao}
                onValueChange={v => set('local_contratacao', v)}
                placeholder="Selecione ou adicione"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Contrato *</Label>
              <Select value={form.tipo_contrato} onValueChange={v => set('tipo_contrato', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLT">CLT</SelectItem>
                  <SelectItem value="PJ">PJ</SelectItem>
                  <SelectItem value="Temporário">Temporário</SelectItem>
                  <SelectItem value="Estágio">Estágio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Salário Previsto *</Label>
              <MoneyInput
                value={salarioFormatted}
                onChange={(fmt, num) => { setSalarioFormatted(fmt); setSalarioNum(num); }}
                max={999999.99}
              />
            </div>
            <div className="space-y-2">
              <Label>Jornada *</Label>
              <DynamicCategorySelect
                module="admissions"
                fieldKey="work_shift"
                value={form.jornada}
                onValueChange={v => set('jornada', v)}
                placeholder="Selecione ou adicione"
              />
            </div>
            <div className="space-y-2">
              <Label>Data Prevista Início *</Label>
              <Input
                type="date"
                value={form.data_prevista_inicio}
                onChange={e => set('data_prevista_inicio', e.target.value)}
                min={minDateToday()}
              />
            </div>
            <div className="space-y-2">
              <Label>Gestor Responsável *</Label>
              <DynamicCategorySelect
                module="admissions"
                fieldKey="manager_name"
                value={form.gestor_responsavel}
                onValueChange={v => set('gestor_responsavel', v)}
                placeholder="Selecione ou adicione"
              />
            </div>
            <div className="space-y-2">
              <Label>Prioridade *</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motivo da Contratação</Label>
            <Input
              value={form.motivo}
              onChange={e => set('motivo', e.target.value.slice(0, 200))}
              placeholder="Ex: Expansão de equipe"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea
              value={form.justificativa}
              onChange={e => set('justificativa', e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{form.justificativa.length}/500</p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="show-sizes"
              checked={showSizes}
              onCheckedChange={(v) => setShowSizes(!!v)}
            />
            <Label htmlFor="show-sizes" className="cursor-pointer font-normal">
              Informar tamanhos de EPI/uniforme
            </Label>
          </div>

          {showSizes && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="space-y-2">
                <Label>Camisa</Label>
                <Select value={sizes.shirt_size} onValueChange={v => setSizes(p => ({ ...p, shirt_size: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Calça</Label>
                <Select value={sizes.pants_size} onValueChange={v => setSizes(p => ({ ...p, pants_size: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Calçado</Label>
                <Select value={sizes.shoe_size} onValueChange={v => setSizes(p => ({ ...p, shoe_size: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 16 }, (_, i) => String(33 + i)).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Esses tamanhos serão associados ao colaborador quando contratado, facilitando a entrega de EPIs.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting || !isFormValid()}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting || !isFormValid()} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Send className="w-4 h-4" /> Enviar para Triagem
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
