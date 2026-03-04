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
import { ArrowLeft, Loader2, Send } from 'lucide-react';

export default function AdmissionNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createMutation = useCreateAdmission();
  const statusMutation = useAdmissionSetStatus();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    local_contratacao: '',
    centro_custo: '',
    cargo_funcao: '',
    tipo_contrato: 'CLT',
    salario_previsto: '',
    jornada: '',
    data_prevista_inicio: '',
    gestor_responsavel: '',
    motivo: '',
    justificativa: '',
    priority: 'media',
  });

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (send: boolean) => {
    if (!user || !form.cargo_funcao) return;
    setSubmitting(true);
    try {
      const payload = {
        requester_user_id: user.id,
        local_contratacao: form.local_contratacao,
        centro_custo: form.centro_custo,
        cargo_funcao: form.cargo_funcao,
        tipo_contrato: form.tipo_contrato,
        salario_previsto: form.salario_previsto ? parseFloat(form.salario_previsto) : null,
        jornada: form.jornada,
        data_prevista_inicio: form.data_prevista_inicio || null,
        gestor_responsavel: form.gestor_responsavel,
        motivo: form.motivo,
        justificativa: form.justificativa || null,
        priority: form.priority,
        status: 'rascunho' as any,
      };
      const result = await createMutation.mutateAsync(payload);
      if (send && result?.id) {
        await statusMutation.mutateAsync({ requestId: result.id, toStatus: 'aguardando_triagem' });
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
          <CardDescription>Preencha os dados da vaga</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cargo / Função *</Label>
              <Input value={form.cargo_funcao} onChange={e => set('cargo_funcao', e.target.value)} placeholder="Ex: Engenheiro Civil" required />
            </div>
            <div className="space-y-2">
              <Label>Centro de Custo</Label>
              <Input value={form.centro_custo} onChange={e => set('centro_custo', e.target.value)} placeholder="Ex: Obra 123" />
            </div>
            <div className="space-y-2">
              <Label>Local de Contratação</Label>
              <Input value={form.local_contratacao} onChange={e => set('local_contratacao', e.target.value)} placeholder="Cidade / UF" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Contrato</Label>
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
              <Label>Salário Previsto (R$)</Label>
              <Input type="number" step="0.01" value={form.salario_previsto} onChange={e => set('salario_previsto', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Jornada</Label>
              <Input value={form.jornada} onChange={e => set('jornada', e.target.value)} placeholder="Ex: 44h semanais" />
            </div>
            <div className="space-y-2">
              <Label>Data Prevista Início</Label>
              <Input type="date" value={form.data_prevista_inicio} onChange={e => set('data_prevista_inicio', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gestor Responsável</Label>
              <Input value={form.gestor_responsavel} onChange={e => set('gestor_responsavel', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
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
            <Label>Motivo da Contratação *</Label>
            <Input value={form.motivo} onChange={e => set('motivo', e.target.value)} placeholder="Ex: Expansão de equipe" required />
          </div>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea value={form.justificativa} onChange={e => set('justificativa', e.target.value)} rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={submitting || !form.cargo_funcao}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={submitting || !form.cargo_funcao} className="gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Send className="w-4 h-4" /> Enviar para Triagem
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
