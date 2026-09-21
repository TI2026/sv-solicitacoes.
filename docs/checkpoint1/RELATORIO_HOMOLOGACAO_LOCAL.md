# CHECKPOINT 1 — RELATÓRIO DE HOMOLOGAÇÃO LOCAL

Ambiente: PostgreSQL 17.9 **LOCAL** isolado (`/tmp/pg`, banco `homolog`), plataforma
Supabase emulada por `scripts/homologation/sql/00_local_platform_bootstrap.sql`.
Produção (`zeaerqlvhrbcuubueolh`) **não foi tocada** — apenas duas consultas de leitura
para comparação de privilégios. Nada publicado, V2 **não** ativado em produção.

Sem Docker/Supabase CLI no sandbox: o banco foi levantado direto do binário PostgreSQL
com pg_cron e pgTAP. As 149 migrations foram aplicadas **do zero**, na ordem oficial,
sem alterar nenhuma migration histórica.

## A. PASS

| Check | Evidência |
|---|---|
| Migrations do zero | 149/149 aplicadas (`scripts/homologation/sql/reset_local_db.sh`) |
| Testes de banco (pgTAP) | 22 arquivos, **523 ok / 2 not ok** (ambos explicados em C) |
| Compras ponta a ponta | envio → aprovação 1 → aprovação 2 → OC → (pagamento em D-01) |
| Abastecimento ponta a ponta | envio → autorização → pagamento → `aguardando_fotos` → comprovantes → revisão → `concluido` |
| Diária ponta a ponta | envio → autorização → confirmação de horas → pagamento → `concluido`, sem OC/etapas de Compras |
| Reembolso ponta a ponta | envio bloqueado sem comprovante (422) → aprovação → revisão financeira → `pago` |
| Admissões | aprovação da vaga → triagem → validação final → `aguardando_documentos` (lifecycle separado) |
| Desligamentos | autorização → processamento RH → checklist → `desligamento_concluido` |
| Devolução/reenvio | mesma `approval_request` e mesma etapa; motivo < 10 caracteres recusado |
| Rejeição / cancelamento | encerra fluxo (`rejected`, `ended_at`); cancelar de novo → 409 |
| Isolamento módulo+referência | contexto de outro módulo retorna vazio; nenhuma referência compartilhada |
| Action Context real | `requester_name`, `current_approver_name`, `step_code`, `can_edit`, `allowed_actions` vindos do banco |
| Fila V2 | `get_my_approval_queue()` = regra canônica; usuário sem relação → fila 0 |
| Notificações | responsável da etapa e próximo responsável notificados, com metadata de navegação |
| Realtime | as 8 tabelas essenciais estão em `supabase_realtime` |
| SLA | inicia na ativação da etapa; vencimento escala para o substituto, não aprova sozinho; sweep idempotente |
| Concorrência | 2 aprovações simultâneas → 1 vence; 2 envios simultâneos → 1 `approval_request` |
| Segurança negativa | U não lê compras/requests/etapas/notificações/documentos; update direto de status e de `approval_requests` negado; Diretoria não vira Master; anon sem leitura |
| Configuração/snapshot | assignment do Master persiste; solicitação em andamento mantém snapshot; nova solicitação usa a nova configuração; colaborador recebe `FORBIDDEN_MASTER_ONLY` |
| Frontend | TypeScript OK, Vitest 164/164, build OK, `git diff --check` OK |

## B. FAIL (defeitos reais)

### D-01 — Financeiro/Compras são bloqueados nas operações de Compras (P1)
- Módulo: Compras.
- Onde: função `_engine_can_view` (migrations do motor) vs. `_execute_entity_action_checkpoint6_previous`.
- Causa: o executor autoriza os papéis `financeiro`, `compras`, `administrativo` e
  `diretoria` para `gerar_oc`, `pagar`, `informar_entrega`, `concluir`, mas a checagem de
  visibilidade que roda antes (`_engine_can_view`) só reconhece solicitante, Master,
  Diretoria, Administrativo, participantes do fluxo e responsável de setor.
- Impacto: um usuário Financeiro recebe `404 Registro não encontrado` ao pagar. O fluxo
  só fecha se quem paga também for Administrativo/Diretoria/Master.
