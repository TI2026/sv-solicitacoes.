import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Settings2, Trash2 } from 'lucide-react';
import { useEpiKitRules, useEpiItems } from '../hooks/useEpiQueries';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const from = (table: string) => (supabase as any).from(table);

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
  const [form, setForm] = useState({ sector_id: '', role_name: '', epi_item_id: '', quantity: '1', required: true });

  const createRule = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { error } = await from('epi_kit_rules').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-kit-rules'] }); toast({ title: 'Regra de kit adicionada' }); setDialogOpen(false); },
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

  const handleSave = () => {
    if (!form.epi_item_id) return;
    createRule.mutate({
      sector_id: form.sector_id || null,
      role_name: form.role_name,
      epi_item_id: form.epi_item_id,
      quantity: parseInt(form.quantity) || 1,
      required: form.required,
    });
  };

  // Group by sector
  const grouped = new Map<string, any[]>();
  (rules || []).forEach(r => {
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
        <Button onClick={() => { setForm({ sector_id: '', role_name: '', epi_item_id: '', quantity: '1', required: true }); setDialogOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Regra
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
                  {sectorRules.map(r => (
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Regra de Kit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={form.sector_id} onValueChange={v => setForm(f => ({ ...f, sector_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Todos os setores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {(sectors || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Cargo / Função</Label><Input value={form.role_name} onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))} placeholder="Deixe vazio para todos" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">EPI *</Label>
              <Select value={form.epi_item_id} onValueChange={v => setForm(f => ({ ...f, epi_item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(epiItems || []).map(e => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Quantidade</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.required} onCheckedChange={v => setForm(f => ({ ...f, required: v }))} /><Label className="text-xs">Obrigatório</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createRule.isPending || !form.epi_item_id}>
              {createRule.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
