/**
 * CHECKPOINT 2 — Bateria de homologação multiusuário (APENAS LOCAL).
 *
 * Executa, com sessões reais e distintas por persona, os fluxos dos seis
 * módulos e os testes negativos. Todo workflow passa exclusivamente por
 * execute_entity_action(); nenhuma RPC legada é chamada.
 *
 * Uso:
 *   node scripts/homologation/setup-fixtures.mjs
 *   node scripts/homologation/run-homologation.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { PASSWORD, PERSONAS } from './setup-fixtures.mjs';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf-8' }));
const URL = status.API_URL;
const ANON = status.ANON_KEY;
const SERVICE = status.SERVICE_ROLE_KEY;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL ?? '')) {
  console.error('ABORT: homologação só roda em Supabase local.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function session(key) {
  const persona = PERSONAS.find((p) => p.key === key);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: persona.email, password: PASSWORD });
  if (error) throw new Error(`login ${key}: ${error.message}`);
  const { data } = await client.auth.getUser();
  return { key, client, id: data.user.id };
}

const act = (s, moduleKey, entityId, action, payload = {}) =>
  s.client.rpc('execute_entity_action', {
    p_module_key: moduleKey,
    p_entity_id: entityId,
    p_action: action,
    p_payload: payload,
  });

const ctx = (s, moduleKey, entityId) =>
  s.client.rpc('get_entity_action_context', { p_module_key: moduleKey, p_entity_id: entityId });

const ok2xx = (res) => !res.error && res.data && Number(res.data.code ?? 200) >= 200 && Number(res.data.code ?? 200) < 300;
const denied = (res) => !!res.error || !res.data || Number(res.data.code ?? 500) >= 400 || res.data.success === false;

/** 1. Compras: rascunho → 2 aprovações → OC → pagamento → entrega → conclusão. */
async function purchases(S) {
  const { data: purchase, error } = await S.A.client
    .from('purchases')
    .insert({
      requester_user_id: S.A.id,
      category: 'material',
      description: 'Homologação Checkpoint 2',
      priority: 'normal',
      estimated_value: 1000,
      status: 'rascunho',
    })
    .select()
    .single();
  if (error) return record('Compras: criar rascunho', false, error.message);
  record('Compras: criar rascunho', true, purchase.id);

  record('Compras: enviar (A)', ok2xx(await act(S.A, 'compras', purchase.id, 'enviar')));

  const c1 = await ctx(S.B, 'compras', purchase.id);
  record('Compras: B é ator da etapa 1', c1.data?.is_current_actor === true, c1.data?.current_step_code);
  record('Compras: U não executa', denied(await act(S.U, 'compras', purchase.id, 'aprovar', { notes: 'tentativa indevida' })));
  record('Compras: A não aprova a própria', denied(await act(S.A, 'compras', purchase.id, 'aprovar', { notes: 'auto aprovação' })));
  record('Compras: B aprova', ok2xx(await act(S.B, 'compras', purchase.id, 'aprovar', { notes: 'aprovado etapa 1' })));
  record('Compras: C aprova', ok2xx(await act(S.C, 'compras', purchase.id, 'aprovar', { notes: 'aprovado etapa 2' })));

  for (const [action, persona, payload] of [
    ['gerar_oc', 'C', { oc_number: 'OC-HOMOLOG-1', notes: 'ordem emitida' }],
    ['pagar', 'F', { notes: 'pagamento efetuado' }],
    ['informar_entrega', 'A', { notes: 'entrega recebida' }],
    ['concluir', 'A', { notes: 'processo concluido' }],
  ]) {
    const actor = S[persona];
    const c = await ctx(actor, 'compras', purchase.id);
    const allowed = (c.data?.allowed_actions ?? []).includes(action);
    record(`Compras: ${action} disponível no contexto de ${persona}`, allowed, String(c.data?.current_status));
    if (allowed) record(`Compras: ${action} (${persona})`, ok2xx(await act(actor, 'compras', purchase.id, action, payload)));
  }
  return purchase.id;
}

/** 2. Devolução/reenvio — mesma approval_request, mesma etapa. */
async function returnResubmit(S) {
  const { data: p } = await S.A.client
    .from('purchases')
    .insert({
      requester_user_id: S.A.id,
      category: 'servico',
      description: 'Homologação devolução',
      priority: 'normal',
      estimated_value: 500,
      status: 'rascunho',
    })
    .select()
    .single();
  await act(S.A, 'compras', p.id, 'enviar');
  const before = (await ctx(S.A, 'compras', p.id)).data;
  record('Return: B devolve com motivo', ok2xx(await act(S.B, 'compras', p.id, 'devolver', { notes: 'faltou orcamento detalhado' })));
  record('Return: motivo curto é recusado', denied(await act(S.B, 'compras', p.id, 'devolver', { notes: 'nao' })));
  record('Return: A reenvia', ok2xx(await act(S.A, 'compras', p.id, 'enviar', { notes: 'orcamento anexado' })));
  const after = (await ctx(S.A, 'compras', p.id)).data;
  record('Return: mesma approval_request', before?.approval_request_id === after?.approval_request_id);
  record('Return: mesma etapa', before?.current_step_code === after?.current_step_code);
}

