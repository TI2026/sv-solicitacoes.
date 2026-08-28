import { test, expect } from '@playwright/test';

test.describe('Sprint 15.1 - Flows Admin Canonical Structure', () => {
  // Configuração global para mockar o backend caso o Supabase não esteja acessível localmente
  // ou para forçar os dados canônicos na interface
  test.beforeEach(async ({ page }, testInfo) => {
    const isCommonUser = testInfo.title.includes('Usuário comum');
    const userId = isCommonUser ? 'common-user' : 'master-user-123';
    const email = isCommonUser ? 'common@test.com' : 'master@test.com';
    const roles = isCommonUser ? ['colaborador'] : ['master'];
    const profile = {
      id: userId,
      full_name: isCommonUser ? 'Common User' : 'Master User',
      role: isCommonUser ? 'colaborador' : 'diretoria',
      is_master: !isCommonUser
    };

    // Interceptar rotas do Supabase para Auth
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: userId,
          aud: 'authenticated',
          email
        })
      });
    });

    await page.route('**/rest/v1/rpc/get_user_roles*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roles) });
    });

    await page.route('**/rest/v1/profiles*', async (route) => {
      const wantsSingle = route.request().headers()['accept']?.includes('application/vnd.pgrst.object+json');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wantsSingle ? profile : [profile])
      });
    });

    // Configura o localStorage com o formato correto da sessão
    await page.addInitScript(({ userId, email }) => {
      window.localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: 'fake-access-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        user: {
          id: userId,
          aud: 'authenticated',
          email,
          role: 'authenticated'
        }
      }));
    }, { userId, email });

    const moduleDefinitions = [
      { code: 'compras', name: 'Compras', steps: ['Aprovação de necessidade', 'Aprovação financeira'] },
      { code: 'abastecimento', name: 'Abastecimento', steps: ['Autorização de abastecimento', 'Pagamento de abastecimento', 'Conferência de abastecimento'] },
      { code: 'diaria', name: 'Diária', steps: ['Autorização de diária', 'Verificação de diária', 'Pagamento de diária'] },
      { code: 'reembolso', name: 'Reembolso', steps: ['Aprovação de reembolso', 'Revisão financeira', 'Pagamento de reembolso'] },
      { code: 'admissoes', name: 'Admissões', steps: ['Aprovação de vaga', 'Processamento RH', 'Validação final RH'] },
      { code: 'desligamentos', name: 'Desligamentos', steps: ['Autorização de desligamento', 'Processamento RH', 'Checklist de offboarding'] },
    ];
    const modules = moduleDefinitions.map((mod) => ({
      module_code: mod.code,
      module_name: mod.name,
      flow_id: `flow-${mod.code}`,
      flow_name: `Fluxo ${mod.name} V2`,
      flow_active: true,
      steps_total: mod.steps.length,
      status: 'ready',
    }));
    const steps = moduleDefinitions.flatMap((mod) => mod.steps.map((stepName, index) => ({
      module_code: mod.code,
      module_name: mod.name,
      flow_id: `flow-${mod.code}`,
      flow_name: `Fluxo ${mod.name} V2`,
      flow_active: true,
      step_id: `${mod.code}-step-${index + 1}`,
      step_order: index + 1,
      step_code: `${mod.code}_step_${index + 1}`,
      step_name: stepName,
      step_kind: 'approval',
      completion_action: index === 0 ? 'aprovar' : 'concluir',
      assignment_mode: 'person',
      primary_user_id: 'approver-1',
      primary_user_name: 'Aprovador Principal',
      substitute_user_id: 'approver-2',
      substitute_user_name: 'Aprovador Substituto',
      sector_id: null,
      sector_name: null,
      sector_responsible_name: null,
      sector_substitute_name: null,
      sla_hours: 48,
      status: 'ready',
      reason: null,
    })));
    const health = {
      overall: 'ready',
      flows_total: 6,
      steps_total: 17,
      template: { ok: true, expected_flows: 6, expected_steps: 17, missing_steps: [], extra_steps: [], divergent_steps: [] },
      modules,
      steps,
    };

    await page.route('**/rest/v1/rpc/get_approval_configuration_health*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(health) });
    });
    await page.route('**/rest/v1/rpc/get_v2_cutover_status*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ health, active_v1_requests: [], active_v1_count: 0, can_activate: false }),
      });
    });
  });

  test('Master acessa a tela e vê a estrutura canônica', async ({ page }) => {
    // O WebKit móvel percorre uma página longa (6 módulos/17 etapas) e pode
    // exceder o timeout padrão sem que nenhuma asserção funcional falhe.
    test.slow();

    // 1. Master acessa a tela
    await page.goto('/permissoes?tab=chains', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Permissões e Aprovações' })).toBeVisible({ timeout: 15000 });

    // 2. seis módulos e as 17 etapas canônicas aparecem
    await expect(page.getByText('6 módulos · 17 etapas')).toBeVisible({ timeout: 15000 });
    for (const moduleName of ['Compras', 'Abastecimento', 'Diária', 'Reembolso', 'Admissões', 'Desligamentos']) {
      await expect(page.getByRole('heading', { name: moduleName, exact: true })).toBeVisible();
    }

    // 3. Fleet aparece separado (Abastecimento, Diária, Reembolso)
    // Implicitamente testado acima, pois eles aparecem como módulos distintos

    // 4, 5 e 6. Quantidade/ordem e finalidade canônica são visíveis.
    const abastecimentoCard = page
      .getByRole('heading', { name: 'Abastecimento', exact: true })
      .locator('xpath=ancestor::div[contains(@class, "border")][1]');
    await expect(abastecimentoCard.getByText('3 etapas obrigatórias')).toBeVisible();
    await expect(abastecimentoCard.getByText('Autorização de abastecimento')).toBeVisible();
    await expect(abastecimentoCard.getByText('Pagamento de abastecimento')).toBeVisible();
    await expect(abastecimentoCard.getByText('Conferência de abastecimento')).toBeVisible();
    await abastecimentoCard.getByRole('button', { name: 'Configurar' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Etapa 1 — Autorização de abastecimento');

    // 7. Não existe botão para adicionar etapa
    await expect(page.locator('button:has-text("Adicionar Etapa")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Nova Etapa")')).toHaveCount(0);

    // 8. Não existe ação para excluir
    await expect(page.locator('.lucide-trash2')).toHaveCount(0);

    // 9. Responsável pode ser alterado
    const select = page.getByRole('dialog').getByRole('combobox').first();
    await expect(select).toBeVisible();

    // 10. O editor expõe o salvamento; o cutover mockado como bloqueado não pode ser ativado.
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('button', { name: 'Ativar Motor V2' })).toBeDisabled();
  });

  test('Usuário comum recebe acesso negado na administração', async ({ page }) => {
    await page.goto('/permissoes', { waitUntil: 'domcontentloaded' });
    
    // Admin tabs should not be visible
    await expect(page).toHaveURL(/.*\/dashboard/);
  });
});
