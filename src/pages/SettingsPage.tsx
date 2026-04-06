import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useRequestLimits, useUpsertRequestLimit, useDeleteRequestLimit } from '@/hooks/useRequestLimits';

import { REQUEST_TYPE_LABELS } from '@/lib/constants';
import { Settings, Plus, Pencil, Trash2, Loader2, Gauge } from 'lucide-react';

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  diretoria: 'Diretoria',
  administrativo: 'Administrativo',
  rh: 'Recursos Humanos',
  supervisor: 'Supervisor',
  colaborador: 'Colaborador',
  compras: 'Compras',
  financeiro: 'Financeiro',
};

const AVAILABLE_ROLES = ['diretoria', 'administrativo', 'rh', 'supervisor', 'colaborador', 'compras', 'financeiro'];
const AVAILABLE_TYPES = ['abastecimento', 'reembolso', 'diaria'];

export default function SettingsPage() {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['diretoria', 'administrativo']);

  if (!isAdmin) {
    return <Navigate to="/perfil" replace />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configurações do sistema</p>
      </div>

      <RequestLimitsSection />
    </div>
  );
}

function RequestLimitsSection() {
  const { data: limits, isLoading } = useRequestLimits();
  const upsertMutation = useUpsertRequestLimit();
  const deleteMutation = useDeleteRequestLimit();
  const [editItem, setEditItem] = useState<{ id?: string; role: string; request_type: string; daily_limit: number } | null>(null);

  const handleSave = async () => {
    if (!editItem) return;
    await upsertMutation.mutateAsync(editItem);
    setEditItem(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="w-4 h-4" /> Limites de Solicitações
              </CardTitle>
              <CardDescription>
                Configure o limite diário de solicitações por perfil e tipo. Caso não exista regra, o limite padrão é 5.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={() => setEditItem({ role: 'colaborador', request_type: 'abastecimento', daily_limit: 5 })}>
              <Plus className="w-4 h-4" /> Novo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : !limits || limits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum limite configurado. O padrão de 5 solicitações/dia será usado para todos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Limite Diário</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {limits.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{ROLE_DISPLAY_LABELS[l.role] || l.role}</TableCell>
                    <TableCell>{REQUEST_TYPE_LABELS[l.request_type] || l.request_type}</TableCell>
                    <TableCell className="text-center font-semibold">{l.daily_limit}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem({ id: l.id, role: l.role, request_type: l.request_type, daily_limit: l.daily_limit })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(l.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Editar Limite' : 'Novo Limite'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={editItem.role} onValueChange={v => setEditItem({ ...editItem, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ROLES.map(r => (
                      <SelectItem key={r} value={r}>{ROLE_DISPLAY_LABELS[r] || r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Solicitação</Label>
                <Select value={editItem.request_type} onValueChange={v => setEditItem({ ...editItem, request_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{REQUEST_TYPE_LABELS[t] || t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Limite Diário</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={editItem.daily_limit}
                  onChange={e => setEditItem({ ...editItem, daily_limit: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
