# SPRINT 15 — CONTRATO FUNCIONAL DO WORKFLOW MVP

> **Gerado em:** 2026-08-03
> **Branch:** `sprint-15-finalizacao-funcional-v2`
> **Hash inicial:** `0629dbc50a5f33927c08a4532f1631c808b367de`
> **Migration âncora:** `20260725100000_sprint15_1_canonical_flows.sql`
> **Autoridade:** Este documento é a única fonte de verdade para implementação a partir desta data.
> **Status:** CONGELADO — não alterar sem novo Sprint de contrato.

---

## 1. DECLARAÇÃO DE AUTORIDADE

A hierarquia de autoridade aplicada nesta auditoria foi:

1. Decisões explicitamente definidas neste contrato (este documento)
2. `SPRINT15_FONTE_UNICA_VERDADE.md` — intenção empresarial
3. Enums e constraints atuais nas migrations — compatibilidade técnica
4. Configuração canônica da migration `20260725100000` — estrutura de fluxo
5. Telas atuais — evidência de legado apenas

`SPRINT15_MAQUINAS_DE_ESTADO.md` foi classificado item por item e está marcado como DOCUMENTO HISTÓRICO.
Não utilizar como fonte de implementação.

---

## 2. REGISTRO DO AMBIENTE

| Item | Valor |
|------|-------|
| Branch | `sprint-15-finalizacao-funcional-v2` |
| Hash HEAD | `0629dbc50a5f33927c08a4532f1631c808b367de` |
| HEAD == Remoto | Sim |
| Working tree | Limpa |
| Migration mais recente | `20260725100000_sprint15_1_canonical_flows.sql` |

---

## 3. CLASSIFICAÇÃO DO DOCUMENTO SPRINT15_MAQUINAS_DE_ESTADO.md

Cada trecho classificado conforme regra de autoridade:

