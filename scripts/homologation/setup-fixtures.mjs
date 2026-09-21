/**
 * CHECKPOINT 2 — Fixtures de homologação (APENAS AMBIENTE LOCAL).
 *
 * Cria as personas determinísticas exigidas pelo roteiro de homologação e
 * configura os assignments reais do Motor V2 (pessoa/substituto/SLA) em todas
 * as 17 etapas, usando somente RPCs oficiais do backend.
 *
 * Uso (com Supabase local em execução):
 *   node scripts/homologation/setup-fixtures.mjs
 *
 * GUARD: recusa execução se a API não for localhost/127.0.0.1.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf-8' }));
const SUPABASE_URL = status.API_URL;
const SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ABORT: credenciais do Supabase local não encontradas.');
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  console.error(`ABORT: ${SUPABASE_URL} não é local. Fixtures nunca rodam em produção.`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const PASSWORD = 'Homolog@2026';

/** Personas do roteiro. `role` usa o enum público app_role. */
export const PERSONAS = [
  { key: 'A', email: 'a.requester@local.homolog', name: 'A Solicitante', role: 'colaborador' },
  { key: 'B', email: 'b.approver1@local.homolog', name: 'B Aprovador 1', role: 'supervisor' },
  { key: 'C', email: 'c.approver2@local.homolog', name: 'C Aprovador 2', role: 'administrativo' },
  { key: 'D', email: 'd.approver3@local.homolog', name: 'D Aprovador 3', role: 'administrativo' },
  { key: 'S', email: 's.substitute@local.homolog', name: 'S Substituto', role: 'supervisor' },
  { key: 'M', email: 'm.master@local.homolog', name: 'M Master', role: 'master' },
  { key: 'F', email: 'f.financeiro@local.homolog', name: 'F Financeiro', role: 'financeiro' },
  { key: 'RH', email: 'rh@local.homolog', name: 'RH Homolog', role: 'rh' },
  { key: 'DIR', email: 'dir@local.homolog', name: 'DIR Diretoria', role: 'diretoria' },
  { key: 'U', email: 'u.unrelated@local.homolog', name: 'U Sem Relação', role: 'colaborador' },
];

async function ensureUser(p) {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === p.email);
  let id = existing?.id;
  if (!id) {
    const { data, error: createErr } = await db.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.name },
    });
    if (createErr) throw createErr;
    id = data.user.id;
  }
  // profiles é criado pelo trigger handle_new_user; garantir nome e ativo.
  const { error: profErr } = await db
    .from('profiles')
    .update({ full_name: p.name, active: true })
    .eq('id', id);
  if (profErr) throw profErr;

  const { error: roleErr } = await db
    .from('user_roles')
    .upsert({ user_id: id, role: p.role }, { onConflict: 'user_id,role' });
  if (roleErr) throw roleErr;

  return { ...p, id };
}

/** Distribui as 17 etapas entre B (1ª), C (2ª) e D (3ª), com S como substituto. */
async function configureSteps(byKey) {
  const { data: steps, error } = await db
    .from('approval_flow_steps')
    .select('id, step_order, step_code, flow_id, approval_flows!inner(version, module_id)')
    .eq('approval_flows.version', 'v2')
    .order('step_order');
  if (error) throw error;

  const primaryByOrder = { 1: byKey.B.id, 2: byKey.C.id, 3: byKey.D.id };
  for (const step of steps) {
    const primary = primaryByOrder[step.step_order] ?? byKey.D.id;
    const { data, error: rpcErr } = await db.rpc('save_approval_step_assignment', {
      p_step_id: step.id,
      p_assignment_mode: 'person',
      p_primary_user_id: primary,
      p_substitute_user_id: byKey.S.id,
      p_sector_id: null,
      p_sla_hours: 1,
    });
    if (rpcErr) throw new Error(`${step.step_code}: ${rpcErr.message}`);
    if (data?.error) throw new Error(`${step.step_code}: ${data.error}`);
  }
  return steps.length;
}

async function main() {
  const created = [];
  for (const p of PERSONAS) created.push(await ensureUser(p));
  const byKey = Object.fromEntries(created.map((p) => [p.key, p]));

  const stepCount = await configureSteps(byKey);

  const { data: health } = await db.rpc('get_approval_configuration_health');

  console.log('PERSONAS:');
  for (const p of created) console.log(`  ${p.key.padEnd(3)} ${p.email} ${p.id} [${p.role}]`);
  console.log(`STEPS CONFIGURADAS: ${stepCount} (esperado 17)`);
  console.log(`HEALTH: ${health?.overall ?? 'desconhecido'} flows=${health?.flows_total} steps=${health?.steps_total}`);

  if (stepCount !== 17) process.exitCode = 1;
  if (health?.overall === 'blocked') process.exitCode = 1;
}

main().catch((e) => {
  console.error('FIXTURES FALHARAM:', e.message);
  process.exit(1);
});
