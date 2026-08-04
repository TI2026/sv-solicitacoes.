# SPRINT 15 — CONTRATO FUNCIONAL DO WORKFLOW MVP

> **Gerado em:** 2026-08-03
> **Atualizado em:** 2026-08-03 (Sprint 15.2F0-D2 — fechar contrato funcional de abastecimento)
> **Branch:** `sprint-15-finalizacao-funcional-v2`
> **Hash inicial (15.2F0):** `0629dbc50a5f33927c08a4532f1631c808b367de`
> **Hash inicial (15.2F0-D1):** `5fc96a1eb9aa00396d7588241791d911769830bf`
> **Migration âncora:** `20260725100000_sprint15_1_canonical_flows.sql`
> **Autoridade:** Este documento é a única fonte de verdade para implementação a partir desta data.
> **Status:** CONGELADO — nenhum bloqueio de decisão funcional pendente.

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
| Diária: `agendada` | resolvido | Estado definitivo é `ativa` (enum fuel_status); não usar `programada` (Decisão 15.2F0-D1) |
| Diária: `aguardando_confirmacao` | resolvido | Estado definitivo é `em_revisao` (enum fuel_status); não usar `em_verificacao` (Decisão 15.2F0-D1) |
| Diária: `concluida` (com acento) | legado | Enum usa `concluido` (sem acento) |
| Reembolso: `revisao_financeira` | resolvido | step_kind = review; completion_action = concluir_revisao; entidade permanece em aguardando_pagamento após concluir_revisao; pagar é ação operacional separada (Decisão 15.2F0-D1) |
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
| 9 | reembolso | revisao_financeira | 2 | review | Revisão Financeira | financeiro | 48 |
| 10 | admissoes | aprovacao_vaga | 1 | approval | Aprovação da Vaga | diretoria | 48 |
| 11 | admissoes | triagem | 2 | hr_processing | Triagem de Candidato | rh | 72 |
| 12 | desligamentos | aprovacao_desligamento | 1 | approval | Aprovação de Desligamento | diretoria | 48 |
| 13 | desligamentos | processamento_rh | 2 | hr_processing | Processamento RH | rh | 72 |

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
next_step_activation:     enviar_comprovantes
approval_request_status_after: waiting_operational
current_approver_user_id_after: null
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
next_step_activation:     enviar_comprovantes
approval_request_status_after: waiting_operational
current_approver_user_id_after: null
sla_hours:                24
```

Nota: após aprovar na etapa 1, a verificacao_horas fica em estado waiting (não pending).
approval_request entra em waiting_operational.
A etapa 2 só ativa (pending) quando o solicitante chamar enviar_comprovantes.

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
approval_request_status_after: awaiting_step
sla_hours:                24
```

### 6.8 REEMBOLSO — revisao_financeira

```
module_code:              reembolso
step_code:                revisao_financeira
step_order:               2
step_kind:                review
step_name:                Revisão Financeira
purpose:                  Validar NFs e documentos; liberar pagamento ao solicitante
responsible_rule:         cargo_perfil: financeiro
completion_action:        concluir_revisao
entity_status_on_entry:   aguardando_pagamento
entity_status_on_success: aguardando_pagamento
return_target:            null
return_entity_status:     null
rejection_entity_status:  encerrado
closes_workflow:          true (encerra o workflow de aprovacao)
next_step_code:           null
approval_request_status_after: completed
sla_hours:                48
```

Nota (DECISAO DEFINITIVA 15.2F0-D1):
A entidade permanece em aguardando_pagamento após concluir_revisao.
Isso é intencional: concluir_revisao encerra o workflow de aprovacao,
nao o processo operacional de pagamento.
O financeiro executa pagar como acao operacional separada, nao como etapa do motor.
pagar: aguardando_pagamento -> pago.
concluir: pago -> concluido.
Nao existe status intermediario entre aguardando_pagamento e pago.
Nao criar em_revisao_financeira.

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
| ativa | SIM | SIM | SIM | SIM | SIM | DECISAO DEFINITIVA: usar ativa (nao programada) |
| em_revisao | SIM | SIM | SIM | Parcial | SIM | DECISAO DEFINITIVA: usar em_revisao (nao em_verificacao) |
| aguardando_pagamento | SIM | SIM | SIM | SIM | SIM | - |
| concluido | SIM | SIM | SIM | SIM | SIM | - |
| retornado | SIM | SIM | SIM | SIM | SIM | - |
| reprovado | SIM | SIM | SIM | SIM | SIM | - |
| encerrado | SIM | SIM | SIM | SIM | SIM | - |

