# SPRINT 15: PLANO DE BANCO E MIGRATIONS

## REGRAS GERAIS E PREFLIGHT
Nenhuma migration será executada antes de:
1. `SELECT DISTINCT status FROM purchases;`
2. `SELECT constraint_name, check_clause FROM information_schema.check_constraints WHERE constraint_name = 'approver_type_check';`
3. Atestar a existência ou ausência de colunas vitais (`deleted_at`).

## ORDEM DAS MIGRATIONS CORRETIVAS

### 1. `20260723_001_sprint15_schema_fixes.sql`
- **Preflight:** Validar se `purchases` tem `deleted_at`.
- **Ação:** `ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS deleted_at timestamptz;`
- **Ação:** Recria policies que dependem dessa coluna com `CREATE POLICY ... OR REPLACE` (ou DROP + CREATE).

### 2. `20260723_002_sprint15_status_normalization.sql`
- **Preflight:** Analisar resultados reais do SELECT.
- **Ação:** Criar mapeamento explícito com `UPDATE` apenas nos registros divergentes que possuam regra de equivalência empresarial validada.
- **Ação:** `ADD CONSTRAINT` de check para status estritamente em bloco `DO $$ BEGIN IF NOT EXISTS... END $$;`.

### 3. `20260723_003_sprint15_approval_engine.sql`
- **Ação:** Cria RPCs operacionais de compras (`advance_purchase_to_oc`, `confirm_purchase_payment`).
- **Ação:** Atualizar `get_domain_status()` e corrigir `get_approval_context()` para remover referências cegas a `fuel_requests`.
- **Ação:** Adiciona restrições (UNIQUE INDEX) contra duplicidades (`idx_approval_requests_one_active_per_reference`).

### 4. `20260723_004_sprint15_rbac_sync.sql`
- **Ação:** Migrar ou atualizar referências pendentes na matriz canônica.
- **Ação:** Assegurar que `approvalLabels.ts` corresponda à constraint do banco, atualizando banco caso existam divergências irrecuperáveis do Frontend.

## ROLLBACK
- Backup full antes da etapa 1.
- Migrations acompanhadas de scripts SQL reversos salvos nos artefatos.
- Nenhuma exclusão definitiva (DROP TABLE, DROP COLUMN de dados).
- Uso exclusivo de views, triggers condicionalmente desativáveis ou policies temporárias.
