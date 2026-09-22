# Fechamento operacional: limpeza, tempo real e ativação do Motor V2

Sete frentes pedidas, executadas sem criar módulo novo e sem redesign. Reaproveitam o motor, o Action Context e os componentes já existentes.

## 1. Limpeza dos dados de teste (produção)

Apagar todos os registros operacionais de: pendências, reembolso, diárias, abastecimento, admissões, compras, veículos, histórico e alertas — incluindo os fluxos de aprovação ligados a eles, anexos e notificações.

Preservado: usuários, perfis, papéis e permissões, setores, categorias dinâmicas, catálogo de EPI, configuração de fluxos e limites.

A limpeza roda pela rotina do próprio banco, em uma transação única, na ordem correta de dependências. Antes de apagar, mostro a contagem exata por tabela para você conferir.

## 2. Ativação do Motor V2

As 18 solicitações "em andamento" são justamente os dados de teste acima. Com a limpeza feita, o bloqueio desaparece sozinho e a ativação é liberada — sem forçar nada e sem alterar regra de negócio. Executo a ativação logo em seguida e confirmo o estado final.

## 3. Ações restritas ao aprovador da etapa

Aprovar / rejeitar / devolver só aparecem para quem é o ator da etapa **atual**. Quem é aprovador de etapa seguinte, ou está fora do fluxo, vê apenas o andamento e o rótulo de espera.

O backend já decide isso (`is_current_actor` + `allowed_actions`); o ajuste é garantir que **todas** as telas — Abastecimento, Diária, Reembolso, Compras, Admissões, Desligamentos, painel de controle de fluxos e ações em lote — obedeçam à mesma fonte, sem atalhos locais de exibição.

## 4. Anexo de comprovante na etapa financeira

Na confirmação de pagamento, campo de anexo (comprovante) usando o mesmo fluxo seguro de upload já existente nos módulos. O arquivo fica vinculado à solicitação e aparece nos anexos e no histórico.

## 5. Tempo real em todos os fluxos

Toda vez que um aprovador avança uma etapa, as telas dos demais atualizam sozinhas: lista, detalhe, andamento do fluxo, histórico, pendências e painel. Sem recarregar a página.

Implementação: uma assinatura única de eventos do banco (solicitações, etapas e notificações) que invalida exatamente as consultas afetadas.

## 6. Desempenho em todas as telas

- Consultas com cache compartilhado e sem buscas duplicadas na mesma tela.
- Listas pedem só as colunas usadas e paginam no servidor.
- Carregamento sob demanda das telas pesadas, com esqueleto imediato em vez de tela branca.
- Fim do recarregamento completo a cada foco de janela.

## 7. Preenchimento automático de EPI por cargo

Ao escolher o colaborador na entrega, os itens do cargo/setor dele vêm preenchidos automaticamente (regras de kit já cadastradas), com quantidades e tamanhos sugeridos — tudo editável antes de confirmar.

## Detalhes técnicos

- Limpeza via função `admin_purge_test_data` (escopo operacional) executada por migração/SQL revisado, com contagem antes e depois; sem `DROP`, sem alterar esquema.
- Ativação por `activate_approval_v2()` após `get_v2_cutover_status()` retornar liberado.
- Gate de ações: `useApprovalContext` passa a expor `is_current_actor` como condição obrigatória para `approve/reject/return`; componentes de ação consomem só esse contrato.
- Realtime: hook central sobre `fuel_requests`, `purchases`, `admission_requests`, `termination_requests`, `approval_requests`, `approval_request_steps`, `notifications`, com `removeChannel` no cleanup.
- Anexo financeiro: reutiliza `*-create-signed-upload` + tabela de anexos do módulo; sem bucket novo.
- EPI: `epi_kit_rules` filtradas por setor + cargo do colaborador, aplicadas como estado inicial editável do formulário de entrega.

## Riscos

A limpeza é irreversível. Confirmo as contagens antes de executar e sigo apenas com sua aprovação deste plano.
