import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Car, Fuel, TrendingUp, DollarSign, AlertTriangle, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ── Constants ──
const ANOMALY_THRESHOLD = 0.6; // 60% da média

// ── Types ──
interface FuelRecord {
  id: string;
  placa: string;
  km: string | null;
  valor: number;
  data_abastecimento: string;
  status: string;
}

interface VehicleSummary {
  placa: string;
  totalAbastecimentos: number;
  totalCost: number;
  kmValues: number[];
  kmDeltas: number[];
  avgKmDelta: number;
  stdKmDelta: number;
  lastKmDelta: number | null;
  isAnomalous: boolean;
  records: FuelRecord[];
}

// ── Data hook ──
function useVehicleData() {
  return useQuery({
    queryKey: ['fleet_vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, placa, km, valor, data_abastecimento, status')
        .eq('type', 'abastecimento')
        .not('placa', 'is', null)
        .neq('placa', '')
        .is('deleted_at', null)
        .order('data_abastecimento', { ascending: true });
      if (error) throw error;
      return (data || []) as FuelRecord[];
    },
    staleTime: 60_000,
  });
}

function buildVehicleSummaries(records: FuelRecord[]): VehicleSummary[] {
  const byPlaca = new Map<string, FuelRecord[]>();
  for (const r of records) {
    const p = r.placa.toUpperCase().trim();
    if (!byPlaca.has(p)) byPlaca.set(p, []);
    byPlaca.get(p)!.push(r);
  }

  const summaries: VehicleSummary[] = [];
  for (const [placa, recs] of byPlaca) {
    const sorted = recs.sort((a, b) => a.data_abastecimento.localeCompare(b.data_abastecimento));
    const kmValues = sorted.map(r => parseFloat(r.km || '0')).filter(v => v > 0);
    const kmDeltas: number[] = [];
    for (let i = 1; i < kmValues.length; i++) {
      const d = kmValues[i] - kmValues[i - 1];
      if (d > 0) kmDeltas.push(d);
    }

    const avgKmDelta = kmDeltas.length > 0 ? kmDeltas.reduce((a, b) => a + b, 0) / kmDeltas.length : 0;
    const stdKmDelta = kmDeltas.length > 1
      ? Math.sqrt(kmDeltas.reduce((sum, v) => sum + (v - avgKmDelta) ** 2, 0) / (kmDeltas.length - 1))
      : 0;
    const lastKmDelta = kmDeltas.length > 0 ? kmDeltas[kmDeltas.length - 1] : null;
    const isAnomalous = lastKmDelta !== null && avgKmDelta > 0 && lastKmDelta < avgKmDelta * ANOMALY_THRESHOLD;

    summaries.push({
      placa,
      totalAbastecimentos: sorted.length,
      totalCost: sorted.reduce((s, r) => s + Number(r.valor || 0), 0),
      kmValues,
      kmDeltas,
      avgKmDelta,
      stdKmDelta,
      lastKmDelta,
      isAnomalous,
      records: sorted,
    });
  }

  return summaries.sort((a, b) => b.totalAbastecimentos - a.totalAbastecimentos);
}

// ── Vehicle Detail Panel ──
function VehicleDetailPanel({ vehicle, onBack }: { vehicle: VehicleSummary; onBack: () => void }) {
  const avgCost = vehicle.totalAbastecimentos > 0 ? vehicle.totalCost / vehicle.totalAbastecimentos : 0;
  const totalKm = vehicle.kmValues.length >= 2 ? vehicle.kmValues[vehicle.kmValues.length - 1] - vehicle.kmValues[0] : 0;

  const kmChartData = vehicle.records
    .filter((_, i) => i > 0 && vehicle.kmDeltas[i - 1] !== undefined)
    .map((r, i) => ({
      data: new Date(r.data_abastecimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      km: vehicle.kmDeltas[i],
    }));

  const costChartData = vehicle.records.map(r => ({
    data: new Date(r.data_abastecimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    valor: Number(r.valor),
  }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Car className="w-5 h-5" /> {vehicle.placa}
            {vehicle.isAnomalous && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="w-3 h-3" /> Consumo anormal
              </Badge>
            )}
          </h2>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{vehicle.totalAbastecimentos}</p>
          <p className="text-xs text-muted-foreground">Abastecimentos</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalKm > 0 ? totalKm.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-muted-foreground">KM Total Rodado</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{vehicle.avgKmDelta > 0 ? Math.round(vehicle.avgKmDelta).toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-muted-foreground">Média KM/Abast.</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-foreground">R$ {avgCost.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground">Custo Médio</p>
        </CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {kmChartData.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">KM entre abastecimentos</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={kmChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString('pt-BR')} km`, 'KM']} />
                  <Line type="monotone" dataKey="km" className="stroke-primary" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {costChartData.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Custo por abastecimento</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']} />
                  <Bar dataKey="valor" className="fill-primary" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* History table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Histórico de abastecimentos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Data</th>
                  <th className="pb-2 pr-4">KM</th>
                  <th className="pb-2 pr-4">KM Percorrido</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicle.records.map((r, i) => {
                  const kmNum = parseFloat(r.km || '0');
                  const prevKm = i > 0 ? parseFloat(vehicle.records[i - 1].km || '0') : 0;
                  const delta = i > 0 && kmNum > 0 && prevKm > 0 ? kmNum - prevKm : null;
                  return (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{new Date(r.data_abastecimento).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2 pr-4">{kmNum > 0 ? kmNum.toLocaleString('pt-BR') : '—'}</td>
                      <td className="py-2 pr-4">{delta !== null && delta > 0 ? delta.toLocaleString('pt-BR') : '—'}</td>
                      <td className="py-2 pr-4">R$ {Number(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2">{r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──
export default function FleetVehiclesPage() {
  const { data: records, isLoading } = useVehicleData();
  const [selectedPlaca, setSelectedPlaca] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const summaries = useMemo(() => buildVehicleSummaries(records || []), [records]);
  const filtered = useMemo(() => {
    if (!search) return summaries;
    const q = search.toUpperCase();
    return summaries.filter(v => v.placa.includes(q));
  }, [summaries, search]);

  const selected = selectedPlaca ? summaries.find(v => v.placa === selectedPlaca) : null;

  if (selected) {
    return <VehicleDetailPanel vehicle={selected} onBack={() => setSelectedPlaca(null)} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Veículos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Histórico e consumo por veículo</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/fleet')}>
          <ArrowLeft className="w-4 h-4" /> Voltar para Solicitações
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Car className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Nenhum veículo encontrado' : 'Nenhum veículo com abastecimento registrado'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(v => (
            <Card
              key={v.placa}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSelectedPlaca(v.placa)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-foreground flex items-center gap-2">
                    <Car className="w-4 h-4 text-muted-foreground" /> {v.placa}
                  </span>
                  {v.isAnomalous && (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <AlertTriangle className="w-3 h-3" /> Anormal
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{v.totalAbastecimentos}</p>
                    <p className="text-[10px] text-muted-foreground">Abast.</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{v.avgKmDelta > 0 ? Math.round(v.avgKmDelta) : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">Méd. KM</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      R$ {(v.totalCost / Math.max(v.totalAbastecimentos, 1)).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Méd. Custo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
