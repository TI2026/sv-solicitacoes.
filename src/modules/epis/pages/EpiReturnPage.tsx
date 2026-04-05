import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Undo2, Search } from 'lucide-react';
import { useEpiDeliveries, useUpdateDeliveryStatus } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import { PhotoUpload } from '../components/PhotoUpload';

export default function EpiReturnPage() {
  const [search, setSearch] = useState('');
  const { data: deliveries, isLoading } = useEpiDeliveries();
  const updateStatus = useUpdateDeliveryStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ movement_type: 'return', condition: 'bom', reason: '', notes: '' });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const openReturn = (d: any) => { setSelected(d); setForm({ movement_type: 'return', condition: 'bom', reason: '', notes: '' }); setPhotoUrls([]); setDialogOpen(true); };

  const handleReturn = async () => {
    if (!selected) return;
    const statusMap: Record<string, string> = { return: 'devolvido', loss: 'perdido', disposal: 'baixado' };
    await updateStatus.mutateAsync({
      id: selected.id,
      status: statusMap[form.movement_type] || 'devolvido',
      movement_type: form.movement_type,
      condition: form.condition,
      reason: form.reason,
      notes: form.notes,
    });
    setDialogOpen(false);
  };

  const activeDeliveries = (deliveries || []).filter(d => ['entregue', 'em_uso', 'pendente_devolucao'].includes(d.current_status));
  const filtered = activeDeliveries.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.collaborator?.full_name?.toLowerCase().includes(s) || d.epi_item?.name?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Undo2 className="w-6 h-6 text-primary" /> Devoluções de EPI</h1>
        <p className="text-sm text-muted-foreground">Registre devoluções, perdas e descartes</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar colaborador ou EPI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhum EPI pendente de devolução</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Entrega</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name || '—'}</td>
                      <td className="py-2.5 px-3">{d.epi_item?.name || '—'}{d.size ? ` (${d.size})` : ''}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} /></td>
                      <td className="py-2.5 px-3"><Button variant="outline" size="sm" onClick={() => openReturn(d)}>Devolver</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Movimentação — {selected?.epi_item?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Colaborador: <strong>{selected?.collaborator?.full_name}</strong></p>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.movement_type} onValueChange={v => setForm(f => ({ ...f, movement_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="return">Devolução</SelectItem>
                  <SelectItem value="loss">Perda / Extravio</SelectItem>
                  <SelectItem value="disposal">Descarte / Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condição do Item</Label>
              <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bom">Bom</SelectItem>
                  <SelectItem value="desgastado">Desgastado</SelectItem>
                  <SelectItem value="danificado">Danificado</SelectItem>
                  <SelectItem value="inutilizavel">Inutilizável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Motivo</Label><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleReturn} disabled={updateStatus.isPending}>
              {updateStatus.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
