# Pré-flight do reset operacional — inventário e dry-run

Status: **PRODUCTION AUTHORIZED: NO** — nenhuma linha, usuário ou arquivo foi apagado.
Todas as consultas desta rodada foram **somente leitura** no banco de produção.

## 1. Ambiente

| Item | Valor |
|---|---|
| Ambiente | Produção (único projeto conectado) |
| project_ref (mascarado) | `zeae…eolh` |
| Branch | `edit/edt-c21ee515-96ef-40da-a6ca-ddd18e6aaf26` |
| Commit SHA | `166aea6085acd9744df7a72ad1b7c118e3cbdaaf` |
| Migrations na cadeia oficial | 153 (`supabase/migrations`) |
| Migration de bootstrap do Master | `supabase/migrations_staged/20260922160000_…` — **não aplicada** |

### Exclusividade do Nipô

Não existe **nenhuma** coluna de empresa/tenant no schema `public`
(`tenant/company/empresa/org` = 0 ocorrências). O projeto é **mono-empresa**:
todos os dados operacionais pertencem ao mesmo ambiente. Portanto não há como
segmentar o reset "por empresa" — a limpeza é integral do ambiente, e por isso
só pode ocorrer em staging nesta fase.

## 2. Inventário atual (produção, leitura)

| Nome na interface | Tabela | Hoje | Ação proposta | Esperado após reset |
|---|---|---:|---|---:|
| Usuários (Auth) | `auth.users` | 14 | apagar | 0 |
| Perfis (pessoas) | `public.profiles` | 14 | apagar (1:1 com `auth.users`) | 0 |
| Atribuições de papel | `user_role_assignments` | 13 | apagar | 0 |
| Papéis legados | `user_roles` | 16 | apagar | 0 |
| **Papéis empresariais** | `roles` | 8 | **preservar** | 8 |
| **Matriz RBAC** | `role_permission_matrix` | 390 | **preservar** | 390 |
| Permissões (catálogo antigo) | `permissions` | 0 | preservar | 0 |
| **Setores** | `sectors` | 12 | **preservar** (zerar responsável/substituto: 4 registros) | 12 |
| **Categorias dinâmicas** | `dynamic_categories` | 390 | **preservar** (limpar `created_by`) | 390 |
| **Fluxos do Motor V2** | `approval_flows` | 45 | **preservar** | 45 |
| **Etapas dos fluxos** | `approval_flow_steps` | 102 | **preservar definição**; limpar titular/substituto (90 com usuário) | 102 |
| Aprovações (instâncias) | `approval_requests` | 64 | apagar | 0 |
| Etapas executadas | `approval_request_steps` | 132 | apagar | 0 |
| Histórico de aprovação | `approval_history` | 89 | apagar | 0 |
| Abastecimento/Diária/Reembolso | `fuel_requests` | 94 | apagar (+anexos/reviews) | 0 |
| Compras | `purchases` | 8 | apagar | 0 |
| Admissões | `admission_requests` | 3 | apagar | 0 |
| Candidatos | `candidates` | 1 | apagar | 0 |
| Arquivos de admissão | `admission_files` | 1 | apagar | 0 |
| Links públicos | `admission_public_links` | 2 | apagar | 0 |
| Tokens públicos | `public_tokens` | 0 | apagar | 0 |
| Desligamentos | `termination_requests` | 1 | apagar | 0 |
| Colaboradores | `collaborators` | 4 | apagar | 0 |
| Veículos | `vehicles` | 7 | apagar | 0 |
| **Catálogo de EPIs** | `epi_items` | 40 | **preservar** | 40 |
| **Regras de kit por setor** | `epi_kit_rules` | 5 | **preservar** | 5 |
| Entregas de EPI | `epi_deliveries` | 5 | apagar (vinculadas a colaboradores) | 0 |
| Movimentações de EPI | `epi_movements` | 5 | apagar | 0 |
| Notificações | `notifications` | 1.658 | apagar | 0 |
| Histórico de status | `status_history` | 753 | apagar | 0 |
| Auditoria | `audit_logs` | 933 | exportar evidência → apagar | 0 |

### Storage (objetos hoje)

| Bucket | Objetos | Ação |
|---|---:|---|
| `admissions` | 175 | apagar |
| `fleet` | 31 | apagar |
| `epis` | 2 | apagar |
| `avatars` | 2 | apagar |

### "Perfis" e "EPIs" — definição resolvida

- **Perfis** = `public.profiles`, registro **individual 1:1 com `auth.users`**
  (0 órfãos nos dois sentidos hoje). Logo, é dado de pessoa e **é apagado junto
  com o usuário**. Perfil empresarial/RBAC é `roles` + `role_permission_matrix`
  e **é preservado**.
- **EPIs**: catálogo (`epi_items`) e regras de kit (`epi_kit_rules`) são
  estruturais e **preservados**. Somente entregas e movimentações (vinculadas a
  colaboradores apagados) são removidas, evitando referência órfã.

## 3. Dry-run

O script `scripts/reset/reset-homologation.mjs` executa a ordem de dependência
acima (filhos antes dos pais), apaga Auth pela Admin API e os quatro buckets, e
grava manifesto em `artifacts/reset/`. Ele **recusa** o project ref de produção e
exige `--confirm <ref>` digitado. Sem `TRUNCATE` e sem exclusão global.

Após o reset, os campos `responsible_user_id`, `substitute_user_id`,
`approver_user_id`, `created_by` ficam **NULL** e a prontidão do Motor V2 fica
**BLOCKED** até o Master configurar titular, substituto e SLA. Sem fallback.

## 4. Etapas que dependem de autorização/ambiente externo

1. Projeto Supabase de **staging** (não existe hoje) — sem ele não há reset
   ensaiado, backup/restore comprovado nem homologação multiusuário.
2. Backup + restore em instância isolada.
3. Execução do reset em staging e bootstrap do Master autorizado.
4. CI do GitHub na versão exata do PR.
5. Autorização explícita com o project_ref exato para produção.
