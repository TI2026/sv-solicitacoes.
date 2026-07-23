# SPRINT 15: RELATÓRIO FINAL E GATE DE HOMOLOGAÇÃO

**Data:** 2026-07-23
**Status Geral:** **NO-GO TEMPORÁRIO (Aguardando Provisionamento de Staging)**

O Sprint 15 completou toda a fase de diagnóstico de produção, conciliação de código, refatoração de migrations locais e compilação do front-end. No entanto, em total obediência às diretrizes de segurança arquitetural, **nenhuma mutação foi aplicada ao banco de produção** (zeaerqlvhrbcuubueolh).

## 1. O Problema do Histórico Remoto (Diagnóstico Comprovado)
Após rodar o dry-run, foi comprovado que **dezenas de migrations históricas (desde 2026-06-30 até 2026-07-21)** estão ausentes da tabela `schema_migrations` do Supabase de produção, apesar de **seus efeitos já estarem presentes no schema real** (ex: a tabela `purchases` criada na sprint 8 existe, a RPC `process_approval_action` criada na sprint 3 existe).

Isso configura um cenário clássico de **TIPO 4 (Histórico remoto incorreto)** causado por manipulação de schema via Web UI ou deploy assíncrono pelo Lovable sem o commit correto do registro de migração.

Como as migrations ausentes possuem timestamps muito mais antigos do que as migrations da série `20260722` (que estão no histórico), o `db push --dry-run` exigiria o uso da flag destrutiva `--include-all` e tentaria reaplicar todo o histórico, o que causaria colisões e quebra da base.

## 2. Bloqueio Imediato: Proteção de Produção
Para corrigir isso localmente, o processo correto exige:
1. Usar `supabase migration repair --status applied <version>` para cada migration que já existe.
2. Usar `db push` para empurrar apenas as novas (Sprint 15).

Contudo, **como o ambiente vinculado é o Banco de Produção, nenhuma execução de repair ou push foi feita.** O Gate proíbe testes em produção antes da homologação E2E.

## 3. Código Frontend
- O código local compila (`vite build` gerado sem erros de Typescript).
- Fluxos do motor (PurchaseApprovalBlock, FleetApprovalAction) estão sincronizados para consumir os contextos corretos.
- No entanto, não é possível atestar o GO E2E funcional pois a base remota de produção ainda carece das colunas cruciais de `purchases` (ex: `deleted_at`, `tracking_code`) e das novas RPCs da Sprint 15. Qualquer clique no app em produção atrelado a esses novos fluxos irá causar `500 Internal Server Error`.

## 4. O Que Falta para o GO Final (Comandos Exatos Solicitados)

Como não tenho credenciais para provisionar via painel web, o Sprint está pausado no Gate de Infraestrutura.

### Ação Necessária do Responsável / DBA:
1. **Provisione um ambiente de Staging (Projeto Separado) no Supabase.**
2. Restaure o backup point-in-time de produção nele.
3. Vincule a CLI ao staging: `npx supabase link --project-ref <NOVO_REF>`
4. Rode a bateria de repair listada abaixo para normalizar o histórico do staging.
5. Rode `npx supabase db push`.
6. Permita que eu conclua os testes E2E do Frontend apontando para esse staging.

**Comandos Exatos de Repair (Para rodar no Staging ou em Produção quando autorizado):**
```bash
npx supabase migration repair --status applied 20260318171500
npx supabase migration repair --status applied 20260630133918
npx supabase migration repair --status applied 20260630135238
npx supabase migration repair --status applied 20260630141022
npx supabase migration repair --status applied 20260630142500
npx supabase migration repair --status applied 20260630160000
npx supabase migration repair --status applied 20260703125923
npx supabase migration repair --status applied 20260703132000
npx supabase migration repair --status applied 20260703134500
npx supabase migration repair --status applied 20260703134512
npx supabase migration repair --status applied 20260703140000
npx supabase migration repair --status applied 20260709000000
npx supabase migration repair --status applied 20260716150000
npx supabase migration repair --status applied 20260717110700
npx supabase migration repair --status applied 20260717112426
npx supabase migration repair --status applied 20260720000001
npx supabase migration repair --status applied 20260720000002
npx supabase migration repair --status applied 20260720000003
```
*(Após rodar o repair, um `db push` limpo levará apenas as 3 migrations TIPO 3 reais da Sprint 15).*
