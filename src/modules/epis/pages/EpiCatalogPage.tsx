import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Pencil, HardHat, Search } from 'lucide-react';
import { useEpiItems, useCreateEpiItem, useUpdateEpiItem } from '../hooks/useEpiQueries';
import { EPI_CATEGORIES } from '../types';
import { useToast } from '@/hooks/use-toast';

const emptyForm = { code: '', name: '', category: '', manufacturer: '', ca_number: '', ca_valid_until: '', useful_life_days: '', size_required: false, unit: 'un', active: true, notes: '' };

export default function EpiCatalogPage() {
  const [filters, setFilters] = useState<{ active?: boolean; category?: string }>({ active: true });
  const [search, setSearch] = useState('');
  const { data: items, isLoading } = useEpiItems(filters);
  const createItem = useCreateEpiItem();
  const updateItem = useUpdateEpiItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  const openCreate = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (item: any) => {
    setEditId(item.id);
    setForm({ code: item.code, name: item.name, category: item.category || '', manufacturer: item.manufacturer || '', ca_number: item.ca_number || '', ca_valid_until: item.ca_valid_until || '', useful_life_days: item.useful_life_days?.toString() || '', size_required: item.size_required, unit: item.unit, active: item.active, notes: item.notes || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: 'Código e nome são obrigatórios', variant: 'destructive' }); return; }
    const payload = { ...form, useful_life_days: form.useful_life_days ? parseInt(form.useful_life_days) : null, ca_valid_until: form.ca_valid_until || null };
    if (editId) {
      await updateItem.mutateAsync({ id: editId, ...payload });
    } else {
      await createItem.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const filtered = (items || []).filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s) || (i.ca_number || '').toLowerCase().includes(s);
  });

  const caExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 90 && diffDays > 0;
  };

  const caExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><HardHat className="w-6 h-6 text-primary" /> Cadastro de EPIs</h1>
          <p className="text-sm text-muted-foreground">Catálogo de equipamentos de proteção individual</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Novo EPI</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, código ou CA..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filters.category || 'all'} onValueChange={v => setFilters(f => ({ ...f, category: v === 'all' ? undefined : v }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {EPI_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.active === undefined ? 'all' : filters.active ? 'active' : 'inactive'} onValueChange={v => setFilters(f => ({ ...f, active: v === 'all' ? undefined : v === 'active' }))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhum EPI encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">Código</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Nome</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Categoria</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">CA</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">Validade CA</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground w-12"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-mono text-xs">{item.code}</td>
                      <td className="py-2.5 px-3 font-medium">{item.name}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground">{item.category || '—'}</td>
                      <td className="py-2.5 px-3 hidden lg:table-cell">{item.ca_number || '—'}</td>
                      <td className="py-2.5 px-3 hidden lg:table-cell">
                        {item.ca_valid_until ? (
                          <span className={caExpired(item.ca_valid_until) ? 'text-destructive font-medium' : caExpiringSoon(item.ca_valid_until) ? 'text-orange-600 font-medium' : ''}>
                            {new Date(item.ca_valid_until).toLocaleDateString('pt-BR')}
                            {caExpired(item.ca_valid_until) && ' (Vencido)'}
                            {caExpiringSoon(item.ca_valid_until) && ' (Vencendo)'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3"><Badge variant={item.active ? 'default' : 'secondary'}>{item.active ? 'Ativo' : 'Inativo'}</Badge></td>
                      <td className="py-2.5 px-3"><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Editar EPI' : 'Novo EPI'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Código *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Unidade</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{EPI_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Fabricante</Label><Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Nº CA</Label><Input value={form.ca_number} onChange={e => setForm(f => ({ ...f, ca_number: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Validade CA</Label><Input type="date" value={form.ca_valid_until} onChange={e => setForm(f => ({ ...f, ca_valid_until: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Vida Útil (dias)</Label><Input type="number" value={form.useful_life_days} onChange={e => setForm(f => ({ ...f, useful_life_days: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.size_required} onCheckedChange={v => setForm(f => ({ ...f, size_required: v }))} /><Label className="text-xs">Exige Tamanho</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} /><Label className="text-xs">Ativo</Label></div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
              {(createItem.isPending || updateItem.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
