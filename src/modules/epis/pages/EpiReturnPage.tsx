import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Undo2, Search, Plus } from 'lucide-react';
import { useEpiDeliveries, useUpdateDeliveryStatus } from '../hooks/useEpiQueries';
import { EPI_DELIVERY_STATUS_LABELS } from '../types';
import { StatusBadge } from '@/components/StatusBadge';
import { PhotoUpload } from '../components/PhotoUpload';

export default function EpiReturnPage() {
  const [search, setSearch] = useState('');
  const { data: deliveries, isLoading } = useEpiDeliveries();
  const updateStatus = useUpdateDeliveryStatus();

  // Single return dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ movement_type: 'return', condition: 'bom', reason: '', notes: '' });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  // Multi-return flow: step 1 = select collaborator, step 2 = select EPIs
  const [selectDialogOpen, setSelectDialogOpen] = useState(false);
  const [selectSearch, setSelectSearch] = useState('');
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string | null>(null);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<string>>(new Set());
  const [multiDialogOpen, setMultiDialogOpen] = useState(false);
  const [multiForm, setMultiForm] = useState({ movement_type: 'return', condition: 'bom', reason: '', notes: '' });
  const [multiPhotoUrls, setMultiPhotoUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const activeDeliveries = (deliveries || []).filter((d: any) => ['entregue', 'em_uso', 'pendente_devolucao'].includes(d.current_status));

  const filtered = activeDeliveries.filter((d: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.collaborator?.full_name?.toLowerCase().includes(s) || d.epi_item?.name?.toLowerCase().includes(s);
  });

  // Group active deliveries by collaborator
  const collaboratorMap = new Map<string, { name: string; items: any[] }>();
  activeDeliveries.forEach((d: any) => {
    const cid = d.collaborator_id;
    if (!cid) return;
    if (!collaboratorMap.has(cid)) {
      collaboratorMap.set(cid, { name: d.collaborator?.full_name || '—', items: [] });
    }
    collaboratorMap.get(cid)!.items.push(d);
  });

  const collaboratorList = Array.from(collaboratorMap.entries())
    .map(([id, { name, items }]) => ({ id, name, items }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredCollaborators = collaboratorList.filter(c => {
    if (!selectSearch) return true;
    const s = selectSearch.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.items.some((d: any) => d.epi_item?.name?.toLowerCase().includes(s));
  });

  // Single return
  const openReturn = (d: any) => {
    setSelected(d);
    setForm({ movement_type: 'return', condition: 'bom', reason: '', notes: '' });
    setPhotoUrls([]);
    setDialogOpen(true);
  };

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

  // Multi return flow
  const openSelectDialog = () => {
    setSelectSearch('');
    setSelectedCollaboratorId(null);
    setSelectedDeliveryIds(new Set());
    setSelectDialogOpen(true);
  };

  const selectCollaborator = (cid: string) => {
    setSelectedCollaboratorId(cid);
    setSelectedDeliveryIds(new Set());
  };

  const toggleDelivery = (id: string) => {
    setSelectedDeliveryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = (items: any[]) => {
    const allSelected = items.every((d: any) => selectedDeliveryIds.has(d.id));
    if (allSelected) {
      setSelectedDeliveryIds(new Set());
    } else {
      setSelectedDeliveryIds(new Set(items.map((d: any) => d.id)));
    }
  };

  const openMultiReturn = () => {
    setMultiForm({ movement_type: 'return', condition: 'bom', reason: '', notes: '' });
    setMultiPhotoUrls([]);
    setSelectDialogOpen(false);
    setMultiDialogOpen(true);
  };

  const handleMultiReturn = async () => {
    if (selectedDeliveryIds.size === 0) return;
    setSaving(true);
    const statusMap: Record<string, string> = { return: 'devolvido', loss: 'perdido', disposal: 'baixado' };
    try {
      for (const id of selectedDeliveryIds) {
        await updateStatus.mutateAsync({
          id,
          status: statusMap[multiForm.movement_type] || 'devolvido',
          movement_type: multiForm.movement_type,
          condition: multiForm.condition,
          reason: multiForm.reason,
          notes: multiForm.notes,
        });
      }
      setMultiDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const selectedCollabData = selectedCollaboratorId ? collaboratorMap.get(selectedCollaboratorId) : null;
  const selectedItems = selectedCollabData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Undo2 className="w-6 h-6 text-primary" /> Devoluções de EPI</h1>
          <p className="text-sm text-muted-foreground">Registre devoluções, perdas e descartes</p>
        </div>
        <Button onClick={openSelectDialog} className="gap-2"><Plus className="w-4 h-4" /> Nova Devolução</Button>
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
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Matrícula</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">EPI</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Entrega</th>
                  <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {filtered.map((d: any) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{d.collaborator?.full_name || '—'}</td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{d.collaborator?.matricula || '—'}</td>
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

      {/* Single return dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Movimentação — {selected?.epi_item?.name}</DialogTitle>
            <DialogDescription>Preencha os dados da devolução abaixo</DialogDescription>
          </DialogHeader>
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
            <PhotoUpload label="Fotos da Devolução (opcional)" folder="returns" maxFiles={5} onPhotosChange={setPhotoUrls} />
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

      {/* Select collaborator + EPIs dialog */}
      <Dialog open={selectDialogOpen} onOpenChange={setSelectDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCollaboratorId ? 'Selecionar EPIs para Devolução' : 'Selecionar Colaborador'}</DialogTitle>
            <DialogDescription>
              {selectedCollaboratorId
                ? `Marque os EPIs de ${selectedCollabData?.name} que deseja devolver`
                : 'Escolha o colaborador para ver seus EPIs ativos'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!selectedCollaboratorId ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar colaborador..." value={selectSearch} onChange={e => setSelectSearch(e.target.value)} className="pl-9" />
                </div>
                {filteredCollaborators.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhum colaborador com EPI ativo</p>
                ) : (
                  <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
                    {filteredCollaborators.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center justify-between gap-2"
                        onClick={() => selectCollaborator(c.id)}
                      >
                        <div>
                          <p className="font-medium text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.items.length} EPI(s) ativo(s)</p>
                        </div>
                        <span className="text-xs text-muted-foreground">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={() => setSelectedCollaboratorId(null)}>
                  ← Voltar
                </Button>
                <div className="flex items-center gap-2 pb-1 border-b border-border">
                  <Checkbox
                    checked={selectedItems.length > 0 && selectedItems.every((d: any) => selectedDeliveryIds.has(d.id))}
                    onCheckedChange={() => toggleAll(selectedItems)}
                  />
                  <span className="text-xs font-medium text-muted-foreground">Selecionar todos ({selectedItems.length})</span>
                </div>
                <div className="divide-y divide-border max-h-[45vh] overflow-y-auto">
                  {selectedItems.map((d: any) => (
                    <label key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedDeliveryIds.has(d.id)}
                        onCheckedChange={() => toggleDelivery(d.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{d.epi_item?.name || '—'}{d.size ? ` (${d.size})` : ''}</p>
                        <p className="text-xs text-muted-foreground">Entregue em {new Date(d.delivered_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <StatusBadge status={d.current_status} label={EPI_DELIVERY_STATUS_LABELS[d.current_status] || d.current_status} />
                    </label>
                  ))}
                </div>
                <div className="pt-2 flex justify-end">
                  <Button disabled={selectedDeliveryIds.size === 0} onClick={openMultiReturn} className="gap-1.5">
                    Devolver {selectedDeliveryIds.size > 0 ? `(${selectedDeliveryIds.size})` : ''}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Multi-return form dialog */}
      <Dialog open={multiDialogOpen} onOpenChange={setMultiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Devolução — {selectedDeliveryIds.size} item(ns)</DialogTitle>
            <DialogDescription>Colaborador: {selectedCollabData?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* List selected items */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {Array.from(selectedDeliveryIds).map(id => {
                const d = activeDeliveries.find((del: any) => del.id === id);
                return d ? (
                  <p key={id} className="text-xs text-muted-foreground">• {d.epi_item?.name}{d.size ? ` (${d.size})` : ''}</p>
                ) : null;
              })}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={multiForm.movement_type} onValueChange={v => setMultiForm(f => ({ ...f, movement_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="return">Devolução</SelectItem>
                  <SelectItem value="loss">Perda / Extravio</SelectItem>
                  <SelectItem value="disposal">Descarte / Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condição dos Itens</Label>
              <Select value={multiForm.condition} onValueChange={v => setMultiForm(f => ({ ...f, condition: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bom">Bom</SelectItem>
                  <SelectItem value="desgastado">Desgastado</SelectItem>
                  <SelectItem value="danificado">Danificado</SelectItem>
                  <SelectItem value="inutilizavel">Inutilizável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Motivo</Label><Input value={multiForm.reason} onChange={e => setMultiForm(f => ({ ...f, reason: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={multiForm.notes} onChange={e => setMultiForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <PhotoUpload label="Fotos da Devolução (opcional)" folder="returns" maxFiles={5} onPhotosChange={setMultiPhotoUrls} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMultiDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleMultiReturn} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Confirmar ({selectedDeliveryIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