| Trecho | Classificação | Motivo |
|--------|---------------|--------|
| Abastecimento: estados `enviado`, `devolvido` | legado | Não coincidem com enums ativos nem com fluxo canônico |
| Abastecimento: `aguardando_financeiro` | divergente | Não existe no enum; migration 018 usa `aguardando_execucao` |
| Abastecimento: `aguardando_revisao_docs` | divergente | Enum tem `em_revisao_admin`; SSOT usa `revisao_administrativa` |
| Diária: `agendada` | divergente | SSOT usa `programada`; migration 018 define `programada` |
| Diária: `aguardando_confirmacao` | divergente | SSOT usa `em_verificacao`; enum tem `em_revisao` |
| Diária: `concluida` (com acento) | legado | Enum usa `concluido` (sem acento) |
| Reembolso: `revisao_financeira` | decisao_pendente | Ambiguidade entre status da entidade e step_code (ver BLOQUEIO_DE_DECISAO #1) |
| Reembolso: `aguardando_recebimento` | divergente | Enum não tem este valor; SSOT define `pago` |
| Reembolso: `divergencia` | legado | Não está no enum `fuel_status` atual |
| Compras: estados canônicos | compatível | Alinhados com migration 018 e SSOT |
| Admissão: `solicitacao`, `aprovada`, `triagem`, `ativo` | divergente | Enum `admission_status` usa vocabulário diferente |
| Desligamento: `desativacao_acessos`, `revisao_vinculos`, `devolucao_epis` | legado | Não existem no enum `termination_status` |

---

## 4. MATRIZ DOS SEIS MÓDULOS

| Módulo | Tabela | Discriminador | Fluxo ID | Módulo ID |
|--------|--------|---------------|----------|-----------|
| compras | `purchases` | Nenhum (tabela exclusiva) | `a0000001-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000001` |
| abastecimento | `fuel_requests` | `type = 'abastecimento'` | `a0000002-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000002` |
| diaria | `fuel_requests` | `type = 'diaria'` | `a0000003-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000003` |
| reembolso | `fuel_requests` | `type = 'reembolso'` | `a0000004-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000004` |
| admissoes | `admission_requests` | Nenhum (tabela exclusiva) | `a0000005-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000005` |
| desligamentos | `termination_requests` | Nenhum (tabela exclusiva) | `a0000006-0001-0000-0000-000000000001` | `00000000-0001-0000-0000-000000000006` |

---

## 5. CLASSIFICAÇÃO DAS 12 ETAPAS

| # | module_code | step_code | step_order | step_kind | step_name | Ator | SLA (h) |
|---|-------------|-----------|------------|-----------|-----------|------|---------|
| 1 | compras | aprovacao_gestor | 1 | approval | Aprovação do Gestor | gestor_imediato | 48 |
| 2 | abastecimento | aprovacao_supervisor | 1 | approval | Aprovação da Solicitação | gestor_imediato | 24 |
| 3 | abastecimento | revisao_adm | 2 | review | Revisão Administrativa | administrativo | 48 |
| 4 | diaria | aprovacao_gestor | 1 | approval | Aprovação da Diária | gestor_imediato | 24 |
| 5 | diaria | verificacao_horas | 2 | verification | Verificação de Horas | supervisor | 24 |
| 6 | diaria | confirmacao_pagamento | 3 | payment | Pagamento Financeiro | financeiro | 48 |
| 7 | reembolso | aprovacao_gestor | 1 | approval | Aprovação de Reembolso | gestor_imediato | 24 |
| 8 | reembolso | revisao_financeira | 2 | review | Revisão Financeira | financeiro | 48 |
| 9 | admissoes | aprovacao_vaga | 1 | approval | Aprovação da Vaga | diretoria | 48 |
| 10 | admissoes | triagem | 2 | hr_processing | Triagem de Candidato | rh | 72 |
| 11 | desligamentos | aprovacao_desligamento | 1 | approval | Aprovação de Desligamento | diretoria | 48 |
| 12 | desligamentos | processamento_rh | 2 | hr_processing | Processamento RH | rh | 72 |

### Regras de step_kind (OBRIGATÓRIAS)

- **approval**: aceita `aprovar`, `devolver`, `rejeitar`
- **review**: aceita `concluir_revisao`, `devolver`. NÃO aceita `aprovar`
- **verification**: aceita `confirmar_horas`. NÃO aceita `aprovar`
- **payment**: aceita `pagar`. NÃO aceita `aprovar`
- **hr_processing**: aceita `concluir_triagem`, `concluir_processamento_rh`. NÃO aceita `aprovar`

---

## 6. SEMÂNTICA COMPLETA DAS 12 ETAPAS

### 6.1 COMPRAS — aprovacao_gestor

```
module_code:              compras
step_code:                aprovacao_gestor
step_order:               1
step_kind:                approval
step_name:                Aprovação do Gestor
purpose:                  Validar a necessidade e mérito da compra
responsible_rule:         gestor_imediato
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: aguardando_oc
return_target:            solicitante
return_entity_status:     retornado
rejection_entity_status:  reprovado
closes_workflow:          true (única etapa)
next_step_code:           null
sla_hours:                48
```

### 6.2 ABASTECIMENTO — aprovacao_supervisor

```
module_code:              abastecimento
step_code:                aprovacao_supervisor
step_order:               1
step_kind:                approval
step_name:                Aprovação da Solicitação
purpose:                  Autorizar execução do abastecimento
responsible_rule:         gestor_imediato
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: aprovado
return_target:            solicitante
return_entity_status:     retornado
rejection_entity_status:  reprovado
closes_workflow:          false
next_step_code:           revisao_adm
sla_hours:                24
```

### 6.3 ABASTECIMENTO — revisao_adm

```
module_code:              abastecimento
step_code:                revisao_adm
step_order:               2
step_kind:                review
step_name:                Revisão Administrativa
purpose:                  Conferência de documentos, NF e KM
responsible_rule:         cargo_perfil: administrativo
completion_action:        concluir_revisao
entity_status_on_entry:   em_revisao_admin
entity_status_on_success: concluido
return_target:            solicitante
return_entity_status:     aguardando_fotos
rejection_entity_status:  encerrado
closes_workflow:          true
next_step_code:           null
sla_hours:                48
```

### 6.4 DIÁRIA — aprovacao_gestor

```
module_code:              diaria
step_code:                aprovacao_gestor
step_order:               1
step_kind:                approval
step_name:                Aprovação da Diária
purpose:                  Autorizar agendamento da diária
responsible_rule:         gestor_imediato
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: ativa
return_target:            solicitante
return_entity_status:     retornado
rejection_entity_status:  reprovado
closes_workflow:          false
next_step_code:           verificacao_horas
sla_hours:                24
```

### 6.5 DIÁRIA — verificacao_horas

```
module_code:              diaria
step_code:                verificacao_horas
step_order:               2
step_kind:                verification
step_name:                Verificação de Horas
purpose:                  Confirmar execução real da diária e horas trabalhadas
responsible_rule:         cargo_perfil: supervisor
completion_action:        confirmar_horas
entity_status_on_entry:   em_revisao
entity_status_on_success: aguardando_pagamento
return_target:            null
return_entity_status:     null
rejection_entity_status:  encerrado
closes_workflow:          false
next_step_code:           confirmacao_pagamento
sla_hours:                24
```

### 6.6 DIÁRIA — confirmacao_pagamento

```
module_code:              diaria
step_code:                confirmacao_pagamento
step_order:               3
step_kind:                payment
step_name:                Pagamento Financeiro
purpose:                  Realizar pagamento da diária ao colaborador
responsible_rule:         cargo_perfil: financeiro
completion_action:        pagar
entity_status_on_entry:   aguardando_pagamento
entity_status_on_success: concluido
return_target:            null
return_entity_status:     null
rejection_entity_status:  encerrado
closes_workflow:          true
next_step_code:           null
sla_hours:                48
```

### 6.7 REEMBOLSO — aprovacao_gestor

```
module_code:              reembolso
step_code:                aprovacao_gestor
step_order:               1
step_kind:                approval
step_name:                Aprovação de Reembolso
purpose:                  Autorizar mérito e valor do reembolso
responsible_rule:         gestor_imediato
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: aguardando_pagamento
return_target:            solicitante
return_entity_status:     retornado
rejection_entity_status:  reprovado
closes_workflow:          false
next_step_code:           revisao_financeira
sla_hours:                24
```

### 6.8 REEMBOLSO — revisao_financeira

```
module_code:              reembolso
step_code:                revisao_financeira
step_order:               2
step_kind:                review
step_name:                Revisão Financeira
purpose:                  Validar NFs, documentos e realizar pagamento
responsible_rule:         cargo_perfil: financeiro
completion_action:        pagar
entity_status_on_entry:   aguardando_pagamento
entity_status_on_success: pago -> concluido
return_target:            null
return_entity_status:     null
rejection_entity_status:  encerrado
closes_workflow:          true
next_step_code:           null
sla_hours:                48
```

BLOQUEIO_DE_DECISAO #1 — ver Seção 15.

### 6.9 ADMISSÕES — aprovacao_vaga

```
module_code:              admissoes
step_code:                aprovacao_vaga
step_order:               1
step_kind:                approval
step_name:                Aprovação da Vaga
purpose:                  Autorizar abertura do processo seletivo
responsible_rule:         cargo_perfil: diretoria
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: aguardando_triagem
return_target:            solicitante (retorna para rascunho)
return_entity_status:     rascunho
rejection_entity_status:  cancelado
closes_workflow:          false
next_step_code:           triagem
sla_hours:                48
```

### 6.10 ADMISSÕES — triagem

```
module_code:              admissoes
step_code:                triagem
step_order:               2
step_kind:                hr_processing
step_name:                Triagem de Candidato
purpose:                  Seleção inicial e triagem pelo RH
responsible_rule:         cargo_perfil: rh
completion_action:        concluir_triagem
entity_status_on_entry:   em_triagem
entity_status_on_success: aguardando_documentos
return_target:            null
return_entity_status:     null
rejection_entity_status:  cancelado
closes_workflow:          false (inicia fluxo documental operacional)
next_step_code:           null (restante é operacional)
sla_hours:                72
```

### 6.11 DESLIGAMENTOS — aprovacao_desligamento

```
module_code:              desligamentos
step_code:                aprovacao_desligamento
step_order:               1
step_kind:                approval
step_name:                Aprovação de Desligamento
purpose:                  Autorizar a demissão do colaborador
responsible_rule:         cargo_perfil: diretoria
completion_action:        aprovar
entity_status_on_entry:   em_aprovacao
entity_status_on_success: aprovado
return_target:            solicitante
return_entity_status:     retornado
rejection_entity_status:  reprovado
closes_workflow:          false
next_step_code:           processamento_rh
sla_hours:                48
```

### 6.12 DESLIGAMENTOS — processamento_rh

```
module_code:              desligamentos
step_code:                processamento_rh
step_order:               2
step_kind:                hr_processing
step_name:                Processamento RH
purpose:                  Executar rotinas de desligamento (vinculos, EPIs, inativacao)
responsible_rule:         cargo_perfil: rh
completion_action:        concluir_processamento_rh
entity_status_on_entry:   aprovado
entity_status_on_success: desligamento_concluido
return_target:            null
return_entity_status:     null
rejection_entity_status:  cancelado
closes_workflow:          true
next_step_code:           null
sla_hours:                72
```

---

## 7. MATRIZ DE STATUS DO MVP

### Compras (`purchases.status` — tipo `text`, sem enum rigido)

| Status | No enum/tabela | Na SSOT | No frontend | Nas RPCs | Valido MVP | Remover | Mapear |
|--------|---------------|---------|------------|----------|------------|---------|--------|
| rascunho | SIM (default) | SIM | SIM | SIM | SIM | - | - |
| em_aprovacao | SIM | SIM | SIM | SIM | SIM | - | - |
| aguardando_oc | SIM | SIM | SIM | SIM | SIM | - | - |
| aguardando_pagamento | SIM | SIM | SIM | SIM | SIM | - | - |
| aguardando_entrega | SIM | SIM | SIM | SIM | SIM | - | - |
| entregue | SIM | SIM | SIM | SIM | SIM | - | - |
| concluido | SIM | SIM | SIM | SIM | SIM | - | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - | - |
| cancelado | SIM | SIM | SIM | SIM | SIM | - | - |
| divergencia | SSOT | SIM | Parcial | NAO | SIM (futuro) | - | Implementar RPC |

### Abastecimento (`fuel_requests.status` — enum `fuel_status`)

| Status | No enum | Na SSOT | No frontend | Nas RPCs | Valido MVP | Remover | Mapear |
|--------|---------|---------|------------|----------|------------|---------|--------|
| rascunho | SIM | SIM | SIM | SIM | SIM | - | - |
| em_aprovacao | SIM | SIM | SIM | SIM | SIM | - | - |
| aprovado | SIM | SIM | SIM | SIM | SIM | - | - |
| aguardando_fotos | SIM | SIM (como aguardando_comprovante) | SIM | SIM | SIM | - | Unificar nome na documentacao |
| em_revisao_admin | SIM | SIM (como revisao_administrativa) | SIM | SIM | SIM | - | Unificar nome na documentacao |
| concluido | SIM | SIM | SIM | SIM | SIM | - | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - | - |
| encerrado | SIM | SIM | SIM | SIM | SIM | - | - |
| enviado | SIM | NAO | Legado | Legado | NAO | Deprecar | para em_aprovacao |
| aguardando_oc | SIM | NAO (Compras) | NAO | Legado | NAO para fleet | Nao usar para fleet | Restrito a Compras |

### Diaria (`fuel_requests.status` — enum `fuel_status`)

| Status | No enum | Na SSOT | No frontend | Nas RPCs | Valido MVP | Mapear |
|--------|---------|---------|------------|----------|------------|--------|
| rascunho | SIM | SIM | SIM | SIM | SIM | - |
| em_aprovacao | SIM | SIM | SIM | SIM | SIM | - |
| ativa | SIM | SIM (como programada) | SIM | SIM | SIM | SSOT usa programada, enum tem ativa — usar ativa |
| em_revisao | SIM | SIM (como em_verificacao) | SIM | Parcial | SIM | SSOT usa em_verificacao, enum tem em_revisao — usar em_revisao |
| aguardando_pagamento | SIM | SIM | SIM | SIM | SIM | - |
| concluido | SIM | SIM | SIM | SIM | SIM | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - |
| encerrado | SIM | SIM | SIM | SIM | SIM | - |

BLOQUEIO_DE_DECISAO #2 — ver Secao 15.

### Reembolso (`fuel_requests.status` — enum `fuel_status`)

| Status | No enum | Na SSOT | No frontend | Nas RPCs | Valido MVP | Mapear |
|--------|---------|---------|------------|----------|------------|--------|
| rascunho | SIM | SIM | SIM | SIM | SIM | - |
| em_aprovacao | SIM | SIM | SIM | SIM | SIM | - |
| aguardando_pagamento | SIM | SIM | SIM | SIM | SIM | - |
| pago | SIM | SIM | SIM | SIM | SIM | - |
| concluido | SIM | SIM | SIM | SIM | SIM | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - |
| encerrado | SIM | SIM | SIM | SIM | SIM | - |

### Admissoes (`admission_requests.status` — enum `admission_status`)

| Status no enum | No enum | Na SSOT | No frontend | Nas RPCs | Valido MVP | Mapear |
|----------------|---------|---------|------------|----------|------------|--------|
| rascunho | SIM | SIM | SIM | SIM | SIM | - |
| em_aprovacao | SIM (adicionado em 20260724200180) | SIM | Parcial | SIM | SIM | - |
| aguardando_triagem | SIM | SIM | SIM | SIM | SIM | - |
| em_triagem | SIM | SIM | SIM | SIM | SIM | - |
| aguardando_documentos | SIM | SIM | SIM | SIM | SIM | - |
| documentos_em_analise | SIM | SIM | SIM | SIM | SIM | - |
| aguardando_exame | SIM | SIM | SIM | SIM | SIM | - |
| exame_realizado | SIM | SIM | SIM | SIM | SIM | - |
| aguardando_registro | SIM | SIM | SIM | SIM | SIM | - |
| registros_concluidos | SIM | SIM | SIM | SIM | SIM | - |
| concluido | SIM | SIM | SIM | SIM | SIM | - |
| cancelado | SIM | SIM | SIM | SIM | SIM | - |
| arquivado | SIM | SIM | SIM | SIM | SIM (admin) | - |

Nota: SSOT descreve estados antigos (abertura, dados_candidato) que nao correspondem ao enum real.
Os estados do enum sao os validos para o MVP.

### Desligamentos (`termination_requests.status` — enum `termination_status`)

| Status | No enum | Na SSOT | No frontend | Nas RPCs | Valido MVP | Mapear |
|--------|---------|---------|------------|----------|------------|--------|
| rascunho | SIM | SIM | SIM | SIM | SIM | - |
| em_aprovacao | SIM | SIM | SIM | SIM | SIM | - |
| aprovado | SIM | SIM | SIM | SIM | SIM | - |
| desligamento_concluido | SIM | SIM | SIM | SIM | SIM | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - |
| cancelado | SIM | SIM | SIM | SIM | SIM | - |

Nota: MAQUINAS_DE_ESTADO descreve sub-estados operacionais (desativacao_acessos, revisao_vinculos,
devolucao_epis) que NAO existem no enum. O processamento_rh orquestra tudo internamente.

---

## 8. VOCABULARIO UNICO DE ACOES (CONTRATO PUBLICO)

Estas sao as unicas acoes que o frontend final pode enviar para `execute_entity_action`:

| Acao | step_kind permitido | Ator | Payload obrigatorio | Status anterior -> posterior | Avanca etapa | Encerra workflow | Exige motivo |
|------|-------------------|------|--------------------|-----------------------------|--------------|-----------------|--------------|
| enviar | N/A (pre-fluxo) | solicitante | nenhum | rascunho/retornado -> em_aprovacao | - | Nao | Nao |
| aprovar | approval | aprovador_da_etapa | nenhum | em_aprovacao -> [por modulo] | Sim | Se ultima etapa | Nao |
| devolver | approval | aprovador_da_etapa | notes (texto livre) | em_aprovacao -> retornado | Nao | Sim (encerra ciclo) | SIM |
| rejeitar | approval | aprovador_da_etapa | notes (texto livre) | em_aprovacao -> reprovado | Nao | Sim | SIM |
| cancelar | N/A | solicitante/master | notes (opcional) | qualquer -> cancelado | Nao | Sim | Nao |
| concluir_revisao | review | revisor_da_etapa | nenhum | em_revisao_admin -> concluido | Sim | Se ultima etapa | Nao |
| confirmar_horas | verification | supervisor | nenhum | em_revisao -> aguardando_pagamento | Sim | Nao | Nao |
| pagar | payment / review | financeiro | nenhum | aguardando_pagamento -> pago/concluido | Sim | Se ultima etapa | Nao |
| concluir_triagem | hr_processing | rh | nenhum | em_triagem -> aguardando_documentos | Sim | Nao | Nao |
| concluir_processamento_rh | hr_processing | rh | nenhum | aprovado -> desligamento_concluido | Sim | Sim | Nao |
| gerar_oc | N/A (operacional Compras) | compras | ocNumber, supplier, approvedValue | aguardando_oc -> aguardando_pagamento | Sim | Nao | Nao |
| informar_entrega | N/A (operacional Compras) | solicitante/compras | deliveryAddress, deliveryDate | aguardando_entrega -> entregue | Sim | Nao | Nao |
| concluir | N/A (operacional Compras) | solicitante/compras | nenhum | entregue -> concluido | Sim | Sim | Nao |
| relatar_divergencia | N/A (operacional Compras) | solicitante/compras | notes | entregue -> divergencia | Nao | Nao | SIM |

### Acoes internas temporarias — NAO usar no frontend final

- `approve` -> interno em process_approval_action; mapear para `aprovar`
- `reject` -> interno em process_approval_action; mapear para `rejeitar`
- `return` -> interno em process_approval_action; mapear para `devolver`

---

## 9. CONTRATO DAS TABELAS DE INSTANCIA

### 9.1 Tabela `approval_requests`

| Campo do Contrato | Nome Atual na Tabela | Estado |
|-------------------|---------------------|--------|
| module_id | module_id | existente |
| reference_id | reference_id | existente |
| requester_user_id | requester_user_id | existente |
| flow_id | flow_id | existente |
| flow_version_snapshot | AUSENTE | AUSENTE — precisa de migration futura |
| current_step_order | current_step_order | existente |
| current_approver_user_id | current_approver_user_id | existente |
| status | status | existente |
| started_at | AUSENTE (usa created_at) | AUSENTE — created_at e equivalente funcional |
| ended_at | ended_at | existente |

Nota: `started_at` pode ser mapeado de `created_at`.
`flow_version_snapshot` requer nova coluna. Migration futura com timestamp > 20260725100000.

### 9.2 Tabela `approval_request_steps`

| Campo do Contrato | Nome Atual na Tabela | Estado |
|-------------------|---------------------|--------|
| source_flow_step_id | flow_step_id | existente (nome divergente) |
| step_code_snapshot | AUSENTE | AUSENTE — precisa de migration |
| step_name_snapshot | AUSENTE | AUSENTE — precisa de migration |
| purpose_snapshot | AUSENTE | AUSENTE — precisa de migration |
| step_kind_snapshot | AUSENTE | AUSENTE — precisa de migration |
| completion_action_snapshot | AUSENTE | AUSENTE — precisa de migration |
| step_order | step_order | existente |
| assigned_user_id | approver_user_id | existente (nome divergente) |
| primary_user_id | approver_user_id | existente (mesclado com assigned) |
| substitute_user_id | AUSENTE | AUSENTE — precisa de migration |
| responsible_rule_snapshot | approver_rule | existente (nome divergente) |
| sla_hours_snapshot | AUSENTE | AUSENTE — precisa de migration |
| sla_deadline | AUSENTE | AUSENTE — precisa de migration |
| status | status | existente |
| action_at | action_at | existente |
| comments | comments | existente |

Campos ausentes que precisam de migration futura:
- approval_requests: flow_version_snapshot
- approval_request_steps: step_code_snapshot, step_name_snapshot, purpose_snapshot,
  step_kind_snapshot, completion_action_snapshot, substitute_user_id, sla_hours_snapshot, sla_deadline

---

## 10. CONTRATO DAS RPCs PUBLICAS DEFINITIVAS

### RPC Principal — Consulta de Contexto

```
get_entity_action_context(
  module_key text,
  entity_id  uuid
) RETURNS public.entity_action_context
```

- Seguranca: SECURITY DEFINER
- Acesso: authenticated (anon revogado)
- Retorno: entity_action_context (composite type)
- Responsabilidade: Estado atual + ator correto + acoes permitidas + razoes de bloqueio
- Status: IMPLEMENTADA em migration 20260724200160

### RPC Principal — Execucao de Acao

```
execute_entity_action(
  module_key text,
  entity_id  uuid,
  action     text,
  payload    jsonb DEFAULT '{}'
) RETURNS jsonb
```

- Seguranca: SECURITY INVOKER
- Acesso: authenticated
- Responsabilidade: Execucao atomica de qualquer acao do contrato
- Vocabulario aceito: apenas o vocabulario portugues da Secao 8
- Status: IMPLEMENTADA em migration 20260724200300

---

## 11. FUNCOES QUE DEVEM TORNAR-SE INTERNAS OU SER REMOVIDAS

As seguintes funcoes devem ser removidas da API publica em sprints posteriores (nao alterar agora):

| Funcao | Razao |
|--------|-------|
| process_approval_action(uuid, text, text) | Usa approve/reject/return em ingles; deve ser internal |
| _update_entity_status(text, uuid, text) | Helper interno; nunca deve ser chamado pelo frontend |
| execute_entity_action(uuid, text, text, jsonb) — overload antigo | Assinatura sem module_key; substituida pela versao de 4 params |
| start_approval_flow(text, uuid, uuid) — com requester arbitrario | Permite impersonation; restringir a admin/master |
| admission_set_status | Bypass do motor de aprovacao para lifecycle de admissao |
| termination_set_status | Bypass do motor de aprovacao para lifecycle de desligamento |

Nota critica: Os hooks useAdmissionSetStatus e useTerminationSetStatus ainda chamam
admission_set_status e termination_set_status combinados com start_approval_flow em sequencia
nao atomica. Isso e legado que deve ser migrado para execute_entity_action em Sprint 15.2F1.

---

## 12. CONTRATO DE PROPAGACAO ATOMICA

Toda acao futura executada via execute_entity_action deve produzir atomicamente:

1. Atualizacao da entidade principal (purchases, fuel_requests, etc.)
2. Atualizacao de approval_requests (status, current_step_order, current_approver_user_id, ended_at)
3. Atualizacao de approval_request_steps (status, action_at, comments)
4. Exatamente UM registro em status_history
5. Exatamente UM registro em audit_logs
6. Notificacoes para os atores afetados
7. Dados suficientes para Minha Fila (referencia ao approval_request_id)
8. Dados suficientes para Pendencias (step pendente com approver_user_id)
9. Dados suficientes para Dashboard (entity_type + novo status)
10. Metadados de navegacao (link direto a entidade na notificacao)

---

## 13. CONTRATO MINIMO DE NOTIFICACAO

Cada notificacao gerada deve conter no campo `metadata` (jsonb):

| Campo | Tipo | Obrigatorio | Exemplo |
|-------|------|-------------|---------|
| type | text | SIM | approval_assigned |
| module_key | text | SIM | compras |
| entity_type | text | SIM | purchases |
| entity_id | uuid | SIM | uuid-da-entidade |
| approval_request_id | uuid | SIM | uuid-do-request |
| step_code | text | SIM | aprovacao_gestor |
| status | text | SIM | em_aprovacao |
| action | text | SIM | enviar |
| link | text | SIM | /compras/uuid |

Estado atual: A migration 20260724200170 gera notificacoes com apenas type e link no metadata.
Os demais campos estao AUSENTES da implementacao atual. Requerem implementacao em sprint posterior.

---

## 14. DIVERGENCIAS ELIMINADAS NESTE DOCUMENTO

1. Vocabulario de acoes: approve/reject/return (ingles) -> aprovar/rejeitar/devolver (portugues).
   O portugues e o padrao. O ingles existe apenas internamente no process_approval_action.

2. Naming das etapas de status: aguardando_comprovante (SSOT) = aguardando_fotos (enum) — usar aguardando_fotos.
   revisao_administrativa (SSOT) = em_revisao_admin (enum) — usar em_revisao_admin.

3. Status de admissao: SSOT descreve estados antigos (abertura, dados_candidato). O enum atual e valido.

4. Estados de desligamento: MAQUINAS_DE_ESTADO descreve desativacao_acessos, revisao_vinculos, devolucao_epis —
   nao existem no enum. O fluxo correto usa apenas aprovado -> desligamento_concluido com operacoes
   internas no processamento_rh.

5. SSOT vs enum para Diaria: SSOT usa programada/em_verificacao, enum tem ativa/em_revisao.
   Migration 018 usa programada (inexistente no enum). Registrado como BLOQUEIO_DE_DECISAO #2.

6. Chamada duplicada de start_approval_flow: execute_entity_action (migration 019) chama
   _update_entity_status antes de start_approval_flow, que tambem faz UPDATE interno.
   Dupla escrita idempotente. Registrado para correcao em F1 como BLOQUEIO_DE_DECISAO #3.

---

## 15. BLOQUEIOS DE DECISAO

### BLOQUEIO_DE_DECISAO #1 — Reembolso: status de entrada da revisao financeira

Problema: aguardando_pagamento e usado como status ao sair da etapa 1 (aprovacao_gestor)
E como status de entrada da etapa 2 (revisao_financeira). O financeiro nao consegue distinguir
na fila se a entidade esta "aprovada mas nao paga" ou "em revisao financeira ativa".

Opcoes:
- A) Aceitar ambiguidade e usar apenas aguardando_pagamento para os dois momentos
- B) Introduzir status intermediario em_revisao_financeira (requer migration no enum fuel_status)

