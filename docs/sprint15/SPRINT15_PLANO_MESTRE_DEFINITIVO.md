# SPRINT 15: PLANO MESTRE DEFINITIVO

## VISÃO EXECUTIVA
O Sprint 15 visa a consolidação funcional total do SV ERP, implementando um motor único de aprovação, SLAs, notificações em tempo real, validações no frontend (Zod + React Hook Form), auditoria completa e segurança robusta, assegurando o perfeito funcionamento dos módulos de Abastecimento, Diárias, Reembolsos, Compras, Admissões e Desligamentos de ponta a ponta. Nenhuma funcionalidade ou módulo novo gigantesco será adicionado.

## FASES
- Fase 0: Baseline, branch, backup e diagnóstico read-only.
- Fase 1: Contrato de dados, statuses, approver_type, RBAC e schema real.
- Fase 2: Correções seguras de banco, migrations, RLS e Storage.
- Fase 3: Motor de Aprovação, retorno, concorrência, SLA, setor e substituto.
- Fase 4: Abastecimento, Diária e Reembolso.
- Fase 5: Compras.
- Fase 6: Admissões, Desligamentos, EPIs, Colaboradores, Setores e Usuários.
- Fase 7: Dashboard, filas, pendências, notificações e Realtime.
- Fase 8: Formulários, uploads e configurações.
- Fase 9: Testes, Playwright, homologação e documentação.

## BACKLOG

### ID: B1
- **Título:** purchases.deleted_at possivelmente ausente.
- **Criticidade:** BLOQUEADOR
- **Módulo:** Compras
- **Estado Atual:** A migration de purchases ignora a criação se a tabela existir, resultando na falha das policies.
- **Evidência:** migration `20260722131759` L8-25.
- **Causa Raiz:** Uso de `IF NOT EXISTS` silenciou o erro de adição de coluna no ambiente com tabela já existente.
- **Regra Esperada:** A coluna `deleted_at` deve existir para que a RLS funcione.
- **Arquivos/Tabelas:** `public.purchases`, migrations de RLS.
- **Mudança Exata:** Aplicar migration com `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS deleted_at timestamptz`.
- **Dependências:** Fase 0 e 1 (preflight DB).
- **Risco:** Falha silenciosa em permissões.
- **Rollback:** Reversão da migration via `DROP COLUMN IF EXISTS deleted_at` na migration compensatória (se necessário e sem dados sensíveis) ou `git revert`.
- **Testes:** Validação de read-only queries.
- **Critério de Aceite:** A coluna deve existir no banco sem destruir dados.
- **Evidência Exigida:** `\d purchases` retornando `deleted_at`.

### ID: B2
- **Título:** Compras trava após aprovado.
- **Criticidade:** BLOQUEADOR
- **Módulo:** Compras
- **Estado Atual:** Não é possível avançar a compra para OC ou pagamento pois a RPC atual é hardcoded para fuel_requests.
- **Evidência:** `FleetDetailContext.tsx` L238 chama `register_oc_and_advance` (exclusivo para fleet).
- **Causa Raiz:** Reaproveitamento incorreto de fluxo restrito.
- **Regra Esperada:** Compras deve ter sua própria máquina de estados operacional após aprovação (gerar OC, pagar, receber).
- **Arquivos/RPCs:** Migration nova, RPCs `advance_purchase_to_oc`, `confirm_purchase_payment`.
- **Mudança Exata:** Criar RPCs dedicadas a purchases e atualizar `get_domain_status`.
- **Dependências:** Fase 1 e 2.
- **Risco:** Compras ficarem bloqueadas eternamente.
- **Rollback:** DROP das funções novas e restauração do component.
- **Testes:** Aprovar uma compra e acionar gerar OC via UI (Playwright).
- **Critério de Aceite:** Fluxo de compras avançando até a conclusão.
- **Evidência Exigida:** Teste E2E passando com alteração de status em `purchases`.

*(Nota: Os itens B3 a B13 seguem este mesmo formato de execução contida nos módulos subsequentes, detalhados nos artefatos específicos do plano e executados de acordo com a ordem mandatória.)*

## DEPENDÊNCIAS E ORDEM DE EXECUÇÃO
1. **Fase 0 e Fase 1** precisam rodar simultaneamente antes de qualquer escrita no banco para evitar a "normalização presunçosa". Preflight obriga queries estritas de read-only.
2. A **Fase 2** (Banco) desbloqueia a reescrita do RBAC Canônico no Frontend e o Motor de Aprovação.
3. As **Fases 4 e 5** dependem inteiramente das RPCs da Fase 3.
4. A **Fase 7** necessita que todos os status canônicos das Fases 4, 5 e 6 estejam corretos.
5. As **Fases 8 e 9** fecham a tampa da estabilidade.

## RISCOS E GATES
- **Risco Primário:** Aplicação de migrations não idempotentes.
- **Gate de Qualidade:** Toda migration será precedida de queries que atestam a ausência de conflitos (`SELECT DISTINCT status`).
- **Gate de Aceite:** 100% dos fluxos finalizam (rascunho até finalização) via Testes.
