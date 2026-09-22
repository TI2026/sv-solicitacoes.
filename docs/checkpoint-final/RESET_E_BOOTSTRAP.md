# CHECKPOINT FINAL — Reset controlado, Master inicial e homologação sistêmica

Status: **PRODUCTION AUTHORIZED: NO** — nada foi apagado, alterado ou aplicado em produção.

## 1. Auditoria do bootstrap atual (schema efetivo de produção, somente leitura)

| Item | Resultado |
|---|---|
| Trigger `AFTER INSERT ON auth.users` | **Existe**: `on_auth_user_created` → `public.handle_new_user()` |
| Função que cria `profiles` | `public.handle_new_user()` (SECURITY DEFINER) |
| Dependência de `user_roles` (legado) | **Sim** — o trigger insere `diretoria`/`colaborador` em `public.user_roles` |
| Modelo autoritativo atual | `user_role_assignments` + `roles` (`is_master`) |
| Identificação de Master | `is_master()` lê os dois modelos; `get_user_roles()` une legado + moderno; frontend usa `roles.includes('master')` |
| Primeiro usuário | Recebe **`diretoria`**, nunca `master` — defeito P1 |
| Corrida de duas inscrições | `count(profiles) = 1` sem lock → pode gerar **zero ou dois** promovidos — defeito P1 |
| `prevent_last_master_removal` | Existe, cobre DELETE em `user_role_assignments` |
| `guard_master_role_escalation` | Existe: só Master concede/remove Master; grava auditoria |

## 2. Bootstrap seguro proposto (migration NÃO aplicada)

`supabase/migrations_staged/20260922160000_checkpoint_final_bootstrap_master.sql`

- Tabela singleton `public.bootstrap_state` (PK booleana com CHECK), RLS ativa,
  leitura só para Master, **sem policy de escrita** (apenas `service_role`).
- `public.claim_master_bootstrap()`: `pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`,
  exige usuário autenticado, e-mail igual ao autorizado (configurado no servidor),
  `email_confirmed_at` não nulo, nenhum Master existente. Concede o papel em
  `user_role_assignments` (`roles.is_master = true`), reconstrói permissões efetivas,
  registra `BOOTSTRAP_MASTER_CREATED` em `audit_logs` e marca o bootstrap como concluído.
- `handle_new_user()` deixa de promover qualquer usuário e não escreve mais em
  `user_roles`. Toda nova conta entra como **pendente** (`profiles.active = false`),
  exceto o e-mail autorizado enquanto o bootstrap estiver aberto.
- Repetição da operação retorna `BOOTSTRAP_ALREADY_COMPLETED` (conflito seguro).

Testes: `supabase/tests/staged/24_bootstrap_master.test.sql` — 14/14 ok em banco limpo
(153 migrations = 152 oficiais + a staged).

## 3. Reset oficial de homologação

`scripts/reset/reset-homologation.mjs` — script administrativo **local**, fora do
frontend e fora de Edge Functions. Recusa o project ref de produção, exige
`--confirm <project-ref>` digitado, usa `service_role` apenas no processo local,
apaga Auth pela Admin API e Storage pela API de Storage, é idempotente/retomável e
grava manifesto em `artifacts/reset/`. Nenhuma RPC pública de limpeza foi recriada
(`admin_purge_test_data` continua removida do schema pela migration 152).

## 4. Matriz preservar × apagar

**Preservar:** migrations, schema, enums, functions, triggers, RLS/grants, `roles`
(inclusive Master), `permission_modules`, `permission_actions`, `role_permission_matrix`,
`permissions`/`role_permissions`, `approval_modules`, `approval_flows`,
`approval_flow_steps` (6 fluxos / 17 etapas), `request_limits`, `documents`,
`epi_items`, `epi_kit_rules`, cron de SLA, publication de Realtime.

**Revisar antes de preservar (referenciam usuários):** `sectors`
(`responsible_user_id`, `substitute_user_id`), `approval_flow_steps`
(`approver_user_id`, `substitute_user_id`, `fixed_sector_id`), `clinics`,
`vehicles.created_by`, `dynamic_categories.created_by`.
Regra: após o reset esses campos ficam **NULL** e a readiness do fluxo fica
**BLOCKED** até o Master configurar principal, substituto e SLA. Sem fallback.

**Apagar:** `fuel_requests` (+anexos/reviews), `purchases`, `admission_requests`,
`candidates`, `candidate_documents`, `document_reviews`, `medical_exams`,
`system_registrations`, `admission_files`, `admission_public_links`,
`admission_interviews`, `public_tokens`, `termination_requests`, `collaborators`,
`epi_deliveries`, `epi_movements`, `approval_requests`, `approval_request_steps`,
`approval_history`, `status_history`, `notifications`, `audit_logs` de teste,
`user_preferences`, `user_effective_permissions`, `user_permission_overrides`,
`user_role_assignments`, `user_roles`, `profiles`, usuários do Auth e objetos de
Storage dos buckets `admissions`, `fleet`, `purchases`, `epis`.

## 5. Limpeza do frontend

`src/lib/appStorage.ts` versiona o namespace local (`APP_STORAGE_VERSION`). No deploy
imediatamente posterior ao reset, incrementar a versão: cada navegador descarta
sessão Supabase, progresso público de assinatura e caches, voltando ao login.
Tokens de usuários apagados deixam de resolver perfil e caem na tela de login.

## 6. Etapas que dependem de autorização humana

1. Criar o projeto Supabase de **staging** e fornecer acesso.
2. Backup + restore comprovados em instância isolada.
3. Ensaio do reset em staging, bootstrap do proprietário e homologação completa.
4. Aplicar as migrations (152 oficiais + a staged, após revisão) em staging e,
   somente depois, em produção com a frase de autorização exigida.
5. Branch de Release Candidate, PR e execução do CI no GitHub.
