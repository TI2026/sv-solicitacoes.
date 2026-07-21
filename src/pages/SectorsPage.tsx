import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Pencil, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProfiles } from '@/modules/permissions/hooks/usePermissionsData';

function useSectors() {
  return useQuery({
    queryKey: ['sectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sectors')
        .select('*, responsible:profiles!sectors_responsible_user_id_fkey(id, full_name), substitute:profiles!sectors_substitute_user_id_fkey(id, full_name)')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });
}

export default function SectorsPage() {
  const { hasRole } = useAuth();
  const isDiretoria = hasRole('diretoria');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: sectors, isLoading } = useSectors();
  const { data: profiles } = useProfiles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [form, setForm] = useState({
    name: '', code: '', responsible_user_id: '', substitute_user_id: '', active: true,
  });

  useRealtimeSubscription({
    channelName: 'sectors-realtime',
    enabled: true,
    tables: [{ table: 'sectors', queryKeys: [['sectors']] }],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.code.trim()) throw new Error('Nome e código são obrigatórios');
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toLowerCase().replace(/\s+/g, '_'),
        responsible_user_id: form.responsible_user_id || null,
        substitute_user_id: form.substitute_user_id || null,
        active: form.active,
      };
      if (editId) {
        const { error } = await supabase.from('sectors').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sectors').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sectors'] });
      setDialogOpen(false);
      toast({ title: editId ? 'Setor atualizado!' : 'Setor criado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', code: '', responsible_user_id: '', substitute_user_id: '', active: true });
    setDialogOpen(true);
  };

  const openEdit = (sector: any) => {
    setEditId(sector.id);
    setForm({
      name: sector.name,
      code: sector.code,
      responsible_user_id: sector.responsible_user_id || '',
      substitute_user_id: sector.substitute_user_id || '',
      active: sector.active,
    });
    setDialogOpen(true);
  };

  const filtered = (sectors || []).filter((s: any) => {
    if (filter === 'active') return s.active;
    if (filter === 'inactive') return !s.active;
    return true;
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Setores</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerenciamento de setores da empresa</p>
        </div>
        {isDiretoria && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Setor
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {(['all', 'active', 'inactive'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : 'Inativos'}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <EmptyState
            icon={Building2}
            title="Nenhum setor encontrado"
            description="Ajuste os filtros ou cadastre um novo setor."
          />
        )}
        {filtered.map((s: any) => (
          <Card key={s.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.active ? 'default' : 'secondary'} className="text-xs">
                    {s.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  {isDiretoria && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="gap-1">
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                <span>Responsável: {s.responsible?.full_name || '—'}</span>
                <span>Substituto: {s.substitute?.full_name || '—'}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Novo'} Setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Administrativo" />
            </div>
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="Ex: administrativo" />
            </div>
            <div className="space-y-2">
              <Label>Responsável Principal</Label>
              <Select value={form.responsible_user_id} onValueChange={v => setForm(p => ({ ...p, responsible_user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {profiles?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável Substituto</Label>
              <Select value={form.substitute_user_id} onValueChange={v => setForm(p => ({ ...p, substitute_user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {profiles?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim() || !form.code.trim()}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
