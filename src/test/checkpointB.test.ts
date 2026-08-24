import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEntityActionResult } from '@/hooks/useEntityAction';
import { requestDetailRoute, requestListRoute, requestNewRoute } from '@/modules/fleet/requestRoutes';

describe('Checkpoint B — contrato único do executor', () => {
  it.each(['400', 400, '422', 500])('trata code %s como falha', (code) => {
    expect(() => parseEntityActionResult({ code, message: 'Falha controlada' })).toThrow('Falha controlada');
  });

  it.each(['200', 201, '204'])('aceita somente code 2xx (%s)', (code) => {
    expect(parseEntityActionResult({ code, message: 'ok' }).message).toBe('ok');
  });

  it('preserva failure legado', () => {
    expect(() => parseEntityActionResult({ success: false, message: 'Falha legada' })).toThrow('Falha legada');
  });

  it('rejeita código malformado', () => {
    expect(() => parseEntityActionResult({ code: 'ENGINE-400' })).toThrow('ENGINE_INVALID_CODE');
  });
});

describe('Checkpoint B — separação das rotas empresariais', () => {
  it('resolve listas, criação e detalhes por processo', () => {
    expect(requestListRoute('abastecimento')).toBe('/fleet');
    expect(requestNewRoute('diaria')).toBe('/diarias/new');
    expect(requestDetailRoute('diaria', 'id-1')).toBe('/diarias/id-1');
    expect(requestNewRoute('reembolso')).toBe('/reembolsos/new');
    expect(requestDetailRoute('reembolso', 'id-2')).toBe('/reembolsos/id-2');
  });
});

describe('Checkpoint B — arquitetura do frontend', () => {
  it('mantém execute_entity_action em um único helper', () => {
    const files = [
      'src/modules/purchases/hooks/usePurchaseOperationalActions.ts',
      'src/modules/purchases/hooks/usePurchaseMutations.ts',
      'src/modules/permissions/hooks/usePermissionsData.ts',
      'src/modules/dashboard/hooks/useFlowControlBatch.ts',
      'src/modules/fleet/hooks/useFleetQueries.ts',
    ];
    for (const file of files) {
      expect(readFileSync(resolve(file), 'utf8')).not.toContain("rpc('execute_entity_action'");
    }
  });

  it('não reintroduz módulo fleet nem aliases proibidos', () => {
    const files = [
      'src/modules/fleet/hooks/useFleetQueries.ts',
      'src/modules/fleet/components/FleetDetailContent.tsx',
    ];
    const source = files.map((file) => readFileSync(resolve(file), 'utf8')).join('\n');
    expect(source).not.toContain("p_module_key: 'fleet'");
    expect(source).not.toContain('informar_abastecimento');
    expect(source).not.toContain('enviar_documentos');
  });

  it('progress da diária não possui OC', () => {
    const source = readFileSync(resolve('src/modules/fleet/components/DiariaProgressBar.tsx'), 'utf8');
    expect(source).not.toContain("label: 'OC'");
    expect(source).not.toContain("key: 'aguardando_oc'");
  });

  it('normaliza justificativa no payload notes', () => {
    const source = readFileSync(resolve('src/hooks/useEntityAction.ts'), 'utf8');
    expect(source).toContain('{ notes: vars.reason }');
    expect(source).not.toContain('{ comments: vars.reason }');
  });

  it('envia Diária imediatamente pelo executor canônico', () => {
    const source = readFileSync(resolve('src/modules/fleet/pages/FleetNewPage.tsx'), 'utf8');
    expect(source).not.toContain("type !== 'diaria'");
    expect(source).toContain("moduleKey: type, entityId: result.id, action: 'enviar'");
  });

  it('usa a completion action canônica no processamento de desligamento', () => {
    const source = readFileSync(resolve('src/modules/desligamentos/pages/TerminationDetailPage.tsx'), 'utf8');
    expect(source).toContain("hasAction('concluir_processamento_rh')");
    expect(source).not.toContain("hasAction('processar')");
  });

  it('autoriza edição de admissão somente por can_edit do contexto', () => {
    const source = readFileSync(resolve('src/modules/admissions/components/AdmissionDetailContent.tsx'), 'utf8');
    expect(source).toContain('approvalCtx?.raw?.can_edit === true');
  });

  it('usa a fila V2 e não classifica waiting_operational sem ator como órfão', () => {
    const layout = readFileSync(resolve('src/components/AppLayout.tsx'), 'utf8');
    const pendings = readFileSync(resolve('src/modules/dashboard/queries/criticalPendingsLoader.ts'), 'utf8');
    expect(layout).toContain("rpc('get_my_approval_queue')");
    expect(pendings).toContain(".or('status.eq.awaiting_step,status.like.awaiting_step_%')");
    expect(pendings).not.toContain("status.eq.waiting_operational,status.eq.awaiting_step");
  });

  it('confirma persistência e refaz leitura da configuração salva', () => {
    const source = readFileSync(resolve('src/modules/permissions/hooks/usePermissionsData.ts'), 'utf8');
    expect(source).toContain(".select('id')");
    expect(source).toContain("refetchQueries({ queryKey: ['approval_flows'], type: 'active' })");
  });

  it('exige comprovante para enviar Reembolso e mantém resolução de divergência', () => {
    const form = readFileSync(resolve('src/modules/fleet/pages/FleetNewPage.tsx'), 'utf8');
    const detail = readFileSync(resolve('src/modules/fleet/components/FleetDetailContent.tsx'), 'utf8');
    expect(form).toContain('!forSend || !!reimbursementProof');
    expect(form).toContain('uploadToSignedUrl');
    expect(detail).toContain("handleStatusChange('relatar_divergencia', notes)");
  });
});