Impacto: Fila do Financeiro, Dashboard, notificacoes.
NAO iniciar F1 sem resolucao desta decisao para o modulo Reembolso.

---

### BLOQUEIO_DE_DECISAO #2 — Diaria: ativa vs programada / em_revisao vs em_verificacao

Problema: SSOT usa programada e em_verificacao. O enum fuel_status tem ativa e em_revisao.
A migration 018 usa programada como cast ::public.fuel_status — falharia em runtime se
programada nao estiver no enum.

Opcoes:
- A) Usar ativa equivalente a programada e em_revisao equivalente a em_verificacao (sem migration)
- B) Adicionar programada e em_verificacao ao enum fuel_status (requer migration)

Impacto: Funcionamento do fluxo de Diaria em producao.
NAO iniciar F1 sem resolucao desta decisao para o modulo Diaria.

---

### BLOQUEIO_DE_DECISAO #3 — Execute entity action: dupla atualizacao em enviar

Problema: A migration 019 chama _update_entity_status(v_module, p_entity_id, 'em_aprovacao')
E DEPOIS chama start_approval_flow, que internamente tambem faz UPDATE do status.
Dupla escrita idempotente mas desnecessaria.

Opcoes:
- A) Remover o _update_entity_status redundante do execute_entity_action (requer migration)
- B) Aceitar a dupla escrita idempotente como comportamento correto ate F1

