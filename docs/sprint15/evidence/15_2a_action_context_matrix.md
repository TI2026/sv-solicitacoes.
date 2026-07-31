# Sprint 15.2A — Matriz do Action Context

Gerado em: 2026-07-31  
Migration: `20260724200160_sprint15_2a_action_context_definitive.sql`

---

## Normalização de Módulos

| Alias(es) aceito(s)            | Chave normalizada  | Tabela                 | Discriminator         |
|--------------------------------|--------------------|------------------------|-----------------------|
| `compras`, `purchases`         | `compras`          | `purchases`            | Não aplicável         |
| `abastecimento`                | `abastecimento`    | `fuel_requests`        | `type = 'abastecimento'` |
| `diaria`                       | `diaria`           | `fuel_requests`        | `type = 'diaria'`     |
| `reembolso`                    | `reembolso`        | `fuel_requests`        | `type = 'reembolso'`  |
| `admissoes`, `admissions`      | `admissoes`        | `admission_requests`   | Não aplicável         |
| `desligamentos`, `terminations`| `desligamentos`    | `termination_requests` | Não aplicável         |
| `fleet` (sem discriminator)    | **INVÁLIDO**       | —                      | Erro de negócio       |

---

## Campo do Solicitante por Módulo

| Módulo          | Tabela                 | Campo solicitante        |
|-----------------|------------------------|--------------------------|
| compras         | `purchases`            | `requester_user_id`      |
| abastecimento   | `fuel_requests`        | `requester_user_id`      |
| diaria          | `fuel_requests`        | `requester_user_id`      |
| reembolso       | `fuel_requests`        | `requester_user_id`      |
| admissoes       | `admission_requests`   | `requester_user_id`      |
| desligamentos   | `termination_requests` | `requester_user_id`      |

---

## Campos do Contrato de Saída (`entity_action_context`)

| Campo                       | Tipo        | Preenchido quando                             |
|-----------------------------|-------------|-----------------------------------------------|
| `module_key`                | TEXT        | Sempre (normalizado ou original no ERRO)      |
| `entity_id`                 | UUID        | Sempre                                        |
| `current_status`            | TEXT        | Sempre (`'ERRO'` para erros de negócio)       |
| `flow_version`              | TEXT        | Quando há fluxo ativo                         |
| `current_step_order`        | INT         | Quando há etapa pendente no fluxo             |
| `current_step_name`         | TEXT        | Quando há etapa pendente no fluxo             |
| `current_approver_user_id`  | UUID        | Quando há aprovador da etapa atual            |
| `requester_user_id`         | UUID        | Sempre (campo real da tabela)                 |
| `is_current_actor`          | BOOLEAN     | Sempre                                        |
| `allowed_actions`           | JSONB       | Sempre (array vazio quando bloqueado)         |
| `blocked_reasons`           | TEXT[]      | Sempre (array vazio quando ações permitidas)  |
| `next_step_order`           | INT         | Quando há próxima etapa no fluxo              |
| `next_step_name`            | TEXT        | Quando há próxima etapa no fluxo              |
| `next_responsible_rule`     | TEXT        | Quando há próxima etapa no fluxo              |
| `sla_deadline`              | TIMESTAMPTZ | Quando etapa tem SLA definido                 |
| `overdue`                   | BOOLEAN     | Sempre (`false` quando sem SLA)               |

---

## Matriz de Ações por Status

### COMPRAS (`purchases`)

| Status            | Ator Válido        | Ações Permitidas (Sprint 15.2A)  | Bloqueio quando não é ator            |
|-------------------|--------------------|----------------------------------|---------------------------------------|
| `rascunho`        | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode atuar..."  |
| `retornado`       | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode reenviar..." |
| `em_aprovacao`    | Aprovador da etapa | `["aprovar", "devolver", "rejeitar"]` | "Você não é o aprovador atual..."  |
| `reprovado/cancelado` | —             | `[]`                             | "Solicitação encerrada."              |
| `concluido`       | —                  | `[]`                             | "Solicitação concluída."              |
| Demais operacionais | —               | `[]`                             | "Etapa operacional posterior..."      |

### ABASTECIMENTO / DIÁRIA (`fuel_requests` com discriminator)

| Status            | Ator Válido        | Ações Permitidas (Sprint 15.2A)  | Bloqueio quando não é ator            |
|-------------------|--------------------|----------------------------------|---------------------------------------|
| `rascunho`        | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode atuar..."  |
| `em_aprovacao`    | Aprovador da etapa | `["aprovar", "devolver", "rejeitar"]` | "Você não é o aprovador atual..."  |
| `reprovado/cancelado` | —             | `[]`                             | "Solicitação encerrada."              |
| Demais            | —                  | `[]`                             | "Etapa operacional posterior..."      |

