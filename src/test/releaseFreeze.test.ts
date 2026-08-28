import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { render, screen } from '@testing-library/react';
import { StartupConfigurationGuard } from '@/App';
import { createElement } from 'react';

const source = (path: string) => readFileSync(resolve(path), 'utf8');

describe('Release Fix / Freeze Gate', () => {
  it('mantém bootstrap explícito sem service role no frontend', () => {
    const app = source('src/App.tsx');
    const client = source('src/integrations/supabase/client.ts');
    const frontend = source('src/lib/supabaseConfig.ts') + client;
    expect(app).toContain('Aplicação não configurada');
    expect(app).toContain('StartupConfigurationGuard');
    expect(frontend).not.toContain('SERVICE_ROLE');
  });

  it('renderiza diagnóstico explícito quando a configuração é inválida', () => {
    render(createElement(
      StartupConfigurationGuard,
      { error: 'Configuração ausente: VITE_SUPABASE_URL' },
      createElement('div', null, 'Aplicação'),
    ));
    expect(screen.getByRole('heading', { name: 'Aplicação não configurada' })).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument();
  });

  it('renderiza a aplicação quando a configuração é válida', () => {
    render(createElement(
      StartupConfigurationGuard,
      { error: null },
      createElement('div', null, 'Aplicação inicializada'),
    ));
    expect(screen.getByText('Aplicação inicializada')).toBeInTheDocument();
  });

  it('Presence transmite somente identificador efêmero de sessão', () => {
    const presence = source('src/contexts/PresenceContext.tsx');
    expect(presence).toContain('session_id: sessionIdRef.current');
    expect(presence).not.toContain('current_route:');
    expect(presence).not.toContain('email: user.email');
    expect(presence).not.toContain('full_name:');
    expect(presence).not.toContain('avatar_url:');
  });

  it('Dashboard usa permissão efetiva e soma os seis módulos', () => {
    const dashboard = source('src/pages/DashboardPage.tsx');
    expect(dashboard).toContain("usePermission('dashboard', 'view_financials')");
    expect(dashboard).not.toContain('const canSeeFinancials = !!isMaster');
    expect(dashboard).toContain('metrics.purchases.total + metrics.terminations.total');
  });

  it('invalidação é escopada ao módulo após uma ação', () => {
    const invalidateQueries = vi.fn();
    refreshApprovalData({ invalidateQueries } as any, 'entity-1', 'compras');
    const keys = invalidateQueries.mock.calls.map(([arg]) => arg.queryKey.join(':'));
    expect(keys).toContain('purchase:entity-1');
    expect(keys).toContain('approval_context:compras:entity-1');
    expect(keys).not.toContain('fuel_requests');
    expect(keys).not.toContain('admission_requests');
    expect(keys).not.toContain('termination_requests');
  });

  it('Admissões oculta lifecycle enquanto o workflow está ativo', () => {
    const admissions = source('src/modules/admissions/components/AdmissionDetailContent.tsx');
    expect(admissions).toContain('const hasActiveApproval = !!approvalRequest && !approvalRequest.ended_at');
    expect(admissions).toContain('{!hasActiveApproval && (');
    expect(admissions).toContain('WorkflowDecisionActions');
  });

  it('pagamento exige comprovante canônico distinto de nota fiscal', () => {
    const fleet = source('src/modules/fleet/components/FleetPaymentBlock.tsx');
    const purchases = source('src/modules/purchases/components/PurchaseAttachments.tsx');
    expect(fleet).toContain("attachment.type === 'comprovante_pagamento'");
    expect(fleet).toContain('Não confundir com nota fiscal');
    expect(purchases).toContain("'comprovante_pagamento'");
    expect(purchases).toContain('nota fiscal não substitui esta evidência');
  });
});
