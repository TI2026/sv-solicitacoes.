import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { maskCPF, isValidCPF, maskPhone } from '@/lib/masks';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const from = (table: string) => (supabase as any).from(table);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator: any | null;
}

export function CollaboratorEditDialog({ open, onOpenChange, collaborator }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    cpf: '',
    rg: '',
    email: '',
    telefone: '',
    data_nascimento: '',
    endereco: '',
    role_name: '',
    worksite: '',
    sector_id: '',
    observacoes: '',
  });

  const { data: sectors } = useQuery({
    queryKey: ['sectors-list'],
    queryFn: async () => {
      const { data } = await supabase.from('sectors').select('id, name').eq('active', true).order('name');
      return data || [];
    },
  });

  useEffect(() => {
    if (collaborator) {
      setForm({
        full_name: collaborator.full_name || '',
        cpf: collaborator.cpf || '',
        rg: collaborator.rg || '',
        email: collaborator.email || '',
        telefone: collaborator.telefone || '',
        data_nascimento: collaborator.data_nascimento || '',
        endereco: collaborator.endereco || '',
        role_name: collaborator.role_name || '',
        worksite: collaborator.worksite || '',
        sector_id: collaborator.sector_id || '',
        observacoes: collaborator.observacoes || '',
      });
    }
  }, [collaborator]);

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    if (form.cpf && !isValidCPF(form.cpf)) {
      toast({ title: 'CPF inválido', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        cpf: form.cpf ? form.cpf.replace(/\D/g, '') : null,
        rg: form.rg.trim() || null,
        email: form.email.trim() || null,
        telefone: form.telefone ? form.telefone.replace(/\D/g, '') : null,
        data_nascimento: form.data_nascimento || null,
        endereco: form.endereco.trim() || null,
        role_name: form.role_name.trim(),
        worksite: form.worksite.trim(),
        sector_id: form.sector_id || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (collaborator?.id) {
        const { error } = await from('collaborators').update(payload).eq('id', collaborator.id);
        if (error) throw error;
        toast({ title: 'Colaborador atualizado' });
      } else {
        const { error } = await from('collaborators').insert(payload).select().single();
        if (error) throw error;
        toast({ title: 'Colaborador cadastrado' });
      }
      qc.invalidateQueries({ queryKey: ['collaborators'] });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{collaborator?.id ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome Completo *</Label>
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CPF</Label>
              <Input value={maskCPF(form.cpf)} onChange={e => setForm(f => ({ ...f, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) }))} placeholder="000.000.000-00" />
              {form.cpf.length === 11 && !isValidCPF(form.cpf) && <p className="text-[10px] text-destructive">CPF inválido</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RG</Label>
              <Input value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} placeholder="Opcional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={maskPhone(form.telefone)} onChange={e => setForm(f => ({ ...f, telefone: e.target.value.replace(/\D/g, '').slice(0, 11) }))} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data de Nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo/Função</Label>
              <Input value={form.role_name} onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={form.sector_id} onValueChange={v => setForm(f => ({ ...f, sector_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(sectors || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Obra/Unidade</Label>
              <Input value={form.worksite} onChange={e => setForm(f => ({ ...f, worksite: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endereço</Label>
            <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Rua, número, bairro, cidade - UF" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
