# SPRINT 15: MATRIZ DE TESTES E HOMOLOGAÇÃO E2E

A automação utilizará **Playwright**, englobando cenários críticos com 5 perfis diferentes em sessões paralelas.

## CENÁRIOS PRINCIPAIS

### C1. Criação e Envio Atômico (Sem duplicidade)
- **Perfil:** Colaborador + Aprovador Setor
- **Módulo:** Abastecimento
- **Passos:** Logar Colab > Preencher formulário validado Zod > Clicar "Salvar" 3 vezes rápido > Enviar > Logar Aprovador.
- **Resultado Esperado:** Apenas 1 registro gerado, 1 approval_request criado, nenhuma falha de lock, badge de notificação visível no Aprovador.

### C2. Fluxo Operacional: Compras Completo
- **Perfil:** Solicitante, Gestor, Financeiro, Compras
- **Módulo:** Compras
- **Passos:** Criar -> Enviar -> Aprovar (Gestor) -> Gerar OC (Compras) -> Confirmar Pagamento (Financeiro) -> Entrega -> Confirmação de Recebimento.
- **Resultado Esperado:** O dashboard de Compras transita pelas 6 etapas de status até 'concluido'.
- **Evidência:** Gravação de vídeo Playwright do fluxo.

### C3. Segurança e RLS
- **Perfil:** Colaborador
- **Cenário:** Modificação de ID na URL e interceptação de payload de aprovação.
- **Passos:** Acessar URL `/purchases/UUID_ALHEIO`. Chamar API RPC de aprovação simulada com ID não autorizado.
- **Resultado Esperado:** 404/403 no frontend, Erro ENGINE-403 na RPC. RLS barrando acesso.

### C4. Escalada de Aprovador Substituto e SLA
- **Cenário:** Time travel/Timeout no banco (mock no test db).
- **Passos:** Esperar 15min.
- **Resultado Esperado:** Novo aprovador ganha permissão sem alternar infinitamente. SLA aponta Crítico após 72h.

### C5. Atualização Realtime e Notificações Pop-up
- **Cenário:** 2 abas abertas de Aprovador e Solicitante.
- **Passos:** Aprovador rejeita com justificativa. Solicitante observa tela.
- **Resultado Esperado:** Popup de rejeição aparece em 1s na aba do solicitante sem refresh. Fila atualiza.
