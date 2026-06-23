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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Car, Loader2, Pencil, Plus, Search, Trash2, TrendingDown, AlertTriangle, Activity, Calendar, DollarSign, Fuel, History } from 'lucide-react';
import { useVehicles, useUpsertVehicle, useDeleteVehicle, type Vehicle } from '../hooks/useVehicles';
import { useFuelHistory, buildVehicleAnalytics, type VehicleAnalytics } from '../hooks/useVehicleAnalytics';
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
}

function KpiCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number | string; hint?: string; tone?: 'neutral' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'border-destructive/40 bg-destructive/5' :
    tone === 'warning' ? 'border-amber-300/60 bg-amber-50 dark:bg-amber-950/20' :
    '';
  return (
    <Card className={toneClass}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {icon}{label}
        </div>
        <p className="text-xl font-bold text-foreground mt-1">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function VehiclesAdminPage_REMOVED() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading } = useVehicles();
  const { data: fuelHistory, isLoading: loadingHistory } = useFuelHistory();
  const upsert = useUpsertVehicle();
  const remove = useDeleteVehicle();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Vehicle | null>(null);

  const [form, setForm] = useState({ placa: '', modelo: '', km: '0', status: 'ativo' as Vehicle['status'], observacoes: '' });

  // History tab filters
  const [historyPlateFilter, setHistoryPlateFilter] = useState('all');
  const [historyDays, setHistoryDays] = useState<'30' | '90' | '180' | 'all'>('90');

  const analytics = useMemo<VehicleAnalytics[]>(
    () => fuelHistory ? buildVehicleAnalytics(fuelHistory) : [],
    [fuelHistory],
  );
  const analyticsByPlate = useMemo(() => {
    const m = new Map<string, VehicleAnalytics>();
    for (const a of analytics) m.set(a.placa, a);
    return m;
  }, [analytics]);

  // Top KPIs
  const kpis = useMemo(() => {
    const total = vehicles?.length || 0;
    const ativos = vehicles?.filter(v => v.status === 'ativo').length || 0;
    const manutencao = vehicles?.filter(v => v.status === 'manutencao').length || 0;
    const fills30d = analytics.reduce((s, a) => s + a.totalFills30d, 0);
    const spent30d = analytics.reduce((s, a) => s + a.totalSpent30d, 0);
    const alerts = analytics.filter(a => a.staleNoFill || a.lastDeltaAnomaly).length;
    return { total, ativos, manutencao, fills30d, spent30d, alerts };
  }, [vehicles, analytics]);

  const alertList = useMemo(() => analytics.filter(a => a.staleNoFill || a.lastDeltaAnomaly), [analytics]);

  const historyEntries = useMemo(() => {
    if (!fuelHistory) return [];
    let entries = fuelHistory;
    if (historyPlateFilter !== 'all') {
      entries = entries.filter(e => e.placa.toUpperCase() === historyPlateFilter);
    }
    if (historyDays !== 'all') {
      const days = parseInt(historyDays, 10);
      const cutoff = Date.now() - days * 24 * 3600 * 1000;
      entries = entries.filter(e => new Date(e.data_abastecimento + 'T12:00:00').getTime() >= cutoff);
    }
    const sorted = [...entries].sort((a, b) => b.data_abastecimento.localeCompare(a.data_abastecimento));
    // compute delta against previous in chronological order per plate
    const prevKm = new Map<string, number>();
    const chrono = [...entries].sort((a, b) => a.data_abastecimento.localeCompare(b.data_abastecimento));
    const deltaMap = new Map<string, number | null>();
    for (const e of chrono) {
      const prev = prevKm.get(e.placa.toUpperCase());
      const delta = prev != null ? Number(e.km) - prev : null;
      deltaMap.set(e.id, delta != null && delta > 0 && delta < 5000 ? delta : null);
      prevKm.set(e.placa.toUpperCase(), Number(e.km));
    }
    return sorted.map(e => ({ ...e, delta: deltaMap.get(e.id) ?? null }));
  }, [fuelHistory, historyPlateFilter, historyDays]);

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

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard icon={<Car className="w-4 h-4" />} label="Frota total" value={kpis.total} hint={`${kpis.ativos} ativos`} />
        <KpiCard icon={<Activity className="w-4 h-4" />} label="Em manutenção" value={kpis.manutencao} tone={kpis.manutencao > 0 ? 'warning' : 'neutral'} />
        <KpiCard icon={<Fuel className="w-4 h-4" />} label="Abastecimentos 30d" value={kpis.fills30d} />
        <KpiCard icon={<DollarSign className="w-4 h-4" />} label="Gasto 30d" value={`R$ ${kpis.spent30d.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
        <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Alertas" value={kpis.alerts} tone={kpis.alerts > 0 ? 'danger' : 'neutral'} />
        <KpiCard icon={<TrendingDown className="w-4 h-4" />} label="Veículos rastreados" value={analytics.length} hint="com histórico" />
      </div>

      <Tabs defaultValue="cadastro" className="space-y-3">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="cadastro" className="gap-1.5 text-xs"><Car className="w-3.5 h-3.5" />Cadastro</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5 text-xs"><History className="w-3.5 h-3.5" />Histórico</TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />Alertas
            {kpis.alerts > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{kpis.alerts}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro">
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
                    <th className="text-right py-2 px-2 hidden md:table-cell">ΔKM médio</th>
                    <th className="text-right py-2 px-2 hidden md:table-cell">R$/km</th>
                    <th className="text-left py-2 px-2 hidden lg:table-cell">Último ab.</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-right py-2 px-2 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const a = analyticsByPlate.get(v.placa.toUpperCase());
                    const alert = a && (a.staleNoFill || a.lastDeltaAnomaly);
                    return (
                    <tr key={v.id} className={`border-b border-border/60 hover:bg-muted/30 ${alert ? 'bg-destructive/5' : ''}`}>
                      <td className="py-2 px-2 font-mono font-semibold flex items-center gap-1.5">
                        {alert && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                        {v.placa}
                      </td>
                      <td className="py-2 px-2">{v.modelo}</td>
                      <td className="py-2 px-2 text-right hidden sm:table-cell">{Number(v.km || 0).toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-2 text-right hidden md:table-cell text-xs">
                        {a?.avgKmBetweenFills ? `${Math.round(a.avgKmBetweenFills).toLocaleString('pt-BR')} km` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right hidden md:table-cell text-xs">
                        {a?.avgCostPerKm ? `R$ ${a.avgCostPerKm.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-2 hidden lg:table-cell text-xs text-muted-foreground">
                        {a?.lastFillAt ? new Date(a.lastFillAt + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        {a?.daysSinceLastFill != null && (
                          <span className={`ml-1 ${a.staleNoFill ? 'text-destructive font-medium' : ''}`}>
                            ({a.daysSinceLastFill}d)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2"><Badge variant={STATUS_VARIANT[v.status]} className="text-[10px]">{STATUS_LABEL[v.status]}</Badge></td>
                      <td className="py-2 px-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(v)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="w-5 h-5" /> Histórico de Abastecimentos
              </CardTitle>
              <p className="text-sm text-muted-foreground">Filtre por placa e período para auditar consumo e variação de KM.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={historyPlateFilter} onValueChange={setHistoryPlateFilter}>
                  <SelectTrigger className="w-44 text-xs"><SelectValue placeholder="Placa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Todas as placas</SelectItem>
                    {analytics.map(a => (
                      <SelectItem key={a.placa} value={a.placa} className="text-xs font-mono">{a.placa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={historyDays} onValueChange={(v) => setHistoryDays(v as any)}>
                  <SelectTrigger className="w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30" className="text-xs">Últimos 30 dias</SelectItem>
                    <SelectItem value="90" className="text-xs">Últimos 90 dias</SelectItem>
                    <SelectItem value="180" className="text-xs">Últimos 180 dias</SelectItem>
                    <SelectItem value="all" className="text-xs">Todo o período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loadingHistory ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : historyEntries.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">Nenhum abastecimento no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-2"><Calendar className="w-3 h-3 inline mr-1" />Data</th>
                        <th className="text-left py-2 px-2">Placa</th>
                        <th className="text-right py-2 px-2">KM</th>
                        <th className="text-right py-2 px-2">ΔKM</th>
                        <th className="text-right py-2 px-2">Valor</th>
                        <th className="text-left py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyEntries.map((e: any) => {
                        const a = analyticsByPlate.get(e.placa.toUpperCase());
                        const isAnomaly = a?.avgKmBetweenFills && e.delta != null && e.delta < a.avgKmBetweenFills * 0.6;
                        return (
                          <tr key={e.id} className={`border-b border-border/60 hover:bg-muted/30 ${isAnomaly ? 'bg-destructive/5' : ''}`}>
                            <td className="py-2 px-2 text-xs">{new Date(e.data_abastecimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td className="py-2 px-2 font-mono font-semibold">{e.placa}</td>
                            <td className="py-2 px-2 text-right font-mono">{Number(e.km).toLocaleString('pt-BR')}</td>
                            <td className={`py-2 px-2 text-right font-mono text-xs ${isAnomaly ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                              {e.delta != null ? `+${e.delta.toLocaleString('pt-BR')}` : '—'}
                              {isAnomaly && <span title="Abaixo de 60% da média" className="ml-1">⚠</span>}
                            </td>
                            <td className="py-2 px-2 text-right text-xs">R$ {Number(e.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{e.status}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alertas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Alertas de Frota
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Consumo anômalo: último ΔKM &lt; 60% da média histórica (mín. 3 abastecimentos). Veículos sem abastecimento &gt; 30 dias.
              </p>
            </CardHeader>
            <CardContent>
              {alertList.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">✓ Nenhum alerta no momento.</p>
              ) : (
                <div className="space-y-2">
                  {alertList.map(a => (
                    <div key={a.placa} className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-mono font-bold text-sm">{a.placa}</p>
                        {a.staleNoFill && (
                          <p className="text-xs text-destructive">
                            Sem abastecimento há <b>{a.daysSinceLastFill} dias</b>
                            {a.lastFillAt && ` (último em ${new Date(a.lastFillAt + 'T12:00:00').toLocaleDateString('pt-BR')})`}
                          </p>
                        )}
                        {a.lastDeltaAnomaly && (
                          <p className="text-xs text-destructive">
                            Consumo anômalo: último ΔKM <b>{a.lastDelta?.toLocaleString('pt-BR')} km</b> · média <b>{Math.round(a.avgKmBetweenFills!).toLocaleString('pt-BR')} km</b>
                            <span className="ml-1 text-muted-foreground">({Math.round((a.lastDelta! / a.avgKmBetweenFills!) * 100)}% da média)</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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