/** 3. Reembolso: envio sem comprovante deve ser recusado pelo backend. */
async function reimbursement(S) {
  const { data: r, error } = await S.A.client
    .from('fuel_requests')
    .insert({
      requester_user_id: S.A.id,
      type: 'reembolso',
      valor: 120,
      data_abastecimento: new Date().toISOString().slice(0, 10),
      categoria: 'alimentacao',
      status: 'rascunho',
      notes: 'Homologação reembolso',
    })
    .select()
    .single();
  if (error) return record('Reembolso: criar rascunho', false, error.message);
  record('Reembolso: criar rascunho', true, r.id);
  record('Reembolso: envio sem comprovante é BLOQUEADO', denied(await act(S.A, 'reembolso', r.id, 'enviar')));
}

/** 4. Diária: enviar de verdade e chegar à etapa 1 pendente. */
async function daily(S) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: d, error } = await S.A.client
    .from('fuel_requests')
    .insert({
      requester_user_id: S.A.id,
      type: 'diaria',
      valor: 300,
      data_abastecimento: today,
      daily_start_date: today,
      daily_end_date: today,
      daily_quantity: 1,
      daily_value: 300,
      person_name: 'A Solicitante',
      status: 'rascunho',
      notes: 'Homologação diária',
    })
    .select()
    .single();
  if (error) return record('Diária: criar rascunho', false, error.message);
  record('Diária: enviar', ok2xx(await act(S.A, 'diaria', d.id, 'enviar')));
  const c = (await ctx(S.A, 'diaria', d.id)).data;
  record('Diária: etapa 1 pendente com responsável', !!c?.current_approver_user_id, c?.current_step_code);
  record('Diária: sem etapas de Compras', !JSON.stringify(c?.allowed_actions ?? []).includes('gerar_oc'));
}

/** 5. Concorrência: duas aprovações simultâneas → apenas uma vence. */
async function concurrency(S) {
  const { data: p } = await S.A.client
    .from('purchases')
    .insert({
      requester_user_id: S.A.id,
      category: 'material',
      description: 'Homologação concorrência',
      priority: 'normal',
      estimated_value: 700,
      status: 'rascunho',
    })
    .select()
    .single();
  await act(S.A, 'compras', p.id, 'enviar');
  const [r1, r2] = await Promise.all([
    act(S.B, 'compras', p.id, 'aprovar', { notes: 'aprovacao simultanea 1' }),
    act(S.B, 'compras', p.id, 'aprovar', { notes: 'aprovacao simultanea 2' }),
  ]);
  const wins = [r1, r2].filter(ok2xx).length;
  record('Concorrência: apenas uma aprovação vence', wins === 1, `vencedoras=${wins}`);
  const { count } = await admin
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('reference_id', p.id);
  record('Concorrência: nenhuma approval_request duplicada', count === 1, `requests=${count}`);
}

/** 6. RLS negativa para usuário sem relação. */
async function negativeRls(S) {
  const { data: rows } = await S.U.client.from('approval_requests').select('id').limit(5);
  record('RLS: U não lê approval_requests alheias', (rows ?? []).length === 0);
  const steps = await S.U.client.from('approval_request_steps').select('id').limit(5);
  record('RLS: U não lê etapas alheias', (steps.data ?? []).length === 0);
  const upd = await S.U.client.from('purchases').update({ status: 'pago' }).neq('requester_user_id', S.U.id).select();
  record('RLS: U não altera compras alheias', (upd.data ?? []).length === 0);
  const docs = await S.U.client.from('documents').select('id').limit(1);
  record('RLS: catálogo de documentos restrito', (docs.data ?? []).length === 0);
}

/** 7. Escalonamento por SLA — executa o sweep do banco. */
async function slaSweep() {
  await admin.rpc('_engine_sla_sweep');
  const again = await admin.rpc('_engine_sla_sweep');
  record('SLA: sweep idempotente', !again.error, JSON.stringify(again.data ?? {}));
}

async function main() {
  const S = {};
  for (const key of ['A', 'B', 'C', 'D', 'S', 'M', 'F', 'RH', 'DIR', 'U']) S[key] = await session(key);

  await purchases(S);
  await returnResubmit(S);
  await reimbursement(S);
  await daily(S);
  await concurrency(S);
  await negativeRls(S);
  await slaSweep();

  const failed = results.filter((r) => !r.ok);
  console.log(`\nTOTAL: ${results.length} | PASS: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (failed.length) {
    console.log('FALHAS:');
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('HOMOLOGAÇÃO ABORTADA:', e.message);
  process.exit(1);
});
