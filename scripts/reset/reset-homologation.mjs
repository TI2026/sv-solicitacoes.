#!/usr/bin/env node
/**
 * Reset oficial de homologação — script administrativo LOCAL.
 *
 * Fora do frontend e fora de qualquer Edge Function pública.
 * Substitui a antiga RPC destrutiva admin_purge_test_data (removida do schema).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/reset/reset-homologation.mjs --project-ref <ref> --confirm <ref>
 *
 * Regras de segurança:
 *  - só aceita host local/staging por padrão;
 *  - recusa o project ref de produção sem --i-know-this-is-production;
 *  - exige confirmação digitada igual ao project ref;
 *  - service_role só existe no processo local (nunca impresso);
 *  - gera manifesto do que foi removido;
 *  - idempotente e retomável (pode ser executado novamente com segurança).
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const PRODUCTION_REFS = ['zeaerqlvhrbcuubueolh'];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(`--${name}`);

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = flag('project-ref');
const confirm = flag('confirm');
const allowProduction = has('i-know-this-is-production');

function abort(msg) {
  console.error(`ABORTADO: ${msg}`);
  process.exit(1);
}

if (!url || !serviceKey) abort('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente local.');
if (!projectRef) abort('informe --project-ref <ref>.');
if (confirm !== projectRef) abort('confirmação ausente ou divergente: use --confirm <mesmo project ref>.');

const host = new URL(url).hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
if (PRODUCTION_REFS.includes(projectRef) && !allowProduction) {
  abort(`${projectRef} é um project ref de PRODUÇÃO. Reset bloqueado.`);
}
if (!isLocal && !host.includes(projectRef)) abort('URL não corresponde ao project ref informado.');
if (!isLocal && !allowProduction && !/staging|homolog/i.test(projectRef)) {
  abort('apenas ambientes local/staging são aceitos por padrão.');
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Ordem de dependência: filhos antes dos pais.
const TABLES = [
  'fuel_attachments', 'fuel_reviews', 'fuel_requests',
  'document_reviews', 'candidate_documents', 'medical_exams', 'system_registrations',
  'public_tokens', 'admission_files', 'admission_public_links', 'admission_interviews',
  'candidates', 'admission_requests',
  'epi_movements', 'epi_deliveries',
  'termination_requests',
  'purchases',
  'approval_history', 'approval_request_steps', 'approval_requests',
  'status_history', 'notifications', 'audit_logs',
  'user_preferences', 'user_effective_permissions', 'user_permission_overrides',
  'user_role_assignments', 'user_roles', 'collaborators', 'profiles',
];

const BUCKETS = ['admissions', 'fleet', 'purchases', 'epis'];

const manifest = { startedAt: new Date().toISOString(), projectRef, tables: {}, storage: {}, auth: {} };

async function purgeTable(table) {
  const { count: before } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (!before) { manifest.tables[table] = 0; return; }
  const { error } = await admin.from(table).delete().not('id', 'is', null);
  if (error && !/column .* does not exist/.test(error.message)) {
    // tabelas sem coluna id (ex.: role_permissions) não entram nesta lista
    manifest.tables[table] = `ERRO: ${error.message}`;
    return;
  }
  manifest.tables[table] = before;
}

async function purgeBucket(bucket) {
  const removed = [];
  const walk = async (prefix) => {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) return;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) await walk(path);
      else removed.push(path);
    }
  };
  await walk('');
  if (removed.length) await admin.storage.from(bucket).remove(removed);
  manifest.storage[bucket] = removed;
}

async function purgeAuthUsers() {
  let removed = 0;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) { manifest.auth.error = error.message; break; }
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) { manifest.auth.error = delErr.message; return; }
      removed += 1;
    }
  }
  manifest.auth.removed = removed;
}

for (const table of TABLES) await purgeTable(table);
for (const bucket of BUCKETS) await purgeBucket(bucket);
await purgeAuthUsers();

manifest.finishedAt = new Date().toISOString();
mkdirSync('artifacts/reset', { recursive: true });
const out = `artifacts/reset/manifest-${projectRef}-${Date.now()}.json`;
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`Reset concluído. Manifesto: ${out}`);
