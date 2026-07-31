# Sprint 15.2B: Matriz de Evidência - Start Approval Flow

| Módulo | Entidade | Solicitante | Fluxo | Versão | Quantidade de steps | Primeiro responsável | Status anterior | Status posterior | Histórico | Auditoria | Notificação |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Compras | purchases | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |
| Abastecimento | uel_requests (type='abastecimento') | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |
| Diária | uel_requests (type='diaria') | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |
| Reembolso | uel_requests (type='reembolso') | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |
| Admissões | dmission_requests | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |
| Desligamentos | 	ermination_requests | uth.uid() | pproval_flows | v1 | N | Resolved via rule | ascunho | em_aprovacao | Sim | Sim | Sim |

## Testes Automatizados (pgTAP)
Todos os testes foram aprovados:
- **04_start_approval_flow.test.sql**: Validou o fluxo de todos os 6 módulos.
- **Correções Aplicadas**: Adição do valor em_aprovacao ao enum dmission_status (falha objetiva corrigida na migration 20260724200170_sprint15_2b_start_approval_flow.sql).
- Testado sucesso, idempotência (não recria flow_id se já existir), snapshots, permissões (somente requester e master) e rollback atômico.
