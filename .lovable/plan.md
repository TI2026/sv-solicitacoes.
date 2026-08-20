# Motor de Aprovação V2 — Checkpoint 1

Contrato V2 congelado como fonte de verdade. O trabalho é backend-first (migrations incrementais) + a tela Configurações de Aprovação. Nada de redesign visual, PDF, SEO ou responsividade neste checkpoint.

## Estado atual do banco (levantado agora)

- 11 flows existentes (V1 + legados duplicados), com 1–11 etapas cada — nenhum corresponde ao template V2.
- Módulo legado `admissions` ainda tem flow ativo, paralelo ao canônico `admissoes`.
- 2 approval_requests ativas com status legado `awaiting_step_1` → **bloqueiam o cutover** enquanto não forem encerradas.
- Setores sem responsável: Comercial, Compras, Diretoria, Financeiro, Frota, Obras, Portaria, RH. Sem eles, os steps em modo Setor ficam BLOCKED no health check.

## Entregas (ordem de execução)

### Onda A — Templates V2 (migrations)
- Criar 6 flows `*_V2` com `active = false`, versão `v2`, e as 17 etapas fixas exatamente como no contrato (Compras 2, Abastecimento 3, Diária 3, Reembolso 3, Admissões 3, Desligamentos 3), com `step_code`, `step_name`, `step_kind`, `completion_action`, `next_step_activation` (imediata vs operacional) e status de entidade por etapa.
- V1 preservado intacto (histórico).
- `assignment_mode` reduzido a `person` | `sector` para escritas novas; valores V1 mantidos apenas para leitura histórica.

### Onda B — Configuração e governança
- RPC `save_approval_step_assignment(...)` Master-only, transacional, revalidando pessoa/setor/substituto/SLA.
- REVOKE de INSERT/UPDATE/DELETE direto em `approval_flow_steps` para `authenticated`.
- RPC `get_approval_configuration_health()` retornando `ready | warning | blocked` por módulo/etapa com motivo textual.

### Onda C — Núcleo do motor
- `start_approval_flow`: valida toda a configuração antes de qualquer escrita; erro `WORKFLOW_NOT_READY` sem criar request/steps/notification. Snapshot completo por step (flow_version, step_code/kind/completion_action, assignment_mode, primary/substitute, resolved_approver, sla_hours).
- Regra de autoaprovação: requester = primary → substituto; requester = ambos → `WORKFLOW_NO_ELIGIBLE_APPROVER`. Sem "primeiro usuário do cargo".
- `process_approval_action`: avanço por `step_order` (nunca por `status = pending`), `waiting → pending`, `waiting_operational` com `current_approver_user_id = NULL`, devolver sem encerrar a request, reenvio reativando a mesma step com novo SLA, rejeitar/cancelar conforme contrato.
- Status de request restritos a: `draft, awaiting_step, waiting_operational, returned, rejected, cancelled, completed`.
- `execute_entity_action` como único entry point de mutação; `get_entity_action_context` devolvendo o contrato completo (44) com checagem de visibilidade (45).
- Master override auditado (`master_override = true`, aprovador original, motivo).
- Ações operacionais canônicas (46) por módulo, incluindo validação backend de documentos (48).

### Onda D — Invariantes e integridade
- UNIQUE INDEX parcial em `approval_requests (module_id, reference_id) WHERE ended_at IS NULL`.
- `FOR UPDATE` + checagem de status em toda conclusão de step → segunda ação recebe `CONFLICT`, sem duplicar history/audit/notification/pagamento.
- SLA: `sla_deadline` só ao entrar em `pending`; expiração reatribui ao substituto ou marca `overdue` e notifica Master — nunca autoaprova.
- REVOKE de `_update_entity_status`, `process_approval_action`, `start_approval_flow` para PUBLIC/anon/authenticated.
- `get_my_approval_queue` usando apenas `status = 'awaiting_step'`.

### Onda E — Cutover
- RPC `activate_approval_v2(...)`: atômica, exige 6 módulos `ready`, 17 steps válidas e nenhuma request V1 ativa; desativa V1 e ativa V2 na mesma transação.
- Auditoria do módulo legado `admissions`: preservar histórico, desativar flow.
- Escolha de um único estado canônico pós-aprovação em Admissões, após auditar os consumidores (sem manter aliases em escritas novas).

### Onda F — Tela Configurações de Aprovação
- Seis módulos com etapas fixas; sem adicionar/excluir/reordenar.
- Editor de step: Pessoa (responsável + substituto) ou Setor (setor + responsável/substituto em leitura), prazo em horas.
- Nomenclatura "Pessoa" / "Setor" (nunca "Pessoa Física").
- Health visual por módulo (Pronto / Atenção / Bloqueado) e botão "Ativar Motor V2" habilitado apenas quando tudo pronto.

### Onda G — Testes (pgTAP em supabase/tests/database)
Configuração, snapshot, devolução/reenvio, SLA→substituto, multiusuário (A/B/C/S/M), caminho completo dos 6 módulos, retry duplo sem duplicidade, rollback transacional e grants.

## Pré-condições que dependem de você

1. As 2 requests ativas em `awaiting_step_1` precisam ser encerradas (concluídas ou canceladas) antes da ativação do V2.
2. Os setores sem responsável precisam de responsável e substituto — alternativamente, essas etapas ficam em modo Pessoa.

Ambas as pendências não bloqueiam as Ondas A–D; bloqueiam apenas o cutover (Onda E).

## Observação técnica

Tudo por migrations incrementais; nenhuma migration publicada será editada. Frontend limitado à tela de Configurações de Aprovação e aos hooks compartilhados de aprovação estritamente necessários.