Decisao 15.2F0-D1: programada e em_verificacao NAO devem ser usados.
A migration 018 que usa programada como cast deve ser corrigida em F1 para usar ativa.
Nao requer adicao de valores ao enum fuel_status.

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

Lista definitiva: 16 acoes. Nenhuma adicao sem novo Sprint de contrato.

| # | Acao | Modulo | step_kind | Ator | Payload obrigatorio | Status anterior | Status posterior | Avanca etapa | Encerra workflow | Exige motivo |
|---|------|--------|-----------|------|--------------------|-----------------|-----------------|--------------|-----------------|--------------|
| 1 | enviar | todos | N/A (pre-fluxo) | solicitante (dono) | nenhum | rascunho / retornado | em_aprovacao | - | Nao | Nao |
| 2 | aprovar | todos (step approval) | approval | aprovador_da_etapa | nenhum | em_aprovacao | [por modulo e etapa] | Sim | Se ultima etapa | Nao |
| 3 | devolver | todos (step approval) | approval | aprovador_da_etapa | notes (obrigatorio) | em_aprovacao | retornado | Nao | Sim (encerra ciclo) | SIM |
| 4 | rejeitar | todos (step approval) | approval | aprovador_da_etapa | notes (obrigatorio) | em_aprovacao | reprovado | Nao | Sim | SIM |
| 5 | cancelar | todos | N/A | solicitante / master | notes (opcional) | qualquer (exceto terminal) | cancelado | Nao | Sim | Nao |
| 6 | registrar_abastecimento | abastecimento | N/A (operacional) | solicitante / ator autorizado | valor, data_abastecimento, placa, km, motivo (opcional: notes) | aprovado | aguardando_fotos | Nao | Nao | Nao |
| 7 | enviar_comprovantes | diaria, abastecimento | N/A (operacional) | solicitante | documentos (obrigatorio) | ativa / aguardando_fotos | em_revisao / em_revisao_admin | Sim (ativa verificacao_horas / revisao_adm) | Nao | Nao |
| 9 | concluir_revisao | abastecimento, reembolso | review | revisor_da_etapa | nenhum | em_revisao_admin / aguardando_pagamento | concluido / aguardando_pagamento | Sim | Se ultima etapa | Nao |
| 9 | confirmar_horas | diaria | verification | supervisor | nenhum | em_revisao | aguardando_pagamento | Sim | Nao | Nao |
| 10 | pagar | diaria, reembolso, compras | payment / operacional | financeiro / compras | nenhum | aguardando_pagamento | pago / concluido | Sim (payment) / Nao (operacional) | Se payment e ultima etapa | Nao |
| 11 | concluir_triagem | admissoes | hr_processing | rh | nenhum | em_triagem | aguardando_documentos | Sim | Nao | Nao |
| 12 | concluir_processamento_rh | desligamentos | hr_processing | rh | nenhum | aprovado | desligamento_concluido | Sim | Sim | Nao |
| 13 | gerar_oc | compras | N/A (operacional) | compras | ocNumber, supplier, approvedValue | aguardando_oc | aguardando_pagamento | Nao | Nao | Nao |
| 14 | informar_entrega | compras | N/A (operacional) | solicitante / compras | deliveryAddress, deliveryDate | aguardando_entrega | entregue | Nao | Nao | Nao |
| 15 | concluir | compras | N/A (operacional) | solicitante / compras | nenhum | entregue | concluido | Nao | Sim (operacional) | Nao |
| 16 | relatar_divergencia | compras | N/A (operacional) | solicitante / compras | notes (obrigatorio) | entregue | divergencia | Nao | Nao | SIM |

### Detalhamento da acao enviar_comprovantes (acao 6)

