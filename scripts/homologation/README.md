# Checkpoint 2 — Homologação multiusuário

Estes scripts existem porque a bateria multiusuário **não pode** ser executada no
ambiente de desenvolvimento do Lovable (sem Docker, sem Supabase CLI, sem banco
local) e **não pode** ser executada em produção (proibido criar fixtures lá).

Status: **READY TO RUN — NOT EXECUTED**.

## Pré-requisitos

- Docker em execução
- Supabase CLI (`npx supabase start`)
- Banco local resetado: `npx supabase db reset`

## Execução

```bash
npx supabase start
npx supabase db reset            # aplica todas as migrations do zero
node scripts/homologation/setup-fixtures.mjs
node scripts/homologation/run-homologation.mjs
npx playwright test              # E2E (realtime / navegação / UI)
```

Ambos os scripts abortam se a API não for `localhost`/`127.0.0.1`.

## Personas

| Chave | E-mail | Papel |
|---|---|---|
| A | a.requester@local.homolog | colaborador (solicitante) |
| B | b.approver1@local.homolog | supervisor (etapa 1) |
| C | c.approver2@local.homolog | administrativo (etapa 2) |
| D | d.approver3@local.homolog | administrativo (etapa 3) |
| S | s.substitute@local.homolog | supervisor (substituto) |
| M | m.master@local.homolog | master |
| F | f.financeiro@local.homolog | financeiro |
| RH | rh@local.homolog | rh |
| DIR | dir@local.homolog | diretoria |
| U | u.unrelated@local.homolog | colaborador sem relação |

Senha única: `Homolog@2026` (somente ambiente local).

## Cobertura atual do runner

- Compras ponta a ponta (enviar → 2 aprovações → gerar_oc → pagar → informar_entrega → concluir)
- Devolução e reenvio preservando a mesma `approval_request` e a mesma etapa
- Justificativa mínima obrigatória (motivo curto recusado)
- Reembolso sem comprovante bloqueado pelo backend
- Diária enviando de verdade, com responsável na etapa 1 e sem ações de Compras
- Concorrência (duas aprovações simultâneas → uma vence, sem duplicidade)
- RLS negativa para usuário sem relação (leitura, alteração, catálogo de documentos)
- Sweep de SLA idempotente

## Ainda a cobrir manualmente na homologação

- Realtime com duas sessões de navegador (usar `e2e/`)
- Notificações persistidas por destinatário e badge sem refresh
- Setor → responsável → substituto após vencimento de SLA
- Master override com motivo e auditoria `master_override`
- Admissões e Desligamentos ponta a ponta com efeitos finais
- Persistência de configuração (salvar → logout → login → nova solicitação)
