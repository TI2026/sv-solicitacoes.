import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Car, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useVehicles, useUpsertVehicle, useDeleteVehicle, type Vehicle } from '../hooks/useVehicles';
import { isValidPlate } from '@/lib/masks';

const STATUS_LABEL: Record<Vehicle['status'], string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  manutencao: 'Manutenção',
};

const STATUS_VARIANT: Record<Vehicle['status'], 'default' | 'secondary' | 'outline'> = {
  ativo: 'default',
  inativo: 'outline',
  manutencao: 'secondary',
};

export default function VehiclesAdminPage() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading } = useVehicles();
  const upsert = useUpsertVehicle();
  const remove = useDeleteVehicle();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);

  const [form, setForm] = useState({ placa: '', modelo: '', km: '0', status: 'ativo' as Vehicle['status'], observacoes: '' });

  const filtered = useMemo(() => {
    if (!vehicles) return [];
    const q = search.trim().toUpperCase();
    if (!q) return vehicles;
    return vehicles.filter(v => v.placa.includes(q) || v.modelo.toUpperCase().includes(q));
  }, [vehicles, search]);

  const openNew = () => {
    setEditing(null);
    setForm({ placa: '', modelo: '', km: '0', status: 'ativo', observacoes: '' });
    setOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      placa: v.placa,
      modelo: v.modelo,
      km: String(v.km ?? 0),
      status: v.status,
      observacoes: v.observacoes || '',
    });
    setOpen(true);
  };

  const placaClean = form.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const canSubmit = isValidPlate(placaClean) && form.modelo.trim().length >= 2;

  const submit = async () => {
    if (!canSubmit || upsert.isPending) return;
    await upsert.mutateAsync({
      id: editing?.id,
      placa: placaClean,
      modelo: form.modelo.trim(),
      km: Number(form.km) || 0,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
    });
    setOpen(false);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await remove.mutateAsync(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/fleet')}>
          <ArrowLeft className="w-4 h-4" /> Voltar para Solicitações
        </Button>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Novo veículo
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Car className="w-5 h-5" /> Cadastro de Veículos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cadastre placas e modelos uma única vez. Os veículos ativos aparecerão no dropdown de novas solicitações de abastecimento.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar placa ou modelo..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              {search ? 'Nenhum veículo encontrado.' : 'Nenhum veículo cadastrado. Clique em "Novo veículo".'}
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2 px-2">Placa</th>
                    <th className="text-left py-2 px-2">Modelo</th>
                    <th className="text-right py-2 px-2 hidden sm:table-cell">KM</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-2 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="py-2 px-2 font-mono font-semibold">{v.placa}</td>
                      <td className="py-2 px-2">{v.modelo}</td>
                      <td className="py-2 px-2 text-right hidden sm:table-cell">{Number(v.km || 0).toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-2"><Badge variant={STATUS_VARIANT[v.status]} className="text-[10px]">{STATUS_LABEL[v.status]}</Badge></td>
                      <td className="py-2 px-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(v)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar veículo' : 'Novo veículo'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            <div className="space-y-2">
              <Label>Placa *</Label>
              <Input
                value={form.placa}
                onChange={e => setForm(f => ({ ...f, placa: e.target.value.toUpperCase().slice(0, 7) }))}
                placeholder="ABC1234 ou ABC1D23"
                maxLength={7}
                className="font-mono uppercase tracking-wider"
              />
              {form.placa && !isValidPlate(placaClean) && (
                <p className="text-xs text-destructive">Placa inválida (7 caracteres, padrão antigo ou Mercosul).</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Modelo *</Label>
              <Input value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value.slice(0, 80) }))} placeholder="Ex: Hilux SR 2.8" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>KM atual</Label>
                <Input type="number" inputMode="numeric" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as Vehicle['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value.slice(0, 400) }))} rows={3} />
            </div>
          </div>
          <div className="sticky bottom-0 bg-background border-t pt-3 mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={upsert.isPending}>Cancelar</Button>
            <Button onClick={submit} disabled={!canSubmit || upsert.isPending} className="gap-2">
              {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              O veículo <strong>{confirmDelete?.placa}</strong> deixará de aparecer no dropdown de novas solicitações. Solicitações antigas não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={remove.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {remove.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}