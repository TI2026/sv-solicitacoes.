# SPRINT 15 - FONTE ÚNICA DE VERDADE (SSOT)

Este documento define a verdade canônica para todos os módulos. Ele reconcilia conflitos entre frontend, backend e documentação antiga, utilizando sempre a regra mais estrita e completa. O frontend e o backend **devem** seguir estas regras estritamente.

---

## 1. MÓDULO DE COMPRAS (PURCHASES)
- **Entidade:** Solicitação de Compra
- **Tipo do Módulo:** Financeiro / Operacional
- **Tabela:** `purchases`
- **Discriminador:** Não aplicável (tabela exclusiva)
- **Status Válidos e Transições (Máquina de Estado):**
  - `rascunho` -> `em_aprovacao` (Ação: *Enviar*)
  - `em_aprovacao` -> `aguardando_oc` (Ação: *Aprovar*) ou `reprovado` (Ação: *Rejeitar*) ou `retornado` (Ação: *Devolver*)
  - `retornado` -> `em_aprovacao` (Ação: *Reenviar*)
  - `aguardando_oc` -> `aguardando_pagamento` (Ação: *Gerar OC*)
  - `aguardando_pagamento` -> `aguardando_entrega` (Ação: *Confirmar Pagamento*)
  - `aguardando_entrega` -> `entregue` (Ação: *Informar Entrega*)
  - `entregue` -> `concluido` (Ação: *Concluir*) ou `divergencia` (Ação: *Relatar Divergência*)
  - *Cancelamento:* Permitido de `rascunho` até `aguardando_oc`.
- **Responsável por Etapa & Ações Permitidas:**
  - `rascunho` / `retornado` (Solicitante/Substituto): Editar, Enviar, Cancelar.
  - `em_aprovacao` (Aprovador - hierarchy based): Aprovar, Devolver, Rejeitar.
  - `aguardando_oc` (Compras): Gerar OC.
  - `aguardando_pagamento` (Financeiro): Confirmar Pagamento.
  - `aguardando_entrega` (Compras/Solicitante): Informar Entrega.
  - `entregue` (Solicitante/Compras): Concluir, Relatar Divergência.
- **RPC Utilizada:** `process_approval_action` (para motor) e RPCs operacionais customizadas para Compras (ex: `confirm_purchase_payment`).
- **Histórico/Auditoria:** Inserção em `audit_logs` e `approval_flow_steps` via motor.
- **Notificação:** `notifications` na mudança de dono/status.
- **Fila:** Exclusiva em `/purchases`.
- **Dashboard:** Visão Financeira e Compras.
- **Realtime:** Listen em `purchases` e `approval_requests`.
- **Perfil Autorizado (RLS):** Criadores (self), Aprovadores da cadeia, Financeiro, Compras, Master.

---

## 2. MÓDULO DE ABASTECIMENTO (FLEET - FUEL)
- **Entidade:** Solicitação de Abastecimento
- **Tipo do Módulo:** Operacional
- **Tabela:** `fuel_requests`
- **Discriminador:** `type = 'abastecimento'`
- **Status Válidos e Transições:**
  - `rascunho` -> `em_aprovacao` (Ação: *Enviar*)
  - `em_aprovacao` -> `aguardando_execucao` (Ação: *Aprovar*)
  - `aguardando_execucao` -> `aguardando_comprovante` (Ação: *Informar Abastecimento*)
  - `aguardando_comprovante` -> `revisao_administrativa` (Ação: *Enviar Documentos*)
  - `revisao_administrativa` -> `concluido` (Ação: *Concluir Revisão*)
- **Responsável por Etapa & Ações Permitidas:**
  - `rascunho` (Solicitante): Editar, Enviar, Cancelar.
  - `em_aprovacao` (Aprovador/Supervisor): Aprovar, Devolver, Rejeitar.
  - `aguardando_execucao` / `aguardando_comprovante` (Solicitante): Upload NF e Comprovante, Enviar Documentos.
  - `revisao_administrativa` (Administrativo): Revisar, Devolver, Concluir.
- **RPC Utilizada:** Motor de Aprovação Universal (Action Context).
- **Fila:** Aba exclusiva de Abastecimento (`/fleet?tab=fuel`).

---

