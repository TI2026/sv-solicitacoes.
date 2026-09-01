import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

describe('MVP 1.0 release regressions', () => {
  it('finalizes public Admissions only through the atomic database contract', () => {
    const edge = read('supabase/functions/admissions-finalize-signed-docs/index.ts');
    const migration = read('supabase/migrations/20260831173000_mvp_public_admissions_finalization.sql');

    expect(edge).toContain("rpc(\n      'finalize_admission_public_link'");
    expect(edge).not.toContain("from('public_tokens')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.finalize_admission_public_link');
    expect(migration).toContain('REQUIRED_DOCUMENTS_MISSING');
    expect(migration).toContain('SIGNED_DOCUMENTS_MISSING');
    expect(migration).toContain('bank_account_type');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.finalize_admission_public_link');
  });

  it('does not show public completion before the server confirms success', () => {
    const documents = read('src/modules/admissions/pages/PublicDocumentsPage.tsx');
    const signature = read('src/modules/admissions/pages/PublicSignaturePage.tsx');

    expect(documents).toContain('has_dependents: hasDependents');
    expect(documents).toContain('if (!res.ok || result.success !== true)');
    expect(signature).toContain('if (!res.ok || result.success !== true)');
    const finalizer = signature.slice(
      signature.indexOf('const handleFinalize'),
      signature.indexOf('if (loading)'),
    );
    expect(finalizer.indexOf('setSubmitted(true)')).toBeGreaterThan(finalizer.indexOf('if (!res.ok || result.success !== true)'));
  });

  it('allowlists candidate document types on both public upload endpoints', () => {
    const documents = read('supabase/functions/public-documents-submit/index.ts');
    const signatures = read('supabase/functions/public-signature-submit/index.ts');

    expect(documents).toContain('DOCUMENT_FILE_TYPES.has(file_type)');
    expect(signatures).toContain('SIGNATURE_FILE_TYPES.has(doc_key)');
    expect(signatures).not.toContain("return 'image/webp'");
  });

  it('renders exact V2 workflow states and resubscribes when filters change', () => {
    const status = read('src/components/ApprovalStatusBlock.tsx');
    const realtime = read('src/hooks/useRealtimeSubscription.ts');

    expect(status).toContain("awaiting_step: 'Aguardando aprovação'");
    expect(status).toContain("waiting_operational: 'Aguardando ação operacional'");
    expect(status).toContain("status === 'awaiting_step'");
    expect(realtime).toContain('const tablesSignature = JSON.stringify(tables)');
    expect(realtime).toContain('[channelName, enabled, queryClient, tablesSignature]');
  });

  it('versions anonymous JWT behavior only for capability-token endpoints', () => {
    const config = read('supabase/config.toml');
    for (const name of [
      'admissions-validate-token',
      'admissions-create-signed-upload',
      'public-link-lookup',
      'public-documents-submit',
      'public-signature-submit',
      'admissions-finalize-signed-docs',
    ]) {
      expect(config).toContain(`[functions.${name}]\nverify_jwt = false`);
    }
  });
});
