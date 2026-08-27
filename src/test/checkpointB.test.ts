import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEntityActionResult } from '@/hooks/useEntityAction';
import { formatApprovalError } from '@/lib/formatApprovalError';
import { approvalModuleDetailRoute, requestDetailRoute, requestListRoute, requestNewRoute } from '@/modules/fleet/requestRoutes';

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

  it('aceita sucesso legado explícito e rejeita resposta ambígua', () => {
    expect(parseEntityActionResult({ success: true }).success).toBe(true);
    expect(() => parseEntityActionResult({ message: 'sem código' })).toThrow('sem código');
  });

  it('rejeita código malformado', () => {
    expect(() => parseEntityActionResult({ code: 'ENGINE-400' })).toThrow('ENGINE_INVALID_CODE');
  });

  it.each(['APPROVAL_ENGINE_AWAITING_ACTIVATION', 'WORKFLOW_NO_ELIGIBLE_APPROVER'])(
    'traduz %s sem expor erro técnico ao usuário',
    (error) => {
      expect(formatApprovalError(error)).toBe('Motor de aprovação aguardando ativação/configuração.');
    },
  );
});

describe('Checkpoint B — separação das rotas empresariais', () => {
  it('resolve listas, criação e detalhes por processo', () => {
    expect(requestListRoute('abastecimento')).toBe('/abastecimento');
    expect(requestNewRoute('diaria')).toBe('/diarias/new');
    expect(requestDetailRoute('diaria', 'id-1')).toBe('/diarias/id-1');
    expect(requestNewRoute('reembolso')).toBe('/reembolsos/new');
    expect(requestDetailRoute('reembolso', 'id-2')).toBe('/reembolsos/id-2');
  });

  it.each([
    ['compras', '/purchases/id-1'],
    ['abastecimento', '/abastecimento/id-1'],
    ['diaria', '/diarias/id-1'],
    ['reembolso', '/reembolsos/id-1'],
    ['admissoes', '/admissions/id-1'],
    ['desligamentos', '/desligamentos/id-1'],
  ])('resolve navegação canônica de %s', (moduleCode, expected) => {
    expect(approvalModuleDetailRoute(moduleCode, 'id-1')).toBe(expected);
  });

  it('não mistura os três processos na tela de Abastecimentos', () => {
    const source = readFileSync(resolve('src/modules/fleet/pages/FleetListPage.tsx'), 'utf8');
    expect(source).toContain("title: 'Abastecimentos'");
    expect(source).not.toContain('<TabsTrigger value="reembolso"');
    expect(source).not.toContain('<TabsTrigger value="diaria"');
    expect(source).toContain("activeTab === 'abastecimento' ? user?.id : undefined");
    expect(source).toContain("activeTab === 'reembolso' ? user?.id : undefined");
    expect(source).toContain("activeTab === 'diaria' && canSeeDiaria ? user?.id : undefined");
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
    expect(source).not.toContain("sendImmediately && type !== 'diaria'");
    expect(source).toContain("moduleKey: type, entityId: result.id, action: 'enviar'");
  });

  it('usa a completion action canônica no processamento de desligamento', () => {
    const source = readFileSync(resolve('src/modules/desligamentos/pages/TerminationDetailPage.tsx'), 'utf8');
    expect(source).toContain("hasAction('concluir_processamento_rh')");
    expect(source).toContain("action: 'concluir_processamento_rh'");
    expect(source).not.toContain("hasAction('processar')");
  });

  it('Minha Fila usa RPC e Action Context sem inventar aprovação genérica', () => {
    const source = readFileSync(resolve('src/modules/permissions/components/MyApprovalsTab.tsx'), 'utf8');
    const mutation = readFileSync(resolve('src/modules/permissions/hooks/usePermissionsData.ts'), 'utf8');
    const queue = readFileSync(resolve('src/modules/dashboard/hooks/useDashboardQueue.ts'), 'utf8');
    expect(source).toContain('useDashboardQueue(user?.id)');
    expect(source).toContain('useApprovalContext(item.reference_id, moduleKey)');
    expect(source).toContain("action: 'approve', completionAction");
    expect(queue).toContain("queryKey: ['my_approvals', userId]");
    expect(mutation).toContain("queryKey: ['my_approval_history', userId]");
    expect(mutation).toContain("if (!canonical) throw new Error('ENGINE_ACTION_CONTEXT_REQUIRED')");
    expect(mutation).not.toContain("params.completionAction || 'aprovar'");
  });

  it('não classifica qualquer role diferente de colaborador como aprovador', () => {
    const source = [
      'src/components/AppLayout.tsx',
      'src/pages/PendingRequestsPage.tsx',
    ].map((file) => readFileSync(resolve(file), 'utf8')).join('\n');
    expect(source).not.toContain("user.roles.some(r => r !== 'colaborador')");
    expect(source).not.toContain("role.key !== 'colaborador'");
  });

  it('mantém atalhos e atividade recente nas rotas canônicas dos processos', () => {
    const shortcuts = readFileSync(resolve('src/modules/dashboard/components/QuickAccessWidget.tsx'), 'utf8');
    const activity = readFileSync(resolve('src/modules/dashboard/queries/recentActivityLoader.ts'), 'utf8');
    const requests = readFileSync(resolve('src/modules/dashboard/queries/myRequestsLoader.ts'), 'utf8');
    expect(shortcuts).toContain("newRoute: '/diarias/new'");
    expect(shortcuts).toContain("newRoute: '/reembolsos/new'");
    expect(shortcuts).not.toContain('/fleet/new?type=');
    expect(activity).toContain('isFleetBusinessModule(requestType)');
    expect(activity).not.toContain("requestType || 'abastecimento'");
    expect(requests).toContain('requestDetailRoute(row.type, row.id)');
  });

  it('reconhece awaiting_step V2 como aprovação ativa', () => {
    const source = readFileSync(resolve('src/pages/PermissionsPage.tsx'), 'utf8');
    expect(source).toContain("status === 'awaiting_step' || status.startsWith('awaiting_step_')");
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

  it('consulta somente colunas reais de fuel_requests no Dashboard', () => {
    const source = readFileSync(resolve('src/modules/dashboard/queries/myRequestsLoader.ts'), 'utf8');
    expect(source).toContain('valor, motivo, notes, person_name, categoria');
    expect(source).not.toContain('valor, description');
    expect(source).toContain('[myRequestsLoader] ${moduleName} fetch failed:');
  });

  it('separa templates, configuração, motor e cutover na tela Master', () => {
    const source = readFileSync(resolve('src/modules/permissions/components/ApprovalV2ConfigTab.tsx'), 'utf8');
    expect(source).toContain('Templates');
    expect(source).toContain('Configuração');
    expect(source).toContain('Motor');
    expect(source).toContain('Cutover');
    expect(source).toContain("motorActive ? 'Ativo' : 'Inativo'");
    expect(source).toContain("cutoverReady ? 'Pronto' : 'Bloqueado'");
  });

  it('exige comprovante para enviar Reembolso e mantém resolução de divergência', () => {
    const form = readFileSync(resolve('src/modules/fleet/pages/FleetNewPage.tsx'), 'utf8');
    const detail = readFileSync(resolve('src/modules/fleet/components/FleetDetailContent.tsx'), 'utf8');
    expect(form).toContain('!forSend || !!reimbursementProof');
    expect(form).toContain('uploadToSignedUrl');
    expect(detail).toContain("handleStatusChange('relatar_divergencia', notes)");
  });

  it('permite data futura apenas no contrato de Abastecimento/Diária', () => {
    const source = readFileSync(resolve('src/modules/fleet/pages/FleetNewPage.tsx'), 'utf8');
    expect(source).toContain("if (type === 'abastecimento') return data >= today;");
    expect(source).toContain('dailyStartDate >= today');
    expect(source).toContain('dailyEndDate >= dailyStartDate');
    expect(source).toContain("if (type === 'reembolso') return data <= today;");
    expect(source).not.toContain('min={minDateToday()} max={todayBR()}');
  });

  it('renderiza actions canônicas sem botão Aprovar duplicado ou genérico', () => {
    const source = readFileSync(resolve('src/modules/fleet/components/FleetApprovalAction.tsx'), 'utf8');
    expect(source).toContain("const showPrimaryAction = stepAction === 'aprovar'");
    expect(source).toContain("? 'Resolver divergência'");
    expect(source).toContain("? 'Concluir revisão'");
    expect(source).toContain('canApprove && showPrimaryAction');
    expect(source).toContain("reqType === 'reembolso' && stepAction === 'aprovar'");
  });
});
