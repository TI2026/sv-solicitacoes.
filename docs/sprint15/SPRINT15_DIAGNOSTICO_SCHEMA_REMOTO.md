# SPRINT 15: DIAGNÓSTICO DO SCHEMA REMOTO (READ-ONLY)

**Data/Hora:** 2026-07-23
**Ambiente:** Banco Remoto Vinculado (zeaerqlvhrbcuubueolh)

A consulta ao banco de dados remoto revelou a real estrutura do ambiente, permitindo afastar inferências e trabalhar com evidências concretas.

## A. Histórico Remoto (schema_migrations)
A consulta `SELECT version, name` confirmou os seguintes últimos registros remotos (sem a coluna `inserted_at`, que não existe nativamente no `schema_migrations` do Supabase CLI atual):
- `20260722180736` (corresponde ao local `20260722180729_e6dd8ffe...`)
- `20260722173243` (corresponde ao local `20260722173238_8eed0b21...`)
- `20260722172107` (corresponde ao local `20260722172058_8112a36e...`)
- `20260722131810` (corresponde ao local `20260722131759_e158db73...`)
- `20260722130023` (corresponde ao local `20260722130016_e70d93d1...`)
- `20260722122324` (corresponde ao local `20260722122320_251a18c2...`)
- `20260721203545` (corresponde ao local `20260721203541_bd0c583f...`)
- E a partir de `20260623185324` para trás, **NENHUMA** migration remota possui `name` registrado, apenas a `version`. (Comportamento típico de db push puro de esquema consolidado ou histórico importado do Lovable sem metadados).

**Conclusão sobre Histórico:** O drift é comprovadamente um descompasso de timestamp gerado pelo motor de execução (dashboard / remote sync). A estrutura local e remota formam pares equivalentes de **TIPO 1 (Correspondência Exata)**. Não há inserções arbitrárias de `statements` SQL no painel de migrations para esses itens.

## B. Purchases
- **Colunas Encontradas:** `id`, `requester_user_id`, `supplier`, `category`, `description`, `justification`, `cost_center`, `priority`, `estimated_value`, `approved_value`, `purchase_number`, `status`, `approval_request_id`, `attachments`, `deleted_at`, `created_at`, `updated_at`.
- **Status distintos atuais:** `rascunho` (apenas rascunho existe na base de produção ativa).
- **Índices:** `purchases_pkey`, `idx_purchases_requester`, `idx_purchases_status`, `idx_purchases_created_at`, `idx_purchases_approval`.
- **Evidência:** A tabela e a coluna `deleted_at` existem remotamente.

## C. Approval Engine
- **Colunas em `approval_flows`:** `id`, `module_id`, `name`, `approval_type`, `active`, `require_rejection_reason`, `allow_return_for_adjustment`, `notify_next_approver`, `created_by`, `created_at`, `updated_at`, `return_mode`.
- **Funções Remotas (`public`):** Somente `process_approval_action` e `start_approval_flow` retornaram. As funções `get_approval_context` e `get_domain_status` **NÃO ESTÃO REGISTRADAS** com o nome exato no `pg_proc` no schema public (podem ter sido apagadas, estar em outro schema, ou renomeadas, evidenciando que o esquema local de relatórios/motor precisa recriar/apontar corretamente).

## D. RBAC
- **Tabelas identificadas:** `roles`, `user_role_assignments`, `user_roles`. 
- A tabela `app_role` **NÃO FOI ENCONTRADA** na visão padrão, o que corrobora o uso do novo sistema dinâmico implementado via `roles`.

## E. Storage e Realtime
- **Buckets existentes e mapeados:** `admissions` (privado), `fleet` (privado), `avatars` (público), `epis` (privado), `purchase-attachments` (privado).
- **Evidência:** O bucket `purchase-attachments` já existe remotamente.

---
Este relatório retifica a análise anterior: **não existe corrupção severa do banco**, mas sim um histórico limpo e tabelas estruturadas onde funções utilitárias do motor podem ter sido alteradas ou omitidas. O ambiente é seguro para conciliação.
