import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FuelEntry {
  id: string;
  placa: string;
  km: number;
  valor: number;
  data_abastecimento: string; // YYYY-MM-DD
  status: string;
}

export interface VehicleAnalytics {
  placa: string;
  fills: FuelEntry[]; // ordered ascending
  lastFillAt: string | null;
  lastKm: number | null;
  avgKmBetweenFills: number | null;
  avgCostPerKm: number | null;
  totalSpent30d: number;
  totalFills30d: number;
  daysSinceLastFill: number | null;
  /** last delta < 60% of historical average => true */
  lastDeltaAnomaly: boolean;
  lastDelta: number | null;
  staleNoFill: boolean; // >30 days without fill
  /** id of the most recent fuel_request for this plate (used for deep-linking) */
  lastFillId: string | null;
}

const VALID_STATUSES = ['enviado', 'em_aprovacao', 'aprovado', 'aguardando_fotos', 'em_revisao_admin', 'concluido', 'pago', 'aguardando_oc', 'aguardando_pagamento'];

export function useFuelHistory() {
  return useQuery({
    queryKey: ['fuel-history-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_requests')
        .select('id, placa, km, valor, data_abastecimento, status, type, deleted_at')
        .eq('type', 'abastecimento')
        .is('deleted_at', null)
        .in('status', VALID_STATUSES as any)
        .order('data_abastecimento', { ascending: true });
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.placa && r.km != null)
        .map((r: any) => ({
          id: r.id,
          placa: String(r.placa),
          km: Number(r.km),
          valor: Number(r.valor),
          data_abastecimento: r.data_abastecimento,
          status: r.status,
        })) as FuelEntry[];
    },
    staleTime: 60_000,
  });
}

export function buildVehicleAnalytics(entries: FuelEntry[]): VehicleAnalytics[] {
  const byPlate = new Map<string, FuelEntry[]>();
  for (const e of entries) {
    const k = (e.placa || '').toUpperCase();
    if (!k) continue;
    if (!byPlate.has(k)) byPlate.set(k, []);
    byPlate.get(k)!.push(e);
  }

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 3600 * 1000;

  const out: VehicleAnalytics[] = [];
  for (const [placa, fills] of byPlate.entries()) {
    fills.sort((a, b) => a.data_abastecimento.localeCompare(b.data_abastecimento));
    const deltas: number[] = [];
    const costPerKmSamples: number[] = [];
    for (let i = 1; i < fills.length; i++) {
      const d = Number(fills[i].km) - Number(fills[i - 1].km);
      if (d > 0 && d < 5000) {
        deltas.push(d);
        const value = Number(fills[i].valor);
        if (value > 0) costPerKmSamples.push(value / d);
      }
    }
    const avgKm = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    const avgCostKm = costPerKmSamples.length ? costPerKmSamples.reduce((a, b) => a + b, 0) / costPerKmSamples.length : null;

    const last = fills[fills.length - 1];
    const lastFillAt = last?.data_abastecimento || null;
    const lastKm = last ? Number(last.km) : null;
    const lastFillId = last?.id || null;
    const lastDelta = deltas.length ? deltas[deltas.length - 1] : null;
    const lastDeltaAnomaly = !!(avgKm && lastDelta != null && deltas.length >= 3 && lastDelta < avgKm * 0.6);

    const lastTs = lastFillAt ? new Date(lastFillAt + 'T12:00:00').getTime() : null;
    const daysSince = lastTs != null ? Math.floor((now - lastTs) / (24 * 3600 * 1000)) : null;
    const staleNoFill = daysSince != null && daysSince > 30;

    const totalSpent30d = fills
      .filter(f => now - new Date(f.data_abastecimento + 'T12:00:00').getTime() <= thirtyDaysMs)
      .reduce((a, f) => a + Number(f.valor || 0), 0);
    const totalFills30d = fills.filter(f => now - new Date(f.data_abastecimento + 'T12:00:00').getTime() <= thirtyDaysMs).length;

    out.push({
      placa,
      fills,
      lastFillAt,
      lastKm,
      avgKmBetweenFills: avgKm,
      avgCostPerKm: avgCostKm,
      totalSpent30d,
      totalFills30d,
      daysSinceLastFill: daysSince,
      lastDeltaAnomaly,
      lastDelta,
      staleNoFill,
      lastFillId,
    });
  }
  return out.sort((a, b) => a.placa.localeCompare(b.placa));
}