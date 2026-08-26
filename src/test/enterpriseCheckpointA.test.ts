import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSupabaseConfig } from '@/lib/supabaseConfig';

const source = (file: string) => readFileSync(resolve(file), 'utf8');

describe('MVP Enterprise — Checkpoint A', () => {
  it('produz diagnóstico visível quando a configuração pública está ausente', () => {
    const missing = resolveSupabaseConfig({}, 'production');
    expect(missing.error).toContain('VITE_SUPABASE_URL');
    expect(missing.error).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');

    const valid = resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
    }, 'production');
    expect(valid.error).toBeNull();
  });

  it('mantém fallback de configuração somente no ambiente de teste', () => {
    expect(resolveSupabaseConfig({}, 'test').error).toBeNull();
    expect(resolveSupabaseConfig({}, 'development').error).not.toBeNull();
  });

  it('não bloqueia Diárias por cargos hardcoded e mantém permissão fail-closed', () => {
    const app = source('src/App.tsx');
    const layout = source('src/components/AppLayout.tsx');
    const permission = source('src/hooks/usePermission.ts');

    expect(app).toContain('<ProtectedRoute><DiariasListPage /></ProtectedRoute>');
    expect(app).not.toContain("<RoleGuard roles={['diretoria', 'administrativo']}><DiariasListPage");
    expect(layout).toContain("to: '/diarias', label: 'Diárias', icon: CalendarDays, show: true");
    expect(permission).toContain('allowed: query.data ?? false');
    expect(permission).not.toContain("hasRole?.('diretoria')");
  });

  it('renderiza status V2-first e diferencia etapa atual de etapa futura', () => {
    const block = source('src/components/ApprovalStatusBlock.tsx');
    const viewer = source('src/modules/fleet/components/ApprovalFlowViewer.tsx');

    expect(block).toContain("awaiting_step: 'Aguardando etapa'");
    expect(block).toContain("waiting_operational: 'Aguardando ação operacional'");
    expect(block).toContain("completed: 'Concluído'");
    expect(viewer).toContain("s.status === 'pending' ? 'Etapa atual'");
    expect(viewer).toContain(": 'Futura'");
    expect(viewer).toContain('s.step_name');
  });

  it('comunica limite ilimitado e conduz compra nova ao rascunho editável', () => {
    const settings = source('src/pages/SettingsPage.tsx');
    const purchase = source('src/modules/purchases/pages/PurchaseFormPage.tsx');

    expect(settings).toContain('Sem regra configurada, a criação é ilimitada.');
    expect(settings).not.toContain('limite padrão é 5');
    expect(purchase).toContain('navigate(`/purchases/${created.id}`)');
  });

  it('não converte indisponibilidade da fila em zero real', () => {
    const queue = source('src/modules/dashboard/components/MyQueueWidget.tsx');
    const layout = source('src/components/AppLayout.tsx');

    expect(queue).toContain('Fila indisponível');
    expect(queue).toContain('Nenhum zero foi presumido');
    expect(layout).toContain("label: '!', title: 'Fila temporariamente indisponível'");
  });
});
