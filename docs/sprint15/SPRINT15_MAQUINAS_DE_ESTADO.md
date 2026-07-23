# SPRINT 15: MÁQUINAS DE ESTADO

## 1. ABASTECIMENTO
- **Estados Atuais (observados/presumidos):** rascunho, enviado, aprovado, devolvido, concluído.
- **Estados Canônicos Esperados:** rascunho, em_aprovacao, aguardando_financeiro, aguardando_abastecimento, aguardando_revisao_docs, concluido, rejeitado, cancelado.
- **Transições:**
  - Rascunho -> em_aprovacao (Ator: Solicitante | Pré-cond: valid form | Ação: enviar)
  - em_aprovacao -> aguardando_financeiro (Ator: Aprovador | Pré-cond: etapa motor | Ação: aprovar)
  - aguardando_abastecimento -> aguardando_revisao_docs (Ator: Solicitante | Pré-cond: upload NF/KM | Ação: enviar_documentos)
- **Devolução:** Etapa N -> N-1 ou Solicitante.
- **Rejeição:** Encerra fluxo.
- **Cancelamento:** Antes da etapa irreversível pelo solicitante/master.

## 2. DIÁRIA
- **Estados Canônicos:** rascunho, em_aprovacao, agendada, aguardando_confirmacao, aguardando_pagamento, concluida.
- **Transições:**
  - agendada -> aguardando_confirmacao (Ator: Backend/SLA | Pré-cond: horario_fim superado | Ação: liberar_confirmacao)
  - aguardando_confirmacao -> aguardando_pagamento (Ator: Verificador | Pré-cond: confirmou horas | Ação: confirmar)

## 3. REEMBOLSO
- **Estados Canônicos:** rascunho, em_aprovacao, revisao_financeira, aguardando_recebimento, concluido, divergencia.
- **Transições:**
  - revisao_financeira -> aguardando_recebimento (Ator: Financeiro | Pré-cond: NF ok | Ação: pagar)
  - aguardando_recebimento -> divergencia (Ator: Solicitante | Pré-cond: Erro de valor | Ação: relatar_divergencia) -> Volta p/ Financeiro.

## 4. COMPRAS
- **Estados Canônicos:** rascunho, em_aprovacao, aguardando_oc, aguardando_pagamento, aguardando_entrega, entregue, concluido, divergencia.
- **Transições:**
  - em_aprovacao -> aguardando_oc (Ator: Aprovador | Ação: aprovar)
  - aguardando_oc -> aguardando_pagamento (Ator: Compras | Ação: gerar_oc)
  - aguardando_entrega -> entregue (Ator: Solicitante | Ação: informar_entrega)

## 5. ADMISSÃO
- **Estados Canônicos:** solicitacao, aprovada, triagem, exame_medico, documentacao, registros, ativo.
- **Transições:** Integração entre motor genérico inicial e operacional em seguida. 

## 6. DESLIGAMENTO
- **Estados Canônicos:** solicitacao, aprovado, desativacao_acessos, revisao_vinculos, devolucao_epis, concluido.
- **Ação Crítica:** Sistema automaticamente processa desvínculos (com relatórios) na etapa de `revisao_vinculos`.
