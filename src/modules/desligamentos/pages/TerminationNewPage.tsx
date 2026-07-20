import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateTermination, useTerminationSetStatus } from '../hooks/useTerminationQueries';
import { useCollaborators } from '@/modules/epis/hooks/useEpiQueries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Send, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TIPO_OPTIONS = [
  { value: 'pedido_demissao', label: 'Pedido de Demissão' },
  { value: 'demissao_sem_justa_causa', label: 'Demissão sem Justa Causa' },
  { value: 'demissao_por_justa_causa', label: 'Demissão por Justa Causa' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'termino_contrato', label: 'Término de Contrato' },
  { value: 'experiencia', label: 'Término de Experiência' },
  { value: 'aposentadoria', label: 'Aposentadoria' },
  { value: 'falecimento', label: 'Falecimento' },
  { value: 'outros', label: 'Outros' },
];

export default function TerminationNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMutation = useCreateTermination();
  const statusMutation = useTerminationSetStatus();
  const [submitting, setSubmitting] = useState(false);

  const { data: collaborators = [] } = useCollaborators({ active: true });

  const [collaboratorId, setCollaboratorId] = useState('');
  const [selectedCollab, setSelectedCollab] = useState<any>(null);
  const [form, setForm] = useState({
    tipo_desligamento: '',
    motivo: '',
    data_prevista: '',
    ultimo_dia_trabalhado: '',
    gestor_imediato: '',
    matricula: '',
    observacoes: '',
  });

  // Auto-preenche dados do colaborador selecionado
  useEffect(() => {
    if (!collaboratorId) { setSelectedCollab(null); return; }
    const collab = (collaborators as any[]).find((c: any) => c.id === collaboratorId);
    setSelectedCollab(collab ?? null);
  }, [collaboratorId, collaborators]);

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const isFormValid = () =>
    collaboratorId &&
    form.tipo_desligamento &&
    form.motivo.trim() &&
    form.data_prevista;

  const handleSubmit = async (send: boolean) => {
    if (!user) return;
    if (!isFormValid()) {
      toast({ title: 'Preencha todos os campos obrigatórios para continuar.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        collaborator_id: collaboratorId,
        requester_user_id: user.id,
        tipo_desligamento: form.tipo_desligamento,
        motivo: form.motivo.trim(),
        data_prevista: form.data_prevista,
        ultimo_dia_trabalhado: form.ultimo_dia_trabalhado || null,
        gestor_imediato: form.gestor_imediato.trim() || null,
        matricula: form.matricula.trim() || null,
        observacoes: form.observacoes.trim() || null,
        status: 'rascunho',
      };
      const result = await createMutation.mutateAsync(payload);
      if (send && result?.id) {
        await statusMutation.mutateAsync({
          requestId: result.id,
          toStatus: 'em_aprovacao',
          startApproval: { requesterUserId: user.id },
        });
      }
      navigate('/desligamentos');
    } catch {
      // handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Button variant="ghost" className="gap-2" onClick={() => navigate('/desligamentos')}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Novo Desligamento</CardTitle>
          <CardDescription>
            Preencha os dados do processo de desligamento. Os campos com * são obrigatórios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Colaborador */}
          <div className="space-y-2">
            <Label htmlFor="collaborator_id">Colaborador *</Label>
            <Select value={collaboratorId} onValueChange={setCollaboratorId}>
              <SelectTrigger id="collaborator_id">
                <SelectValue placeholder="Selecione o colaborador" />
              </SelectTrigger>
              <SelectContent>
                {(collaborators as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dados auto-preenchidos do colaborador */}
          {selectedCollab && (
            <div className="grid grid-cols-2 gap-4 p-3 rounded-md bg-muted/50 text-sm">
              {selectedCollab.role_name && (
                <div><span className="text-muted-foreground">Cargo:</span> <span className="font-medium">{selectedCollab.role_name}</span></div>
              )}
              {selectedCollab.worksite && (
                <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium">{selectedCollab.worksite}</span></div>
              )}
              {selectedCollab.sector?.name && (
                <div><span className="text-muted-foreground">Setor:</span> <span className="font-medium">{selectedCollab.sector.name}</span></div>
              )}
            </div>
          )}

          {/* Matrícula */}
          <div className="space-y-2">
            <Label htmlFor="matricula">Matrícula</Label>
            <Input
              id="matricula"
              placeholder="Matrícula do colaborador (se houver)"
              value={form.matricula}
              onChange={e => set('matricula', e.target.value)}
            />
          </div>

          {/* Gestor Imediato */}
          <div className="space-y-2">
            <Label htmlFor="gestor_imediato">Gestor Imediato</Label>
            <Input
              id="gestor_imediato"
              placeholder="Nome do gestor responsável"
              value={form.gestor_imediato}
              onChange={e => set('gestor_imediato', e.target.value)}
            />
          </div>

          {/* Tipo de Desligamento */}
          <div className="space-y-2">
            <Label htmlFor="tipo_desligamento">Tipo de Desligamento *</Label>
            <Select value={form.tipo_desligamento} onValueChange={v => set('tipo_desligamento', v)}>
              <SelectTrigger id="tipo_desligamento">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo *</Label>
            <Textarea
              id="motivo"
              placeholder="Descreva o motivo do desligamento"
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              rows={3}
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_prevista">Data Prevista *</Label>
              <Input
                id="data_prevista"
                type="date"
                value={form.data_prevista}
                onChange={e => set('data_prevista', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ultimo_dia_trabalhado">Último Dia Trabalhado</Label>
              <Input
                id="ultimo_dia_trabalhado"
                type="date"
                value={form.ultimo_dia_trabalhado}
                onChange={e => set('ultimo_dia_trabalhado', e.target.value)}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Informações adicionais (opcional)"
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              rows={2}
            />
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={submitting || !isFormValid()}
              className="gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Rascunho
            </Button>
            <Button
              onClick={() => handleSubmit(true)}
              disabled={submitting || !isFormValid()}
              className="gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar para Aprovação
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