Impacto: Performance (menor) e clareza arquitetural. Nao bloqueia F1.

---

## 16. MAPEAMENTOS NECESSARIOS EM SPRINTS FUTUROS

| De | Para | Quando | Migration necessaria |
|----|------|--------|---------------------|
| useAdmissionSetStatus -> admission_set_status | execute_entity_action | Sprint 15.2F1 | Nao |
| useTerminationSetStatus -> termination_set_status | execute_entity_action | Sprint 15.2F1 | Nao |
| useApprovalAction -> process_approval_action direto | Usar apenas via execute_entity_action | Sprint 15.2F1 | Nao |
| useStartApprovalFlow direto (parametros legados) | Remover — tudo via execute_entity_action('enviar') | Sprint 15.2F1 | Nao |
| Notificacoes sem module_key, entity_id, step_code | Notificacao completa (Secao 13) | Sprint 15.2B-R2 | Sim |
| approval_request_steps sem snapshots | Com snapshots (Secao 9.2) | Sprint 15.2B-R2 | Sim |
| approval_requests sem flow_version_snapshot | Com snapshot | Sprint 15.2B-R2 | Sim |

---

## 17. ATORES POR ETAPA

| Etapa | Ator Principal | Perfil RBAC |
|-------|---------------|-------------|
| enviar | Solicitante | qualquer (dono) |
| aprovacao_gestor (todos modulos) | Gestor Imediato | supervisor/diretoria/master |
| revisao_adm (abastecimento) | Administrativo | administrativo/master |
| verificacao_horas (diaria) | Supervisor | supervisor/master |
| confirmacao_pagamento (diaria) | Financeiro | financeiro/master |
| revisao_financeira (reembolso) | Financeiro | financeiro/master |
| aprovacao_vaga (admissoes) | Diretoria | diretoria/master |
| triagem (admissoes) | RH | rh/master |
| aprovacao_desligamento | Diretoria | diretoria/master |
| processamento_rh (desligamentos) | RH | rh/master |
| gerar_oc (compras) | Compras | compras/master |
| pagar / informar_entrega (compras) | Financeiro / Compras | financeiro/compras/master |

