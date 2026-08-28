import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvalModuleDetailRoute,
  requestDetailRoute,
  requestListRoute,
  requestNewRoute,
} from '@/modules/fleet/requestRoutes';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('Checkpoint A — rotas canônicas de frota', () => {
  it.each([
    ['abastecimento', '/abastecimento', '/abastecimento/new', '/abastecimento/id-1'],
    ['diaria', '/diarias', '/diarias/new', '/diarias/id-1'],
    ['reembolso', '/reembolsos', '/reembolsos/new', '/reembolsos/id-1'],
  ])('resolve %s sem rota fleet genérica', (type, list, create, detail) => {
    expect(requestListRoute(type)).toBe(list);
    expect(requestNewRoute(type)).toBe(create);
    expect(requestDetailRoute(type, 'id-1')).toBe(detail);
  });

  it('usa a lista canônica no Voltar e após criar', () => {
    const form = read('src/modules/fleet/pages/FleetNewPage.tsx');
    const detail = read('src/modules/fleet/components/FleetDetailContent.tsx');
    expect(form).toContain('const backRoute = requestListRoute(type)');
    expect(form).toContain('navigate(backRoute)');
    expect(detail).toContain('const routeBase = requestListRoute(reqType)');
    expect(detail).toContain('navigate(routeBase)');
  });

  it('filtra as listas pelo type real', () => {
    const queries = read('src/modules/fleet/hooks/useFleetQueries.ts');
    expect(queries).toContain("query = query.eq('type', type)");
    expect(queries).toContain('items.filter((r: any) => r.type === type)');
  });
});

describe('Checkpoint A — upload e preview privados', () => {
  const form = read('src/modules/fleet/pages/FleetNewPage.tsx');
  const context = read('src/modules/fleet/contexts/FleetDetailContext.tsx');
  const detail = read('src/modules/fleet/components/FleetDetailContent.tsx');
  const edge = read('supabase/functions/fleet-create-signed-upload/index.ts');
  const migration = read('supabase/migrations/20260827160000_checkpoint_a_fleet_private_storage.sql');

  it('rejeita WebP e comunica JPEG, PNG e PDF', () => {
    expect(form).not.toContain('image/webp');
    expect(context).not.toContain('image/webp');
    expect(detail).not.toContain('image/webp');
    expect(edge).not.toContain("'image/webp'");
    expect(form).toContain('Use JPEG, PNG ou PDF de até 10MB.');
    expect(context).toContain('Use JPEG, PNG ou PDF');
  });

  it('não usa URL pública e renova signed URL temporária', () => {
    expect(detail).not.toContain('getPublicUrl');
    expect(detail).toContain('PrivateFleetThumbnail');
    expect(context).toContain("createSignedUrl(path, 300)");
    expect(context).toContain('refreshInlinePreview');
    expect(detail).toContain('Atualizar link');
  });

  it('versiona bucket privado e policies ligadas ao Action Context', () => {
    expect(migration).toContain("'fleet',\n  'fleet',\n  false");
    expect(migration).toContain('allowed_mime_types');
    expect(migration).toContain('get_entity_action_context');
    expect(migration).toContain("v_ctx.allowed_actions ? 'enviar_comprovantes'");
  });

  it('Edge Function não concede upload por papel administrativo', () => {
    expect(edge).toContain("userClient.rpc('get_entity_action_context'");
    expect(edge).toContain("allowedActions.includes('enviar_comprovantes')");
    expect(edge).not.toContain('isAdmin');
  });
});

describe('Checkpoint A — detalhes e sincronização', () => {
  it('Admissões reflete as cinco ações canônicas e usa can_edit', () => {
    const source = read('src/modules/admissions/components/AdmissionDetailContent.tsx');
    for (const action of ['aprovar', 'devolver', 'rejeitar', 'concluir_triagem', 'concluir']) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain('approvalCtx?.raw?.can_edit === true');
    expect(source).not.toContain("handleWorkflowAction('editar'");
  });

  it('Desligamentos expõe as ações canônicas sem alias processar', () => {
    const source = read('src/modules/desligamentos/pages/TerminationDetailPage.tsx');
    for (const action of ['aprovar', 'devolver', 'rejeitar', 'concluir_processamento_rh', 'concluir']) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).not.toContain("action: 'processar'");
    expect(source).toContain('Concluir offboarding');
  });

  it.each([
    ['compras', '/purchases/id-1'],
    ['abastecimento', '/abastecimento/id-1'],
    ['diaria', '/diarias/id-1'],
    ['reembolso', '/reembolsos/id-1'],
    ['admissoes', '/admissions/id-1'],
    ['desligamentos', '/desligamentos/id-1'],
  ])('Fila abre %s na rota correta', (moduleKey, expected) => {
    expect(approvalModuleDetailRoute(moduleKey, 'id-1')).toBe(expected);
  });

  it('invalida fila e badge com helper central', () => {
    const refresh = read('src/lib/refreshApprovalData.ts');
    const layout = read('src/components/AppLayout.tsx');
    expect(refresh).toContain('approvalQueueKeys.sidebarPending()');
    expect(refresh).toContain('approvalQueueKeys.myApprovals()');
    expect(layout).toContain('approvalQueueKeys.sidebarPending(user?.id)');
  });

  it('detalhes de Compras e Desligamentos assinam entidade, aprovação, etapas e histórico', () => {
    for (const path of [
      'src/modules/purchases/pages/PurchaseDetailPage.tsx',
      'src/modules/desligamentos/pages/TerminationDetailPage.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain("table: 'approval_requests'");
      expect(source).toContain("table: 'approval_request_steps'");
      expect(source).toContain("table: 'status_history'");
    }
  });
});

describe('Checkpoint A — contratos visuais', () => {
  it('usa banco como payment_method canônico', () => {
    const form = read('src/modules/fleet/pages/FleetNewPage.tsx');
    const detail = read('src/modules/fleet/components/FleetDetailContent.tsx');
    expect(form).toContain('<SelectItem value="banco">');
    expect(detail).toContain("req.payment_method === 'banco'");
    expect(detail).not.toContain("req.payment_method === 'conta_bancaria'");
    expect(detail).toContain('<DiariaDetails req={req} canViewPaymentData={!!approvalCtx} />');
    expect(detail).toContain('<ReembolsoDetails req={req} canViewPaymentData={!!approvalCtx} />');
  });

  it('não representa Diretoria como Master', () => {
    const source = read('src/modules/permissions/components/RolesPermissionsTab.tsx');
    expect(source).not.toContain("role.key === 'diretoria'");
    expect(source).not.toContain('Diretoria opera no mesmo nível de Master');
    expect(source).toContain("role.key === 'master'");
  });
});
