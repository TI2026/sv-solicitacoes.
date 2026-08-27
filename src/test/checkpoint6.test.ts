import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateDailyQuantity,
  calculateDailyTotal,
  isDailyDateTimeRangeValid,
  normalizeDailyPeriod,
} from '@/modules/fleet/dailyPeriod';
import { requestDetailRoute } from '@/modules/fleet/requestRoutes';

describe('Checkpoint 6 — Diárias por período', () => {
  it.each([
    ['2026-09-01', '2026-09-01', 1],
    ['2026-09-01', '2026-09-07', 7],
    ['2026-09-01', '2026-09-14', 14],
    ['2026-09-28', '2026-10-04', 7],
    ['2026-12-29', '2027-01-03', 6],
  ])('calcula %s até %s como %i diária(s)', (start, end, expected) => {
    expect(calculateDailyQuantity(start, end)).toBe(expected);
  });

  it('rejeita data final anterior à inicial', () => {
    expect(() => calculateDailyQuantity('2026-09-02', '2026-09-01')).toThrow('DAILY_PERIOD_INVALID');
  });

  it('rejeita horário final anterior no mesmo dia e aceita em dias diferentes', () => {
    expect(isDailyDateTimeRangeValid('2026-09-01', '18:00', '2026-09-01', '08:00')).toBe(false);
    expect(isDailyDateTimeRangeValid('2026-09-01', '18:00', '2026-09-02', '08:00')).toBe(true);
  });

  it('calcula o total com arredondamento monetário', () => {
    expect(calculateDailyTotal(7, 150)).toBe(1050);
    expect(calculateDailyTotal(3, 33.335)).toBe(100.01);
  });

  it('normaliza registros legados de data única sem reescrever histórico', () => {
    expect(normalizeDailyPeriod({ data_abastecimento: '2026-09-01', valor: 150 })).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      quantity: 1,
      dailyRate: 150,
      total: 150,
    });
  });
});

describe('Checkpoint 6 — contratos autoritativos', () => {
  const migration = readFileSync(
    resolve('supabase/migrations/20260827120000_checkpoint6_daily_period_contract.sql'),
    'utf8',
  );

  it('recalcula quantity e total no banco e não confia no payload', () => {
    expect(migration).toContain('NEW.daily_quantity := v_quantity');
    expect(migration).toContain('NEW.valor := round(v_quantity * NEW.daily_value, 2)');
    expect(migration).toContain("v_request.daily_quantity <> (v_request.daily_end_date - v_request.daily_start_date) + 1");
  });

  it('exige os comprovantes no executor antes das transições', () => {
    expect(migration).toContain("v_module = 'reembolso' AND v_action = 'enviar'");
    expect(migration).toContain("v_module = 'abastecimento' AND v_action = 'enviar_comprovantes'");
    expect(migration).toContain("v_module = 'diaria' AND v_action = 'enviar_comprovantes'");
  });

  it('edita rascunho somente atrás de can_edit do Action Context', () => {
    expect(migration).toContain("FROM public.get_entity_action_context('diaria', p_entity_id)");
    expect(migration).toContain('NOT v_ctx.can_edit');
  });

  it('não usa Abastecimento como fallback para tipos inválidos', () => {
    expect(() => requestDetailRoute('desconhecido', 'id-1')).toThrow('FLEET_REQUEST_TYPE_INVALID');
    const app = readFileSync(resolve('src/App.tsx'), 'utf8');
    const activity = readFileSync(resolve('src/modules/dashboard/queries/recentActivityLoader.ts'), 'utf8');
    expect(app).not.toContain('LegacyAbastecimentoDetailRedirect');
    expect(activity).not.toContain("requestType || 'abastecimento'");
    expect(migration).toContain("WHEN 'abastecimento' THEN '/abastecimento/'");
    expect(migration).not.toContain("WHEN 'abastecimento' THEN '/fleet/'");
  });

  it('exporta o período e o valor financeiro autoritativo', () => {
    const report = readFileSync(resolve('supabase/functions/export-dashboard-report/index.ts'), 'utf8');
    expect(report).toContain('daily_start_date, daily_end_date');
    expect(report).toContain("'Quantidade de diárias'");
    expect(report).toContain("'Valor total'");
  });
});