## 3. MÓDULO DE DIÁRIAS (FLEET - DAILY)
- **Entidade:** Solicitação de Diária
- **Tipo do Módulo:** Operacional / Financeiro
- **Tabela:** `fuel_requests`
- **Discriminador:** `type = 'diaria'`
- **Status Válidos e Transições:**
  - `rascunho` -> `em_aprovacao` (Ação: *Enviar*)
  - `em_aprovacao` -> `programada` (Ação: *Aprovar*)
  - `programada` -> `em_verificacao` (Ação do Sistema - Tempo limite excedido)
  - `em_verificacao` -> `aguardando_pagamento` (Ação: *Confirmar Horas*)
  - `aguardando_pagamento` -> `concluido` (Ação: *Pagar*)
- **Responsável por Etapa & Ações Permitidas:**
  - `rascunho` (Solicitante): Editar, Enviar.
  - `em_aprovacao` (Aprovador): Aprovar, Devolver, Rejeitar.
  - `em_verificacao` (Supervisor): Confirmar Horas.
  - `aguardando_pagamento` (Financeiro): Confirmar Pagamento.
- **Fila:** Aba exclusiva de Diárias (`/fleet?tab=daily`).

---

## 4. MÓDULO DE REEMBOLSO (FLEET - REIMBURSEMENT)
- **Entidade:** Solicitação de Reembolso
- **Tipo do Módulo:** Financeiro
- **Tabela:** `fuel_requests`
- **Discriminador:** `type = 'reembolso'`
- **Status Válidos e Transições:**
  - `rascunho` -> `em_aprovacao` (Ação: *Enviar*)
  - `em_aprovacao` -> `aguardando_pagamento` (Ação: *Aprovar*) ou `retornado`
  - `aguardando_pagamento` -> `pago` (Ação: *Pagar*)
  - `pago` -> `concluido` (Ação: *Confirmar Recebimento*)
- **Responsável por Etapa & Ações Permitidas:**
  - `rascunho` / `retornado` (Solicitante): Editar, Enviar.
  - `em_aprovacao` (Aprovador): Aprovar, Devolver, Rejeitar.
  - `aguardando_pagamento` (Financeiro): Confirmar Pagamento.
  - `pago` (Solicitante): Confirmar Recebimento.
- **Fila:** Aba exclusiva de Reembolso (`/fleet?tab=reimbursement`).

---

## 5. MÓDULO DE ADMISSÕES
- **Entidade:** Processo Seletivo / Admissão
- **Tipo do Módulo:** RH
- **Tabela:** `admission_requests`
- **Status Válidos e Transições:**
  - `abertura` -> `dados_candidato`
  - `dados_candidato` -> `documentos`
  - `documentos` -> `analise_documental`
  - `analise_documental` -> `exames`
  - `exames` -> `assinatura`
  - `assinatura` -> `revisao`
  - `revisao` -> `aprovacao`
  - `aprovacao` -> `conclusao`
- **Responsável & Permissões:** O motor de aprovação irá orquestrar o candidato, RH e DP nos acessos aos arquivos. Candidato edita até análise, após isso RH avança os status.

---

## 6. MÓDULO DE DESLIGAMENTOS
- **Entidade:** Desligamento de Colaborador
- **Tipo do Módulo:** RH
- **Tabela:** `termination_requests`
- **Status Válidos:** `abertura`, `envio`, `aprovacao`, `processamento`, `devolucoes_epi`, `desvinculos`, `inativacao`, `concluido`.
- **Ações:** Rotação completa gerenciada pelo RH. Motor bloqueia edição de dados sensíveis após conclusões para evitar regressões (Idempotência garantida pelo backend).

---

## REGRAS DE DESIGN (DECISÕES ARQUITETURAIS)
1. **Approval Engine Único:** Um modelo de Contexto de Ação via TypeScript Hook (ex: `useApprovalActionContext`) padronizará TODOS os botões de ação e modais de cada página de detalhes, consumindo uma regra centralizada de *Quais botões eu posso ver baseado no status da entidade e meu perfil na role assignment*.
2. **Separação Abastecimento/Diárias/Reembolso:** Filtros estritos baseados na coluna `type` no frontend (vazamentos entre abas serão bloqueados no loader/query).
3. **Persistência de Customização:** Configurações de UI (abas, layout de dashboard) serão salvas em `user_preferences` via RLS ou em JSON dentro do profile.
4. **Dashboard:** Nenhuma query pode baixar a tabela completa para sumarizar no Client. RPCs dedicadas (`get_dashboard_metrics` ou similares) executarão a soma no BD.