### REEMBOLSO (`fuel_requests` com `type='reembolso'`)

| Status            | Ator Válido        | Ações Permitidas (Sprint 15.2A)  | Bloqueio quando não é ator            |
|-------------------|--------------------|----------------------------------|---------------------------------------|
| `rascunho`        | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode atuar..."  |
| `retornado`       | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode reenviar..." |
| `em_aprovacao`    | Aprovador da etapa | `["aprovar", "devolver", "rejeitar"]` | "Você não é o aprovador atual..."  |
| `reprovado/cancelado` | —             | `[]`                             | "Solicitação encerrada."              |
| Demais            | —                  | `[]`                             | "Etapa operacional posterior..."      |

### ADMISSÕES (`admission_requests`)

| Status            | Ator Válido        | Ações Permitidas (Sprint 15.2A)  | Bloqueio quando não é ator            |
|-------------------|--------------------|----------------------------------|---------------------------------------|
| `rascunho`        | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode atuar..."  |
| `em_aprovacao`    | Aprovador da etapa | `["aprovar", "devolver", "rejeitar"]` | "Você não é o aprovador atual..."  |
| `cancelado/reprovado` | —             | `[]`                             | "Solicitação encerrada."              |
| `conclusao/concluido` | —             | `[]`                             | "Admissão concluída."                 |
| Demais            | —                  | `[]`                             | "Etapa operacional posterior..."      |

### DESLIGAMENTOS (`termination_requests`)

| Status                    | Ator Válido        | Ações Permitidas (Sprint 15.2A)  | Bloqueio quando não é ator            |
|---------------------------|--------------------|----------------------------------|---------------------------------------|
| `rascunho`                | Solicitante        | `["enviar", "cancelar"]`         | "Apenas o solicitante pode atuar..."  |
| `em_aprovacao`            | Aprovador da etapa | `["aprovar", "devolver", "rejeitar"]` | "Você não é o aprovador atual..."  |
| `cancelado/reprovado`     | —                  | `[]`                             | "Solicitação encerrada."              |
| `desligamento_concluido`  | —                  | `[]`                             | "Desligamento concluído."             |
| Demais                    | —                  | `[]`                             | "Etapa operacional posterior..."      |

---

## Regras do Responsável Atual

O campo `current_approver_user_id` e `is_current_actor` são determinados **exclusivamente** por:

1. `approval_requests` — localiza o fluxo ativo da entidade (status ≠ `approved/rejected/cancelled`)
2. `approval_request_steps` — identifica a etapa com `status = 'pending'`
3. `approval_flow_steps` — obtém nome da etapa, regra de responsável e SLA

**Sem fluxo ativo:** `is_current_actor = (uid == requester_user_id)`.  
**Com fluxo ativo e etapa pendente:** `is_current_actor = (uid == approver_user_id da etapa)`.  
**Com fluxo ativo sem etapa pendente:** `is_current_actor = (uid == requester_user_id)`.

> Possuir a role correta NÃO autoriza aprovar se o usuário não estiver atribuído como `approver_user_id` na etapa atual.

---

## Tratamento de Erros

| Cenário                         | Comportamento                                              |
|---------------------------------|------------------------------------------------------------|
| `auth.uid()` = NULL             | `current_status='ERRO'`, bloqueio: "Usuário não autenticado."   |
| Usuário inativo                 | `current_status='ERRO'`, bloqueio: "Usuário inativo ou perfil inexistente." |
| Entidade inexistente            | `current_status='ERRO'`, bloqueio: "Entidade não encontrada ou inacessível." |
| Discriminator incompatível      | `current_status='ERRO'`, bloqueio com módulos solicitado/real |
| Módulo desconhecido             | `current_status='ERRO'`, bloqueio: "Módulo inválido ou desconhecido: X" |
| `fleet` sem discriminator       | Tratado como módulo desconhecido                           |
| Erro técnico inesperado (SQL)   | **RAISE** — não silenciado, testável via logs/testes       |

---

## Segurança

- `SECURITY DEFINER`: permite acessar tabelas protegidas por RLS independente do papel do chamador
- `SET search_path = 'public', 'auth'`: protege contra injeção de schema
- `anon`: **não possui** permissão de execução (`REVOKE ALL ... FROM anon`)
- `authenticated`: possui permissão de execução (`GRANT EXECUTE ... TO authenticated`)