```
acao:                      enviar_comprovantes
modulo:                    diaria
step_kind:                 N/A (operacional — nao e etapa do motor de aprovacao)
ator:                      solicitante (dono da solicitacao)
payload_obrigatorio:       documentos (lista de referencias de arquivos)
status_anterior:           ativa
status_posterior:          em_revisao
avanca_etapa:              Sim — muda verificacao_horas de waiting para pending
encerra_workflow:          Nao
exige_motivo:              Nao
approval_request_status:   waiting_operational -> awaiting_step
current_approver_after:    responsavel da etapa verificacao_horas
notificacao:               Sim — notifica o supervisor responsavel pela verificacao
auditoria:                 Sim
historico:                 Sim
```

### Classificacao por tipo

- **Acoes de motor de aprovacao (delegadas ao execute_entity_action via process_approval_action):**
  aprovar, devolver, rejeitar

- **Acoes de transicao pre-motor (delegadas ao start_approval_flow):**
  enviar

- **Acoes de transicao operacional (executadas diretamente pelo execute_entity_action):**
  registrar_abastecimento, enviar_comprovantes, concluir_revisao, confirmar_horas, concluir_triagem, concluir_processamento_rh,
  gerar_oc, informar_entrega, concluir, relatar_divergencia

- **Acoes operacionais financeiras (executadas diretamente, sem motor):**
  pagar, cancelar

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

## 9A. ESTADOS INTERNOS DE APPROVAL_REQUESTS (CONTRATO FUTURO)

Os seguintes estados internos da tabela `approval_requests` devem ser implementados
em Sprint 15.2B-R2 (requer migration). Nao existem fisicamente agora — documentados para
contrato de implementacao futura.

| Status interno | Descricao | current_approver_user_id | Ha etapa pending |
|----------------|-----------|--------------------------|------------------|
| `draft` | Fluxo nao iniciado (pre-enviar) | null | Nao |
| `awaiting_step` | Ha uma etapa pending com aprovador definido | uuid do aprovador | Sim |
| `waiting_operational` | Nenhuma etapa pending; aguarda acao operacional da entidade | null | Nao |
| `returned` | Solicitacao devolvida ao solicitante; ciclo encerrado | null | Nao |
| `rejected` | Workflow encerrado por rejeicao definitiva | null | Nao |
| `cancelled` | Encerrado pelo solicitante ou ator autorizado | null | Nao |
| `completed` | Todas as etapas do workflow concluidas | null | Nao |

### Regras de transicao do approval_request

```
draft           -> awaiting_step         : enviar (via start_approval_flow)
awaiting_step   -> waiting_operational   : aprovar (quando next_step_activation != null)
awaiting_step   -> awaiting_step         : aprovar (quando proxima etapa ativa imediatamente)
awaiting_step   -> returned              : devolver
awaiting_step   -> rejected              : rejeitar
waiting_operational -> awaiting_step     : enviar_comprovantes (ativa verificacao_horas)
awaiting_step   -> completed             : concluir_revisao ou pagar (ultima etapa)
awaiting_step   -> cancelled             : cancelar
waiting_operational -> cancelled         : cancelar
```

### Mapeamento para implementacao

O campo `approval_requests.status` atual usa texto livre (pending_approval, etc.).
A tabela atual nao tem os estados acima como constraint.
A migration futura deve:
1. Adicionar CHECK constraint ou enum para os 7 estados acima.
2. Migrar registros existentes para o mapeamento correto.
3. Atualizar todas as RPCs que escrevem em approval_requests.status.

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

### Contrato da acao enviar dentro de execute_entity_action (DECISAO DEFINITIVA 15.2F0-D1)

```
execute_entity_action com action = 'enviar':
  1. Consultar get_entity_action_context para validar que 'enviar' esta em allowed_actions
  2. Delegar integralmente para start_approval_flow(module_key, entity_id, uid)
  3. Retornar o resultado de start_approval_flow
  NAO executar _update_entity_status antes de chamar start_approval_flow

start_approval_flow — responsabilidades atomicas (DECISAO DEFINITIVA):
  1. Lock da entidade (FOR UPDATE)
  2. Validacao de ownership (requester_user_id == uid)
  3. Validacao do status (apenas rascunho ou retornado)
  4. Criacao do registro em approval_requests
  5. Criacao dos registros em approval_request_steps (todos com status waiting)
  6. Ativacao da primeira etapa (step_order = 1 -> status pending)
  7. Atualizacao da entidade para em_aprovacao (UNICO ponto de escrita)
  8. Insercao em status_history
  9. Insercao em audit_logs
  10. Geracao de notificacao para o aprovador da etapa 1
```

