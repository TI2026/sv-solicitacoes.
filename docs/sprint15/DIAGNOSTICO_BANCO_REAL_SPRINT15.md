# SPRINT 15: DIAGNÓSTICO DO BANCO REAL

**Data/Hora:** 2026-07-23
**Status da Conexão Direta:** INDISPONÍVEL (Acesso read-only via SQL direto bloqueado/sem credenciais de Postgres, apenas CLI responde listagens via Token)
**Acesso:** Read-only indireto via Supabase CLI (`npx supabase migration list`)
**Projeto vinculado:** `zeaerqlvhrbcuubueolh`

## 1. Evidências de Drift (Conflitos Locais vs Remotos)
A listagem obtida através de `npx supabase migration list` confirmou a presença de severa divergência de histórico:
- **Migrations Locais vs Remotas:** Todas as migrations apresentam variação nos timestamps remotos. Por exemplo, a migration local `20260721203541_bd0c583f...` possui um registro remoto `20260721203545`. O Supabase CLI ou o ambiente do Dashboard executaram essas alterações com timestamps ligeiramente defasados, característico de aplicação manual ou via interface do Dashboard (ou reset pelo Lovable).
- **Repetições:** As migrations do Sprint 15 (`20260723_sprint15_001_purchases_schema.sql`, `002_purchase_rpcs.sql`, e `003_termination_unlink.sql`) constam como pendentes/não mapeadas de forma 1:1, ou os prefixos foram aplicados parcialmente.

## 2. Inventário Lógico (O que seria afetado)
Devido à falta de conexão SQL crua (sem Docker local ou URL direta de Postgres), não foi possível rodar os comandos de inspeção profunda no esquema de `purchases`, `approval_engine`, Funções, RBAC, Storage e Realtime de forma segura.

As expectativas são de que:
- O banco atual possua policies divergentes para `purchases`.
- O Motor de Aprovação remoto ainda opere com falhas na verificação do `fuel_requests`.

## 3. Decisão sobre o Histórico
**Estratégia Escolhida:** ESTRATÉGIA C — SCHEMA REMOTO TEM DRIFT
Tendo em vista o descompasso generalizado das chaves de migrations (devido a edições no Dashboard ou Lovable), não é seguro aplicar as migrations finais via `db push` ou reescrever histórico sem isolamento.

### Plano de Ação (Bloqueado)
1. **Capturar Estado:** Fazer o dump completo do schema remoto (`supabase db pull`) **apenas** em um ambiente ou branch isolada, *não* na branch atual.
2. **Migration de Reconciliação:** Uma migration sintética/cumulativa deverá ser criada e revisada.
3. **Rollback e Risco:** Risco ALTÍSSIMO se usar `migration repair` em massa. Rollback requereria backup point-in-time no painel.

## 4. Impedimento Técnico para Continuação (Write-Level)
O comando `npx supabase db push --dry-run` falha por "Remote migration versions not found in local migrations directory." O CLI exige o comando de "repair", que está estritamente **PROIBIDO** pelas regras do projeto sem validação manual prévia.

**Conclusão Parcial:**
O Banco Remoto requer atuação de DBA com acesso completo ao painel web do Supabase ou string de conexão direta, o que está fora do escopo local da IDE Antigravity no momento. O módulo backend não está homologado.
