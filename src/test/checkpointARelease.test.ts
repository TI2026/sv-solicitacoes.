import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

describe('Checkpoint A - regressao funcional do MVP', () => {
  it('governa Enviar e Reenviar por allowed_actions, sem confundir com can_edit', () => {
    const source = read('src/modules/fleet/components/FleetDetailContent.tsx');
    expect(source).toContain("permissions.allowed_actions.includes('enviar') && approvalCtx?.status === 'rascunho'");
    expect(source).toContain("permissions.allowed_actions.includes('enviar') && approvalCtx?.status === 'retornado'");
    expect(source).not.toContain("permissions.edit && approvalCtx?.status === 'rascunho'");
  });

  it('mantem progresso especifico para os tres processos e sem estados de Compras', () => {
    const source = read('src/modules/fleet/components/DiariaProgressBar.tsx');
    expect(source).toContain('REQUEST_PROGRESS_STEPS');
    expect(source).toContain('abastecimento: [');
    expect(source).toContain('diaria: [');
    expect(source).toContain('reembolso: [');
    expect(source).not.toContain("label: 'OC'");
    expect(source).not.toContain("label: 'Entrega'");
  });

  it('nao bloqueia criacao por limite arbitrario no frontend', () => {
    const form = read('src/modules/fleet/pages/FleetNewPage.tsx');
    const limits = read('src/hooks/useRequestLimits.ts');
    const backend = read('supabase/migrations/20260824171000_checkpoint_b_business_security.sql');
    expect(form).not.toContain('useCheckDailyLimit');
    expect(limits).not.toContain('DEFAULT_LIMIT');
    expect(limits).not.toContain('useCheckDailyLimit');
    expect(backend).toContain('enforce_configured_request_limit');
    expect(backend).toContain('IF v_limit IS NULL THEN');
  });

  it('mantem validacao explicativa acessivel nos formularios prioritarios', () => {
    for (const path of [
      'src/modules/fleet/pages/FleetNewPage.tsx',
      'src/modules/admissions/pages/AdmissionNewPage.tsx',
      'src/modules/desligamentos/pages/TerminationNewPage.tsx',
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/disabled=\{submitting \|\| !is(?:Form)?Valid/);
    }
  });

  it('isola o status exato V2 da compatibilidade legada da fila', () => {
    const source = read('supabase/migrations/20260820163941_925ff35c-7200-4d39-9d6a-ca2aab8666fb.sql');
    expect(source).toContain("(COALESCE(f.version,'v1') = 'v2' AND ar.status = 'awaiting_step')");
    expect(source).toContain("COALESCE(f.version,'v1') <> 'v2'");
    expect(source).toContain("ar.status LIKE 'awaiting_step\\_%'");
  });

  it('gera links de notificacao para o modulo e tipo corretos', () => {
    const source = read('supabase/migrations/20260827120000_checkpoint6_daily_period_contract.sql');
    expect(source).toContain("WHEN 'abastecimento' THEN '/abastecimento/'");
    expect(source).toContain("WHEN 'diaria' THEN '/diarias/'");
    expect(source).toContain("WHEN 'reembolso' THEN '/reembolsos/'");
  });
});
