# PROMPT INTEGRAL PARA O CLAUDE SONNET 4.6 EXECUTAR O SPRINT 15

<INSTRUÇÕES>
Você é a equipe principal de Engenharia do SV ERP. Sua missão é EXECUTAR a implementação do Sprint 15 de Consolidação Funcional Total.
Siga EXATAMENTE as diretrizes abaixo.

## PASSO 1: CONTEXTUALIZAÇÃO OBRIGATÓRIA
1. Leia todo o repositório, focando no `package.json`, App.tsx, hooks, contexts, migrations e arquivos de módulo no Frontend.
2. Leia OS ARTEFATOS na pasta `docs/sprint15/` criados no planejamento:
   - SPRINT15_PLANO_MESTRE_DEFINITIVO.md
   - SPRINT15_MAQUINAS_DE_ESTADO.md
   - SPRINT15_MATRIZ_PERMISSOES.md
   - SPRINT15_PLANO_BANCO_MIGRATIONS.md
   - SPRINT15_MATRIZ_TESTES_HOMOLOGACAO.md
   - SPRINT15_CRITERIOS_GO_NO_GO.md
3. Assuma estritamente as regras de negócio descritas nestes documentos.
   - NÃO INVENTE MÓDULOS NOVOS.
   - NÃO MODIFIQUE AS REGRAS DE NEGÓCIO ESTABELECIDAS.
   - NÃO FAÇA REDESIGN.

## PASSO 2: EXECUÇÃO POR FASES
Execute as fases sequencialmente da Fase 0 a 9 conforme SPRINT15_PLANO_MESTRE_DEFINITIVO.
Não pule ou inverta as dependências.
Faça commits pequenos e semânticos.
Não peça permissão e aprovação para salvar arquivo a arquivo, siga em frente gerando código executável. Só pare se encontrar bloqueadores irrecuperáveis ou falta crítica de segredos/acessos.

## PASSO 3: SEGURANÇA E BANCO DE DADOS
- ANTES de criar qualquer migration (Fase 2 em diante), você DEVE obrigatoriamente executar consultas via `supabase db psql` de forma read-only (`SELECT DISTINCT`, validação de schemas) para validar o ambiente físico real. 
- Use migrations estritamente IDEMPOTENTES.
- Zere as normalizações de status cegadas.
- Sincronize a fonte de RLS e o RBAC estritamente na Matriz Dinâmica.
- Preste atenção redobrada aos bloqueios contra Concorrência e cliques duplos usando locks (ex: FOR UPDATE NOWAIT) no Backend e `disabled` UI states acoplados via react-hook-form.

## PASSO 4: TESTES E EVIDÊNCIAS
- Implemente e corra testes locais usando Playwright conforme SPRINT15_MATRIZ_TESTES_HOMOLOGACAO.md.
- Produza evidências de sucesso de cada etapa (resultado do terminal, compilação TypeScript limpa, testes vitest rodando verde).

## PASSO 5: ENTREGA
Ao término, gere um relatório final documentando detalhadamente a versão consolidada que atendeu 100% dos fluxos de 'rascunho' à 'concluído', sem deixar exceções sistêmicas abertas, atestando o critério GO do Sprint 15.

</INSTRUÇÕES>
