import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Settings2, Trash2, Pencil, Package } from 'lucide-react';
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

interface KitGroup {
  key: string;
  sectorId: string | null;
  sectorName: string;
  roleName: string;
  rules: any[];
}

export default function EpiKitRulesPage() {
  const { data: rules, isLoading } = useEpiKitRules(undefined, true);
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
  const [editingKit, setEditingKit] = useState<KitGroup | null>(null);
  const [sectorId, setSectorId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchEpi, setSearchEpi] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Group rules by sector+role
  const grouped: KitGroup[] = [];
  const groupMap = new Map<string, KitGroup>();
  (rules || []).forEach((r: any) => {
    const key = `${r.sector_id || 'none'}::${r.role_name || ''}`;
    if (!groupMap.has(key)) {
      const group: KitGroup = {
        key,
        sectorId: r.sector_id || null,
        sectorName: r.sector?.name || 'Sem Setor',
        roleName: r.role_name || '',
        rules: [],
      };
      groupMap.set(key, group);
      grouped.push(group);
    }
    groupMap.get(key)!.rules.push(r);
  });

  const buildLineItems = (existingRules?: any[]) => {
    const existingMap = new Map<string, any>();
    (existingRules || []).forEach(r => existingMap.set(r.epi_item_id, r));

    return (epiItems || []).map((e: any) => {
      const existing = existingMap.get(e.id);
      return {
        epi_item_id: e.id,
        quantity: existing ? String(existing.quantity) : '1',
        required: existing ? existing.required : true,
        selected: !!existing,
      };
    });
  };

  const openCreateDialog = () => {
    setEditingKit(null);
    setSectorId('');
    setRoleName('');
    setCategoryFilter('');
    setSearchEpi('');
    setLineItems(buildLineItems());
    setDialogOpen(true);
  };

  const openEditDialog = (kit: KitGroup) => {
    setEditingKit(kit);
    setSectorId(kit.sectorId || '');
    setRoleName(kit.roleName);
    setCategoryFilter('');
    setSearchEpi('');
    setLineItems(buildLineItems(kit.rules));
    setDialogOpen(true);
  };

  const toggleItem = (epiItemId: string, checked: boolean) => {
    setLineItems(prev => prev.map(l => l.epi_item_id === epiItemId ? { ...l, selected: checked } : l));
  };

  const updateItemField = (epiItemId: string, field: 'quantity' | 'required', value: any) => {
    setLineItems(prev => prev.map(l => l.epi_item_id === epiItemId ? { ...l, [field]: value } : l));
  };

  const selectedItems = lineItems.filter(l => l.selected);

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await from('epi_kit_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-kit-rules'] }); toast({ title: 'Regra removida' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteKit = useMutation({
    mutationFn: async (kit: KitGroup) => {
      for (const r of kit.rules) {
        const { error } = await from('epi_kit_rules').delete().eq('id', r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-kit-rules'] }); toast({ title: 'Kit removido' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleSave = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    try {
      const targetSectorId = sectorId || null;

      // If editing, remove rules that were deselected and update existing ones
      if (editingKit) {
        const selectedIds = new Set(selectedItems.map(l => l.epi_item_id));
        const existingMap = new Map(editingKit.rules.map((r: any) => [r.epi_item_id, r]));

        // Delete deselected
        for (const r of editingKit.rules) {
          if (!selectedIds.has(r.epi_item_id)) {
            await from('epi_kit_rules').delete().eq('id', r.id);
          }
        }

        // Update existing or insert new
        for (const line of selectedItems) {
          const existing = existingMap.get(line.epi_item_id);
          if (existing) {
            await from('epi_kit_rules').update({
              quantity: parseInt(line.quantity) || 1,
              required: line.required,
              sector_id: targetSectorId,
              role_name: roleName,
            }).eq('id', existing.id);
          } else {
            await from('epi_kit_rules').insert({
              sector_id: targetSectorId,
              role_name: roleName,
              epi_item_id: line.epi_item_id,
              quantity: parseInt(line.quantity) || 1,
              required: line.required,
            });
          }
        }
      } else {
        // Create mode — check duplicates
        const existingItemIds = new Set(
          (rules || [])
            .filter((r: any) => {
              const sMatch = (!targetSectorId && !r.sector_id) || r.sector_id === targetSectorId;
              const rMatch = (r.role_name || '') === roleName;
              return sMatch && rMatch;
            })
            .map((r: any) => r.epi_item_id)
        );

        const payloads = selectedItems
          .filter(l => !existingItemIds.has(l.epi_item_id))
          .map(l => ({
            sector_id: targetSectorId,
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

        const { error } = await from('epi_kit_rules').insert(payloads);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ['epi-kit-rules'] });
      toast({ title: editingKit ? 'Kit atualizado com sucesso' : `${selectedItems.length} regra(s) de kit adicionada(s)` });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
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

  const kitLabel = (g: KitGroup) => {
    const parts = [g.sectorName];
    if (g.roleName) parts.push(g.roleName);
    return parts.join(' — ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-primary" /> Kit de EPI por Setor / Cargo
          </h1>
          <p className="text-sm text-muted-foreground">Configure os EPIs obrigatórios por setor e função</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" /> Montar Kit
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="pt-6"><p className="text-center py-8 text-muted-foreground">Nenhuma regra de kit configurada</p></CardContent></Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {grouped.map(g => (
            <AccordionItem key={g.key} value={g.key} className="border border-border rounded-lg overflow-hidden bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Package className="w-5 h-5 text-primary shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <span className="font-semibold text-sm">{kitLabel(g)}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">{g.rules.length} item(ns)</Badge>
                      {g.rules.some((r: any) => !r.active) && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Contém inativos</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex justify-end gap-2 mb-3">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEditDialog(g)}>
                    <Pencil className="w-3.5 h-3.5" /> Editar Kit
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => deleteKit.mutate(g)}>
                    <Trash2 className="w-3.5 h-3.5" /> Excluir Kit
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                      <th className="py-2 px-3 font-medium text-muted-foreground">Categoria</th>
                      <th className="py-2 px-3 font-medium text-muted-foreground">Qtd</th>
                      <th className="py-2 px-3 font-medium text-muted-foreground">Obrigatório</th>
                      <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="py-2 px-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rules.map((r: any) => (
                      <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/50 ${!r.active ? 'opacity-50' : ''}`}>
                        <td className="py-2.5 px-3 font-medium">
                          {r.epi_item?.name || '—'}
                          <span className="text-xs text-muted-foreground ml-1">({r.epi_item?.code})</span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground text-xs">{r.epi_item?.category || '—'}</td>
                        <td className="py-2.5 px-3">{r.quantity}</td>
                        <td className="py-2.5 px-3">
                          {r.required
                            ? <Badge variant="default" className="text-[10px]">Sim</Badge>
                            : <Badge variant="secondary" className="text-[10px]">Não</Badge>}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant={r.active ? 'default' : 'outline'} className="text-[10px]">
                            {r.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => deleteRule.mutate(r.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingKit ? 'Editar Kit de EPI' : 'Montar Kit de EPI'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                        <Checkbox checked={line.selected} onCheckedChange={v => toggleItem(e.id, !!v)} />
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
                              <Checkbox checked={line.required} onCheckedChange={v => updateItemField(e.id, 'required', !!v)} />
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
              {editingKit ? `Salvar Alterações (${selectedItems.length} itens)` : `Salvar Kit (${selectedItems.length} itens)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
