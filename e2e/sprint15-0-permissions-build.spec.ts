import { test, expect } from '@playwright/test';

test.describe('Sprint 15.0 - Permissions Build', () => {

  const setupMockSession = async (page, role, isMaster) => {
    // Interceptar rotas do Supabase
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-user-id',
          aud: 'authenticated',
          email: 'test@example.com'
        })
      });
    });

    await page.route('**/rest/v1/rpc/get_user_roles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isMaster ? ['master', 'diretoria'] : [role])
      });
    });

    await page.route('**/rest/v1/profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'mock-user-id',
          role: role,
          is_master: isMaster,
          full_name: 'Mocked User'
        }])
      });
    });

    // Mock para que a tela de permissões não fique em loop esperando dados se renderizar
    await page.route('**/rest/v1/approval_requests*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    
    // Configura o localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem('sb-zeaerqlvhrbcuubueolh-auth-token', JSON.stringify({
        access_token: 'fake-access-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        user: {
          id: 'mock-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }));
    });
  };

  test('Master abre a página de Permissões com sucesso e sem erro de import', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
      }
    });

    await setupMockSession(page, 'diretoria', true);
    
    // 1. Master abre a página de Permissões
    await page.goto('/permissoes', { waitUntil: 'domcontentloaded' });

    // Espera a rota resolver e o componente montar
    // 2. título e conteúdo aparecem
    await expect(page.locator('text=Permissões e Aprovações')).toBeVisible({ timeout: 15000 });

    // 3. não existe erro de dynamic import
    // 4. não existe erro de console fatal
    const fatalErrors = jsErrors.filter(e => 
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('SyntaxError')
    );
    expect(fatalErrors).toHaveLength(0);

    // 6. refresh da rota continua funcionando
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Permissões e Aprovações')).toBeVisible({ timeout: 15000 });
  });

  test('Usuário comum recebe acesso negado', async ({ page }) => {
    await setupMockSession(page, 'comum', false);
    
    // Acessa rota
    await page.goto('/permissoes', { waitUntil: 'domcontentloaded' });
    
    // Espera para ver se redireciona ou mostra erro
    await page.waitForTimeout(2000);

    // 5. usuário comum recebe acesso negado
    // O RoleGuard redireciona para o dashboard ou fallback
    const url = page.url();
    expect(url.includes('/dashboard')).toBeTruthy();
    await expect(page.locator('text=Permissões e Aprovações')).not.toBeVisible();
  });
});