---



### Diferença entre Reprovado, Devolvido e Encerrado (Abastecimento)
- **Reprovado**: Na etapa `aprovacao_supervisor`, usar a acao `rejeitar`. O fluxo muda para `reprovado`, o `approval_request` vai para `rejected` e o workflow é encerrado definitivamente.
- **Devolvido**: Na etapa `revisao_adm`, quando ha erro documental, usar `devolver` informando o motivo. A entidade volta para `aguardando_fotos`, o `approval_request` volta para `waiting_operational`, o solicitante recebe notificacao e pode enviar os comprovantes novamente. Nao voltar para rascunho.
- **Encerrado**: A acao encerrar (cancelamento/encerramento operacional) podera ser usada somente conforme regra ja existente e documentada, sem substituir rejeicao da aprovacao. Não utilizar `rejeitar` na etapa `revisao_adm` como sinonimo de erro documental.

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

## 12. MATRIZ EXATA DE ABASTECIMENTO

**aprovacao_supervisor**:
- entry_status = em_aprovacao
- success_status = aprovado
- completion_action = aprovar
- next_step = revisao_adm
- next_step_activation = enviar_comprovantes
- approval_request_after_success = waiting_operational
- closes_workflow = false

**registrar_abastecimento**:
- entity_status_before = aprovado
- entity_status_after = aguardando_fotos
- approval_request_before = waiting_operational
- approval_request_after = waiting_operational
- activates_step = false
- Payload (campos existentes exigidos): valor, data_abastecimento, placa, km, motivo (obrigatorios), notes (opcional). Anexos serao enviados posteriormente.

**enviar_comprovantes**:
- entity_status_before = aguardando_fotos
- entity_status_after = em_revisao_admin
- approval_request_before = waiting_operational
- approval_request_after = awaiting_step
- activates_step = revisao_adm
- Payload: listar somente os anexos e campos ja existentes no codigo atual. (Para Diaria, o contrato definido em Sprint 15.2F0-D1 foi integralmente preservado).

**revisao_adm**:
- entry_status = em_revisao_admin
- success_status = concluido
- completion_action = concluir_revisao
- next_step = null
- closes_workflow = true

**devolver em revisao_adm**:
- entity_status_before = em_revisao_admin
- entity_status_after = aguardando_fotos
- approval_request_after = waiting_operational
- step_after = waiting
- current_approver_user_id = null

---

## 12A. CONTRATO DE PROPAGACAO ATOMICA

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

5. SSOT vs enum para Diaria: SSOT usa programada/em_verificacao — RESOLVIDO (15.2F0-D1).
   Decisao definitiva: usar ativa (nao programada) e em_revisao (nao em_verificacao).
   Nao requer adicao de valores ao enum. Migration 018 deve ser corrigida em F1.

6. Chamada duplicada de start_approval_flow — RESOLVIDO (15.2F0-D1).
   Decisao definitiva: start_approval_flow e o unico responsavel pela transicao para em_aprovacao.
   execute_entity_action NAO deve chamar _update_entity_status antes. Correcao e pendencia de implementacao.

7. Reembolso — completion_action da revisao_financeira — RESOLVIDO (15.2F0-D1).
   Decisao definitiva: completion_action = concluir_revisao (nao pagar).
   pagar e acao operacional separada apos o workflow de aprovacao.

---

## 15. BLOQUEIOS DE DECISAO

Nenhum bloqueio de decisao funcional pendente para o Sprint 15.2F1.

Todas as decisoes foram tomadas na Sprint 15.2F0-D1 em 2026-08-03:

| Decisao | Modulo | Resolucao | Status |
|---------|--------|-----------|--------|
| Decisao #1 | Reembolso | completion_action da revisao_financeira = concluir_revisao; entidade permanece em aguardando_pagamento; pagar e acao operacional separada; nao criar em_revisao_financeira | RESOLVIDA |
| Decisao #2 | Diaria | Estados definitivos: ativa e em_revisao; nao usar programada nem em_verificacao; migration 018 deve ser corrigida em F1 | RESOLVIDA |
| Decisao #3 | enviar | start_approval_flow e o unico responsavel pela transicao para em_aprovacao; execute_entity_action NAO deve chamar _update_entity_status antes | RESOLVIDA |

