# Sprint 15.2B: Matriz de Evidência - Start Approval Flow

| Módulo | entity_id | approval_request_id | flow_id | flow_version | step_count | first_step_order | first_assigned_user_id | entity_status_before | entity_status_after | history_count | audit_count | notification_count |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| compras | e0000000-0000-0000-0000-000000000001 | ec7d998a-dc02-4704-bfd9-6e5c39d69dea | e00f0000-0000-0000-0000-000000000001 | v1 | 1 | 1 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 2 | 1 | 1 |
| abastecimento | e00f0000-0000-0000-0000-000000000001 | 078a40f3-a6cf-4a9f-97d8-e9f9299fe21f | e0000000-0000-0000-0000-000000000002 | v1 | 1 | 1 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 1 | 1 | NÃO COMPROVADO |
| diaria | e00d0000-0000-0000-0000-000000000002 | b0ea964d-bb49-4d5b-9054-e4a96b9971d2 | e0f30000-0000-0000-0000-000000000003 | v1 | 1 | 2 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 1 | 1 | NÃO COMPROVADO |
| reembolso | e0040000-0000-0000-0000-000000000001 | d9c43c90-2514-454f-b342-a686eba45a47 | e0f40000-0000-0000-0000-000000000004 | v1 | 1 | 1 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 1 | 1 | NÃO COMPROVADO |
| admissoes | e00a0000-0000-0000-0000-000000000001 | 119598c0-bb22-430e-99f3-7af517cdd1ed | e0f50000-0000-0000-0000-000000000005 | v1 | 1 | 1 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 3 | 1 | NÃO COMPROVADO |
| desligamentos | e0060000-0000-0000-0000-000000000001 | e3d3e28c-5934-4081-af03-41b59122b954 | e0f60000-0000-0000-0000-000000000006 | v1 | 1 | 1 | 10000000-0000-0000-0000-000000000002 | rascunho | em_aprovacao | 1 | 1 | NÃO COMPROVADO |

*Nota sobre notification_count*: O envio de notificações (trigger na tabela approval_requests) só pôde ser completamente validado (contagem = 1) no teste 8 para `compras`. Nos demais, os testes bypassam partes da configuração/sessão, e o `NÃO COMPROVADO` reflete estritamente os dados registrados no final da transação do teste.

## Testes Automatizados (pgTAP)
Todos os testes foram aprovados:
- **04_start_approval_flow.test.sql**: Validou o fluxo de todos os 6 módulos, injetando o contexto do Action Context via pgTAP.
- **Correções Aplicadas**: Preservação da imutabilidade da migration `15_2b`, movendo a adição do valor `em_aprovacao` ao enum `admission_status` para a migration complementar `20260724200180_sprint15_2bv_admission_status_compat.sql`.
- Testado sucesso, idempotência (não recria flow_id se já existir), snapshots salvos, permissões (somente requester e master podem iniciar), e rollback atômico.