- Correção proposta: incluir em `_engine_can_view`, para o módulo `compras`, os papéis
  `financeiro` e `compras` (mesma lista já usada pela RLS `purchases_select_privileged`).
- Teste necessário: persona F executa `pagar` → 200 e status `aguardando_entrega`.

### D-02 — Solicitante não é notificado a cada avanço de etapa (P2)
- Módulo: motor (`_engine_process_v2`).
- Causa: há notificação ao solicitante apenas em devolução, rejeição e conclusão do fluxo.
- Impacto: quem abriu a solicitação não recebe aviso quando a etapa 1 aprova e a etapa 2
  começa; o acompanhamento depende de abrir a tela.
- Correção proposta: emitir notificação `approval_step_advanced` ao solicitante no bloco
  de aprovação, reusando a metadata já montada.
- Teste necessário: após aprovação da etapa 1, A possui notificação com `entity_id`.

### D-03 — `approval_history` não registra as ações do Motor V2 (P2)
- Causa: o V2 grava em `audit_logs` (inclusive `master_override: true` com ator e motivo),
  mas não popula `approval_history`; a etapa mantém `approver_user_id` do responsável
  configurado mesmo quando quem agiu foi o Master.
- Impacto: a trilha por solicitação depende de `audit_logs`; telas que lerem
  `approval_history` mostrarão histórico vazio.
- Correção proposta: inserir a linha correspondente em `approval_history` dentro do V2.
- Teste necessário: aprovação/devolução/rejeição geram linha com `action_by` real.

### D-04 — `approval_requests` órfãs após exclusão da entidade (P3)
- Causa: `reference_id` não tem FK/limpeza; ao remover uma solicitação, o fluxo continua
  ativo e bloqueia um novo envio com o mesmo id ("Já existe um fluxo de aprovação ativo").
- Impacto: apenas ambientes de teste e exclusões administrativas.
- Correção proposta: encerrar os fluxos ativos no mesmo caminho que exclui/arquiva a entidade.

## C. BLOCKED / divergências de suíte

- `14_release_gate_security` #4 espera que `authenticated` execute `admin_purge_test_data`;
  o endurecimento aplicado anteriormente deixou a função exclusiva de `service_role`.
  O teste está desatualizado em relação ao contrato atual — decidir qual vale e alinhar.
- `20_final_mvp_authority_convergence` #14 conta funções `public` executáveis por `anon`:
  localmente o pgTAP é instalado em `public` e soma ~1000 funções. Excluindo objetos de
  extensão o valor é **0**, igual à produção (consulta de leitura: 0 de 83).
- Realtime com dois navegadores simultâneos: exige servidor Realtime/PostgREST — validado
  só no nível de publicação do Postgres.
- Upload/download real no Storage: sem serviço de Storage local; validadas as policies.

## D. Classificação

- **P0: 0**
- **P1: 1** (D-01)
- **P2: 2** (D-02, D-03)
- **P3: 1** (D-04) + erro de lint em `src/integrations/supabase/previewAuthStorage.ts`
  (arquivo gerado pela plataforma, regenerado a cada mensagem)

## E. Resultado

- CHECKPOINT 1 TECHNICAL: **GO** (tipos, testes, build e diff limpos)
- CHECKPOINT 1 HOMOLOGATION: **NO-GO** enquanto D-01 não for corrigido — Compras não fecha
  com usuário Financeiro.
- CHECKPOINT 2 READINESS: liberado após D-01 (e, preferencialmente, D-02/D-03).

Nenhuma correção de produto foi aplicada nesta rodada, conforme a instrução de apenas
listar os defeitos encontrados.

## Como reproduzir

```bash
bash scripts/homologation/sql/reset_local_db.sh        # cria o banco LOCAL e aplica as 149 migrations
psql -h /tmp/pg -p 55432 -U postgres -d homolog \
  -f scripts/homologation/sql/01_fixtures.sql \
  -f scripts/homologation/sql/02_flows.sql \
  -f scripts/homologation/sql/03_governance.sql \
  -f scripts/homologation/sql/04_extra.sql \
  -f scripts/homologation/sql/05_config.sql
```
