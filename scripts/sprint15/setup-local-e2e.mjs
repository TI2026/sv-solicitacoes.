import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

/**
 * Sprint 15 — Setup Local E2E
 * Cria dados fictícios idempotentes para testes.
 */

// Obtém as credenciais locais via supabase CLI
const statusJson = execSync('npx supabase status -o json', { encoding: 'utf-8' });
const status = JSON.parse(statusJson);

const SUPABASE_URL = status.API_URL;
const SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Erro: Não foi possível obter credenciais do Supabase local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Usuários fictícios
const USERS = [
  { email: 'solicitante@local.e2e', name: 'Solicitante E2E', role: 'solicitante' },
  { email: 'supervisor@local.e2e', name: 'Supervisor E2E', role: 'supervisor' },
  { email: 'rh@local.e2e', name: 'RH E2E', role: 'rh' },
  { email: 'compras@local.e2e', name: 'Compras E2E', role: 'compras' },
  { email: 'financeiro@local.e2e', name: 'Financeiro E2E', role: 'financeiro' },
  { email: 'master@local.e2e', name: 'Master E2E', role: 'master' },
];

async function setup() {
  console.log("Iniciando setup E2E...");

  for (const u of USERS) {
    // 1. Criar ou obter usuário no Auth
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error("Erro ao listar usuários:", listError);
      return;
    }

    let authId;
    const existing = usersData.users.find((x) => x.email === u.email);
    if (existing) {
      authId = existing.id;
      console.log(`Usuário ${u.email} já existe (${authId}).`);
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'Password123!',
        email_confirm: true,
      });
      if (createError) {
        console.error(`Erro ao criar ${u.email}:`, createError);
        continue;
      }
      authId = created.user.id;
      console.log(`Usuário ${u.email} criado (${authId}).`);
    }

    // 2. Atualizar profile
    await supabase.from('profiles').update({
      full_name: u.name,
      status: 'ativo'
    }).eq('id', authId);

    // 3. Garantir role assignment
    const { data: roles } = await supabase.from('app_roles').select('id').eq('role', u.role).single();
    if (roles) {
      const { data: currentAssignment } = await supabase
        .from('user_role_assignments')
        .select('id')
        .eq('user_id', authId)
        .eq('role_id', roles.id)
        .maybeSingle();

      if (!currentAssignment) {
         await supabase.from('user_role_assignments').insert({
           user_id: authId,
           role_id: roles.id
         });
         console.log(`Role ${u.role} atribuída a ${u.name}`);
      }
    }
  }

  console.log("Setup E2E finalizado com sucesso!");
}

setup().catch(console.error);
