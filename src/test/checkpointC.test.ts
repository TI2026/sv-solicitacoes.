import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dailyAllowanceTotal, inclusiveDailyCount } from '@/lib/dailyAllowance';

describe('Checkpoint C — contrato de Diárias', () => {
  it('conta uma única data como uma diária', () => {
    expect(inclusiveDailyCount('2026-08-26', '2026-08-26')).toBe(1);
  });

  it('conta período corrido inclusivo, inclusive fim de semana', () => {
    expect(inclusiveDailyCount('2026-08-26', '2026-08-30')).toBe(5);
  });

  it('rejeita período invertido e datas inválidas', () => {
    expect(inclusiveDailyCount('2026-08-27', '2026-08-26')).toBe(0);
    expect(inclusiveDailyCount('2026-02-30', '2026-03-01')).toBe(0);
  });

  it('calcula total monetário e rejeita tarifa inválida', () => {
    expect(dailyAllowanceTotal(5, 100)).toBe(500);
    expect(dailyAllowanceTotal(3, 10.555)).toBe(31.67);
    expect(dailyAllowanceTotal(0, 100)).toBe(0);
  });

  it('envia período, dias, destino e pagamento no formulário', () => {
    const form = readFileSync(resolve('src/modules/fleet/pages/FleetNewPage.tsx'), 'utf8');
    expect(form).toContain('payload.daily_end_date = dailyEndDate');
    expect(form).toContain('payload.daily_days = dailyDays');
    expect(form).toContain('payload.valor = dailyTotal');
    expect(form).toContain('Destino / finalidade *');
    expect(form).toContain('Forma de Pagamento *');
  });

  it('detalhe exibe o contrato bancário vigente e o período', () => {
    const detail = readFileSync(resolve('src/modules/fleet/components/FleetDetailContent.tsx'), 'utf8');
    expect(detail).not.toContain("payment_method === 'conta_bancaria'");
    expect(detail).toContain("payment_method === 'banco'");
    expect(detail).toContain('Quantidade de dias:');
    expect(detail).toContain('Valor total:');
  });
});
