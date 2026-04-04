import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { useEpiKitRules, useEpiItems } from '../hooks/useEpiQueries';
import { EPI_CATEGORIES } from '../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const from = (table: string) => (supabase as any).from(table);

interface LineItem {
  epi_item_id: string;
  quantity: string;
  required: boolean;
  selected: boolean;
}

export default function EpiKitRulesPage() {
  const { data: rules, isLoading } = useEpiKitRules();
  const { data: epiItems } = useEpiItems({ active: true });
  const { data: sectors } = useQuery({
    queryKey: ['sectors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sectors').select('*').eq('active', true).order('name');
      if (error) throw error;
      return data || [];
    },
  });
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [sectorId, setSectorId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchEpi, setSearchEpi] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const openDialog = () => {
    setSectorId('');
    setRoleName('');
    setCategoryFilter('');
    setSearchEpi('');
    // Build line items from all active EPIs
    const items: LineItem[] = (epiItems || []).map((e: any) => ({
      epi_item_id: e.id,
      quantity: '1',
      required: true,
      selected: false,
    }));
    setLineItems(items);
    setDialogOpen(true);
  };

  const toggleItem = (epiItemId: string, checked: boolean) => {
    setLineItems(prev => prev.map(l => l.epi_item_id === epiItemId ? { ...l, selected: checked } : l));
  };

  const updateItemField = (epiItemId: string, field: 'quantity' | 'required', value: any) => {
    setLineItems(prev => prev.map(l => l.epi_item_id === epiItemId ? { ...l, [field]: value } : l));
  };

  const selectedItems = lineItems.filter(l => l.selected);

  const createRules = useMutation({
    mutationFn: async (payloads: Record<string, any>[]) => {
      const { error } = await from('epi_kit_rules').insert(payloads);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['epi-kit-rules'] });
      toast({ title: `${selectedItems.length} regra(s) de kit adicionada(s)` });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await from('epi_kit_rules').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epi-kit-rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await from('epi_kit_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-kit-rules'] }); toast({ title: 'Regra removida' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleSave = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    try {
      // Find existing rules for this sector/role to avoid duplicates
      const existingItemIds = new Set(
        (rules || [])
          .filter((r: any) => {
            const sMatch = (!sectorId && !r.sector_id) || r.sector_id === sectorId;
            const rMatch = (r.role_name || '') === roleName;
            return sMatch && rMatch;
          })
          .map((r: any) => r.epi_item_id)
      );

      const payloads = selectedItems
        .filter(l => !existingItemIds.has(l.epi_item_id))
        .map(l => ({
          sector_id: sectorId || null,
          role_name: roleName,
          epi_item_id: l.epi_item_id,
          quantity: parseInt(l.quantity) || 1,
          required: l.required,
        }));

      if (payloads.length === 0) {
        toast({ title: 'Todos os itens selecionados já existem neste kit', variant: 'destructive' });
        setSaving(false);
        return;
      }

      await createRules.mutateAsync(payloads);
    } finally {
      setSaving(false);
    }
  };

  // Filter EPIs in dialog
  const filteredEpis = (epiItems || []).filter((e: any) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (searchEpi) {
      const s = searchEpi.toLowerCase();
      return e.name.toLowerCase().includes(s) || e.code.toLowerCase().includes(s);
    }
    return true;
  });

  // Group existing rules by sector
  const grouped = new Map<string, any[]>();
  (rules || []).forEach((r: any) => {
    const key = r.sector?.name || 'Sem Setor';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Settings2 className="w-6 h-6 text-primary" /> Kit de EPI por Setor / Cargo</h1>
          <p className="text-sm text-muted-foreground">Configure os EPIs obrigatórios por setor e função</p>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <Plus className="w-4 h-4" /> Montar Kit
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : grouped.size === 0 ? (
        <Card><CardContent className="pt-6"><p className="text-center py-8 text-muted-foreground">Nenhuma regra de kit configurada</p></CardContent></Card>
      ) : (
        Array.from(grouped.entries()).map(([sectorName, sectorRules]) => (
          <Card key={sectorName}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{sectorName}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Cargo/Função</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Qtd</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Obrigatório</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 w-20"></th>
                </tr></thead>
                <tbody>
                  {sectorRules.map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{r.epi_item?.name || '—'}<span className="text-xs text-muted-foreground ml-1">({r.epi_item?.code})</span></td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground">{r.role_name || 'Todos'}</td>
                      <td className="py-2.5 px-3">{r.quantity}</td>
                      <td className="py-2.5 px-3">{r.required ? <Badge variant="default" className="text-[10px]">Sim</Badge> : <Badge variant="secondary" className="text-[10px]">Não</Badge>}</td>
                      <td className="py-2.5 px-3">
                        <Switch checked={r.active} onCheckedChange={v => toggleRule.mutate({ id: r.id, active: v })} />
                      </td>
                      <td className="py-2.5 px-3">
                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => deleteRule.mutate(r.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Montar Kit de EPI</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Header: sector + role */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={sectorId || 'all'} onValueChange={v => setSectorId(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Todos os setores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os setores</SelectItem>
                    {(sectors || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo / Função</Label>
                <Input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Deixe vazio para todos os cargos" />
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Filtrar por Categoria</Label>
                <Select value={categoryFilter || 'all'} onValueChange={v => setCategoryFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {EPI_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Buscar EPI</Label>
                <Input value={searchEpi} onChange={e => setSearchEpi(e.target.value)} placeholder="Nome ou código..." />
              </div>
            </div>

            {/* EPI checklist */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Selecione os EPIs do Kit</Label>
                <span className="text-xs text-muted-foreground">{selectedItems.length} selecionado(s)</span>
              </div>

              <div className="border border-border rounded-lg max-h-[340px] overflow-y-auto divide-y divide-border">
                {filteredEpis.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-sm">Nenhum EPI encontrado</p>
                ) : (
                  filteredEpis.map((e: any) => {
                    const line = lineItems.find(l => l.epi_item_id === e.id);
                    if (!line) return null;
                    return (
                      <div key={e.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors ${line.selected ? 'bg-primary/5' : ''}`}>
                        <Checkbox
                          checked={line.selected}
                          onCheckedChange={v => toggleItem(e.id, !!v)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{e.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{e.code}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{e.category}</span>
                        </div>
                        {line.selected && (
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs text-muted-foreground">Qtd:</Label>
                              <Input
                                type="number" min="1" className="h-7 w-14 text-xs"
                                value={line.quantity}
                                onChange={ev => updateItemField(e.id, 'quantity', ev.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <Checkbox
                                checked={line.required}
                                onCheckedChange={v => updateItemField(e.id, 'required', !!v)}
                              />
                              <Label className="text-xs text-muted-foreground">Obrig.</Label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || selectedItems.length === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar Kit ({selectedItems.length} itens)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
