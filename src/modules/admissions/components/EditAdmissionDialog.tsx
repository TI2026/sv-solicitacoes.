import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/MoneyInput';
import { CargoCombobox } from './CargoCombobox';
import { Loader2 } from 'lucide-react';
import { maskCurrency } from '@/lib/masks';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface EditAdmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: any;
}

export function EditAdmissionDialog({ open, onOpenChange, admission }: EditAdmissionDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [salarioFormatted, setSalarioFormatted] = useState('');
  const [salarioNum, setSalarioNum] = useState(0);
  const [form, setForm] = useState({
    cargo_funcao: '',
    local_contratacao: '',
    tipo_contrato: 'CLT',
    jornada: '',
    data_prevista_inicio: '',
    gestor_responsavel: '',
    motivo: '',
    justificativa: '',
    priority: 'media',
  });

  useEffect(() => {
    if (admission && open) {
      setForm({
        cargo_funcao: admission.cargo_funcao || '',
        local_contratacao: admission.local_contratacao || '',
        tipo_contrato: admission.tipo_contrato || 'CLT',
        jornada: admission.jornada || '',
        data_prevista_inicio: admission.data_prevista_inicio || '',
        gestor_responsavel: admission.gestor_responsavel || '',
        motivo: admission.motivo || '',
        justificativa: admission.justificativa || '',
        priority: (admission as any).priority || 'media',
      });
      if (admission.salario_previsto) {
        const formatted = maskCurrency(String(Math.round(Number(admission.salario_previsto) * 100)));
        setSalarioFormatted(formatted);
        setSalarioNum(Number(admission.salario_previsto));
      } else {
        setSalarioFormatted('');
        setSalarioNum(0);
      }
    }
  }, [admission, open]);

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.cargo_funcao.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('admission_requests')
        .update({
          cargo_funcao: form.cargo_funcao.trim().slice(0, 100),
          local_contratacao: form.local_contratacao.trim().slice(0, 100),
          tipo_contrato: form.tipo_contrato,
          salario_previsto: form.salario_previsto ? parseFloat(form.salario_previsto) : null,
          jornada: form.jornada.trim().slice(0, 50),
          data_prevista_inicio: form.data_prevista_inicio || null,
          gestor_responsavel: form.gestor_responsavel.trim().slice(0, 100),
          motivo: form.motivo.trim().slice(0, 200),
          justificativa: form.justificativa.trim().slice(0, 500) || null,
          priority: form.priority,
        })
        .eq('id', admission.id);

      if (error) throw error;

      // Audit log
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'edit_admission',
          entity_type: 'admission_requests',
          entity_id: admission.id,
          details: { fields_updated: Object.keys(form) },
        });
      }

      qc.invalidateQueries({ queryKey: ['admission_request', admission.id] });
      qc.invalidateQueries({ queryKey: ['admission_requests'] });
      toast({ title: 'Vaga atualizada com sucesso!' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Vaga</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cargo / Função *</Label>
              <CargoCombobox value={form.cargo_funcao} onChange={v => set('cargo_funcao', v)} />
            </div>
            <div className="space-y-2">
              <Label>Local de Contratação</Label>
              <Input value={form.local_contratacao} onChange={e => set('local_contratacao', e.target.value.slice(0, 100))} maxLength={100} />
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
              <Input type="number" step="0.01" min="0" max="999999.99" value={form.salario_previsto} onChange={e => set('salario_previsto', clampSalary(e.target.value))} inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label>Jornada</Label>
              <Input value={form.jornada} onChange={e => set('jornada', e.target.value.slice(0, 50))} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Data Prevista Início</Label>
              <Input type="date" value={form.data_prevista_inicio} onChange={e => set('data_prevista_inicio', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gestor Responsável</Label>
              <Input value={form.gestor_responsavel} onChange={e => set('gestor_responsavel', e.target.value.slice(0, 100))} maxLength={100} />
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
            <Input value={form.motivo} onChange={e => set('motivo', e.target.value.slice(0, 200))} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label>Justificativa</Label>
            <Textarea value={form.justificativa} onChange={e => set('justificativa', e.target.value.slice(0, 500))} rows={3} maxLength={500} />
            <p className="text-xs text-muted-foreground text-right">{form.justificativa.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.cargo_funcao.trim()}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
