import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Package, Search, Eye } from 'lucide-react';
import { useEpiDeliveries, useCreateDelivery, useCollaborators, useEpiItems } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS, EPI_REASON_LABELS } from '../types';
import { useNavigate } from 'react-router-dom';
import { getStatusVariant } from '@/lib/constants';
import { StatusBadge } from '@/components/StatusBadge';

function getDeliveryVariant(status: string): 'pending' | 'approved' | 'rejected' | 'info' {
  if (['devolvido', 'baixado'].includes(status)) return 'approved';
  if (['perdido'].includes(status)) return 'rejected';
  if (['pendente_devolucao'].includes(status)) return 'info';
  return 'pending';
}

export default function EpiDeliveryPage() {
  const [search, setSearch] = useState('');
  const { data: deliveries, isLoading } = useEpiDeliveries();
  const { data: collaborators } = useCollaborators({ active: true });
  const { data: epiItems } = useEpiItems({ active: true });
  const createDelivery = useCreateDelivery();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ collaborator_id: '', epi_item_id: '', quantity: '1', size: '', sector_id: '', worksite: '', reason: 'primeira_entrega', notes: '' });

  const handleSave = async () => {
    if (!form.collaborator_id || !form.epi_item_id) return;
    const collab = collaborators?.find(c => c.id === form.collaborator_id);
    await createDelivery.mutateAsync({
      collaborator_id: form.collaborator_id,
      epi_item_id: form.epi_item_id,
      quantity: parseInt(form.quantity) || 1,
      size: form.size || null,
      sector_id: collab?.sector_id || null,
      worksite: form.worksite || collab?.worksite || '',
      reason: form.reason,
      notes: form.notes,
    });
    setDialogOpen(false);
    setForm({ collaborator_id: '', epi_item_id: '', quantity: '1', size: '', sector_id: '', worksite: '', reason: 'primeira_entrega', notes: '' });
  };

  const filtered = (deliveries || []).filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.collaborator?.full_name?.toLowerCase().includes(s) || d.epi_item?.name?.toLowerCase().includes(s) || d.epi_item?.code?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Entregas de EPI</h1>
          <p className="text-sm text-muted-foreground">Registre e acompanhe entregas de equipamentos</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova Entrega</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por colaborador ou EPI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Nenhuma entrega encontrada</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left">
                  <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Qtd</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">Motivo</th>
                  <th className="py-2 px-3 w-12"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name || '—'}</td>
                      <td className="py-2.5 px-3">{d.epi_item?.name || '—'}{d.size ? ` (${d.size})` : ''}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell">{d.quantity}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell">{new Date(d.delivered_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} variant={getDeliveryVariant(d.current_status)} /></td>
                      <td className="py-2.5 px-3 hidden lg:table-cell text-muted-foreground">{EPI_REASON_LABELS[d.reason] || d.reason}</td>
                      <td className="py-2.5 px-3"><Button variant="ghost" size="icon" onClick={() => navigate(`/epis/history/${d.collaborator_id}`)}><Eye className="w-4 h-4" /></Button></td>
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
          <DialogHeader><DialogTitle>Nova Entrega de EPI</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs">Colaborador *</Label>
              <Select value={form.collaborator_id} onValueChange={v => setForm(f => ({ ...f, collaborator_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>{(collaborators || []).map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}{c.role_name ? ` — ${c.role_name}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">EPI *</Label>
              <Select value={form.epi_item_id} onValueChange={v => setForm(f => ({ ...f, epi_item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o EPI" /></SelectTrigger>
                <SelectContent>{(epiItems || []).map(e => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Quantidade</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Tamanho</Label><Input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} placeholder="P, M, G, 38..." /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Obra / Local</Label><Input value={form.worksite} onChange={e => setForm(f => ({ ...f, worksite: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EPI_REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createDelivery.isPending || !form.collaborator_id || !form.epi_item_id}>
              {createDelivery.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Registrar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