---

## 18. RETORNOS, REJEICOES E CANCELAMENTOS

| Acao | Status entidade | Status approval_request | Reabre |
|------|----------------|------------------------|--------|
| devolver | retornado | returned (encerra ciclo) | Sim — novo ciclo via enviar |
| rejeitar | reprovado | rejected (encerra definitivamente) | Nao |
| cancelar | cancelado | cancelled (encerra definitivamente) | Nao |

Regras de cancelamento por modulo:

| Modulo | Permitido de | Proibido apos |
|--------|-------------|---------------|
| compras | rascunho, em_aprovacao, aguardando_oc | aguardando_pagamento |
| abastecimento | rascunho, em_aprovacao | aprovado |
| diaria | rascunho, em_aprovacao | ativa |
| reembolso | rascunho, em_aprovacao | aguardando_pagamento |
| admissoes | rascunho, em_aprovacao | aguardando_triagem |
| desligamentos | rascunho, em_aprovacao | aprovado |

---

## 19. INVARIANTES DO SISTEMA (NAO NEGOCIAVEIS)

1. em_aprovacao e o unico estado em que o motor pode agir via aprovar/devolver/rejeitar
2. rascunho e retornado sao os unicos estados em que o solicitante pode chamar enviar
3. Uma entidade nunca pode ter dois approval_requests com status nao terminal simultaneamente
4. Acao aprovar so pode ser executada por quem esta em approval_request_steps.approver_user_id
5. Motivo e obrigatorio para devolver e rejeitar
6. Autoaprovacao e proibida (solicitante diferente de aprovador)
7. waiting vira pending apenas quando a etapa anterior foi concluida
8. Mudanca de configuracao de fluxo nao altera instancias ja iniciadas (snapshot)

---

Documento produzido pela auditoria Sprint 15.2F0 em 2026-08-03.
Hash inicial auditado: 0629dbc50a5f33927c08a4532f1631c808b367de
Proxima alteracao somente por Sprint de contrato com novo hash de commit.