---

## 15A. PENDENCIAS DE IMPLEMENTACAO

As pendencias abaixo nao sao bloqueios de decisao. Sao implementacoes tecnicas
necessarias em Sprints futuros (15.2F1 ou 15.2B-R2).

### PI-1 — Corrigir dupla atualizacao de enviar (Sprint 15.2F1)

Descricao: A migration 019 (execute_entity_action) chama _update_entity_status antes de
start_approval_flow, que ja faz o UPDATE internamente. Remover a chamada redundante.
Impacto: Correcao de logica; sem impacto no usuario final.
Requer migration: Sim (reescrever execute_entity_action).

### PI-2 — Adicionar snapshots nas tabelas de instancia (Sprint 15.2B-R2)

Descricao: Adicionar as colunas ausentes listadas na Secao 9.2:
step_code_snapshot, step_name_snapshot, purpose_snapshot, step_kind_snapshot,
completion_action_snapshot, substitute_user_id, sla_hours_snapshot, sla_deadline,
flow_version_snapshot.
Impacto: Historico imutavel de configuracao no momento do inicio do fluxo.
Requer migration: Sim.

### PI-3 — Materializar estados internos de approval_requests (Sprint 15.2B-R2)

Descricao: Adicionar CHECK constraint ou enum para os 7 estados definidos na Secao 9A:
draft, awaiting_step, waiting_operational, returned, rejected, cancelled, completed.
Migrar registros existentes.
Requer migration: Sim.

### PI-4 — Materializar step_kind e completion_action no motor (Sprint 15.2F1)

Descricao: As RPCs de execucao devem validar step_kind e completion_action em runtime
comparando com os valores snapshot da etapa. Hoje a validacao e implicita.
Requer migration: Sim (adicionar colunas snapshot antes).

### PI-5 — Corrigir Action Context para waiting_operational (Sprint 15.2F1)

Descricao: get_entity_action_context deve retornar allowed_actions corretas quando
approval_request esta em waiting_operational (ex: enviar_comprovantes para Diaria).
Hoje o contexto nao contempla este estado.
Requer migration: Sim (reescrever get_entity_action_context).

### PI-6 — Consolidar RPC publica em execute_entity_action com 4 parametros (Sprint 15.2F1)

Descricao: Remover o overload antigo execute_entity_action(uuid, text, text, jsonb)
e restringir admission_set_status e termination_set_status a uso interno.
Requer migration: Sim (DROP FUNCTION dos overloads antigos).

### PI-8 — Materializar registrar_abastecimento e enviar_comprovantes em abastecimento

Descricao: Implementar a acao `registrar_abastecimento` (aprovado -> aguardando_fotos) e habilitar `enviar_comprovantes` para o modulo abastecimento (aguardando_fotos -> em_revisao_admin), ativando a etapa revisao_adm.
Impacto: Permite o registro dos dados operacionais e o posterior envio dos comprovantes.
Requer migration: Nao.

### PI-9 — Refatorar Abastecimento: waiting_operational apos aprovacao

Descricao: Implementar `waiting_operational` apos aprovacao, ativar `revisao_adm` somente no envio dos comprovantes, implementar devolucao para `aguardando_fotos` e alinhar notificacoes e Action Context.
Impacto: Correcao do motor para suportar fluxo com interrupcao operacional e permitir devolucao e reenvio de comprovantes.
Requer migration: Sim (atualizar get_entity_action_context e validacoes).

### PI-7 — Corrigir fila, notificacoes e Dashboard (Sprint 15.2B-R2)

Descricao: Notificacoes devem incluir todos os 9 campos do contrato da Secao 13.
Dashboard deve refletir os novos estados internos.
Fila deve filtrar por approval_request.status = awaiting_step e assigned_user_id.
Requer migration: Sim.

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
Atualizado pela Sprint 15.2F0-D1 em 2026-08-03 (resolucao de todas as decisoes pendentes).
Hash auditado 15.2F0: 0629dbc50a5f33927c08a4532f1631c808b367de
Hash auditado 15.2F0-D1: 5fc96a1eb9aa00396d7588241791d911769830bf
Proxima alteracao somente por Sprint de contrato com novo hash de commit.
Nenhum bloqueio de decisao funcional pendente.
