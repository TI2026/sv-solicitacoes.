# SPRINT 15: CRITÉRIOS DE GO / NO-GO

## BLOQUEADORES ABSOLUTOS (NO-GO)
A etapa correspondente ou o deploy geral **não avança** se ocorrerem:
1. **Ausência de Conexão DB Administrativa:** Impossibilidade de rodar preflights de esquema de forma segura para criar migrations idempotentes.
2. **Duplicidades Detectadas:** Qualuer teste E2E mostrando duplo clique criando dados corrompidos ou fluxos duplicados.
3. **RLS Bypass:** Dados sigilosos do ADM vazando para colaborador, ou colaborador aprovando por terceiros mediante edição de payload.
4. **Travamento Operacional:** Módulo não chegando ao status `concluido` devido a bugs de transição (ex: Compras travado em 'aprovado' por falta de RPC dedicada).

## DEFINIÇÃO DE CONCLUÍDO (DoD)
Para que o Sprint 15 seja declarado **GO**:
- Todos os 6 módulos centrais (Abastecimento, Diária, Reembolso, Compras, Admissão, Desligamento) operam de `rascunho` a `concluido` via interface e no banco de dados.
- O Realtime funciona refletindo nos Widgets (Minha Fila, Pendências) sem refresh.
- 100% dos formulários críticos usam Zod e react-hook-form para validações corretas.
- Testes Playwright no navegador confirmam integração entre múltiplos papéis em sessões simuladas simultâneas.
- Nenhuma migration possui "remendos", normalizações cegadas de status, ou exclusão de colunas importantes (nenhum DROP COLUMN destrutivo).

## SISTEMA DE GATES
- **Gate 0:** Database Preflight Concluído.
- **Gate 1:** Correções Core + Approval Engine validadas em branch separada (unit tests).
- **Gate 2:** UI/UX Integration (Zod Forms, Loaders, Realtime).
- **Gate 3:** Testes Manuais & E2E Homologados.
- **Gate 4:** Relatório de Rollback Atestado.
- **Release (GO)**
