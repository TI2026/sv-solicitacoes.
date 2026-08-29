import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

describe('Checkpoint B - authoritative security freeze', () => {
  it('matches the public candidate upload contract and checks HTTP failures', () => {
    const page = read('src/modules/admissions/pages/PublicDocumentsPage.tsx');
    const edge = read('supabase/functions/public-documents-submit/index.ts');

    expect(page).toContain('const formData = new FormData()');
    expect(page).toContain("formData.append('token', token)");
    expect(page).toContain("formData.append('file', file)");
    expect(page).toContain("formData.append('file_type', docKey)");
    expect(page).toContain('body: formData');
    expect(page).not.toContain('signedUrl');
    expect(page).toContain('if (!res.ok || result.error)');

    expect(edge).toContain('const formData = await req.formData()');
    expect(edge).toContain('getMagicBytesMime');
    expect(edge).toContain("if (!link || link.used_at || new Date(link.expires_at) < new Date())");
  });

  it('retires the legacy status-repair cron in favor of the database SLA sweep', () => {
    const source = read('supabase/functions/cron-approval-sync/index.ts');
    expect(source).toContain("error: 'ENDPOINT_RETIRED'");
    expect(source).toContain('public._engine_sla_sweep() via pg_cron');
    expect(source).toContain('status: 410');
    expect(source).not.toContain(".update({ status:");
    expect(source).not.toContain("from('fuel_requests')");
  });

  it('uses persisted RBAC for navigation and routes once configured', () => {
    const hook = read('src/hooks/usePermission.ts');
    const routes = read('src/App.tsx');
    const layout = read('src/components/AppLayout.tsx');

    expect(hook).toContain("rpc('current_user_has_permission'");
    expect(hook).toContain("from('permission_modules')");
    expect(hook).toContain("from('permission_actions')");
    expect(hook).toContain('query.data?.configured');
    expect(routes).toContain('<PermissionGuard moduleCode="diaria" fallbackAuthenticated>');
    expect(routes).toContain('<PermissionGuard moduleCode="admissoes"');
    expect(layout).toContain("usePermission('compras', 'view'");
    expect(layout).toContain("usePermission('desligamentos', 'view'");
  });

  it('freezes direct inserts and scopes Purchase approver visibility by module', () => {
    const migration = read(
      'supabase/migrations/20260828120000_checkpoint_b_authoritative_freeze.sql',
    );
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.purchases');
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON public.fuel_requests');
    expect(migration).toContain("AND am.code = 'compras'");
    expect(migration).toContain('REVOKE INSERT ON TABLE public.notifications FROM authenticated');
  });

  it('opens the created Purchase draft where private attachments can be added', () => {
    const page = read('src/modules/purchases/pages/PurchaseFormPage.tsx');
    const form = read('src/modules/purchases/components/PurchaseForm.tsx');
    expect(page).toContain('const created = await createPurchase(data)');
    expect(page).toContain('navigate(`/purchases/${created.id}`)');
    expect(form).toContain('<PurchaseAttachments');
    expect(form).toContain('purchaseId={purchaseId}');
  });

  it('generates and downloads a real PDF artifact', () => {
    const source = read('src/modules/admissions/components/WelcomePdfGenerator.tsx');
    expect(source).toContain("new jsPDF({ orientation: 'portrait'");
    expect(source).toContain('doc.save(`Apresentacao_${safeName}.pdf`)');
  });

  it('does not synthesize Purchase OC events in Fleet timelines', () => {
    const source = read('src/modules/fleet/queries/fleetTimelineLoader.ts');
    expect(source).not.toContain('OC registrada:');
    expect(source).not.toContain("kind: 'oc'");
  });
});
