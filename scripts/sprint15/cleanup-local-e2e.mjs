import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

/**
 * Sprint 15 — Cleanup Local E2E
 * Remove dados fictícios criados para testes.
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

const USERS_EMAILS = [
  'solicitante@local.e2e',
  'supervisor@local.e2e',
  'rh@local.e2e',
  'compras@local.e2e',
  'financeiro@local.e2e',
  'master@local.e2e',
];

async function cleanup() {
  console.log("Iniciando cleanup E2E...");
  
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Erro ao listar usuários:", listError);
    return;
  }

  for (const u of usersData.users) {
    if (USERS_EMAILS.includes(u.email)) {
      const { error: delError } = await supabase.auth.admin.deleteUser(u.id);
      if (delError) {
        console.error(`Erro ao deletar ${u.email}:`, delError);
      } else {
        console.log(`Usuário ${u.email} deletado.`);
      }
    }
  }

  console.log("Cleanup E2E finalizado com sucesso!");
}

cleanup().catch(console.error);
