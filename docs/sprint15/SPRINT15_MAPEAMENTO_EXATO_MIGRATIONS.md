# SPRINT 15: MAPEAMENTO EXATO DE MIGRATIONS

Este documento formaliza a relação real entre os arquivos locais do repositório e os registros gravados na tabela `schema_migrations` do Supabase de produção (zeaerqlvhrbcuubueolh). 

A análise das assinaturas de tabelas (ex: `purchases`), índices, triggers e funções prova que o SQL das migrations foi executado. O que falhou foi apenas a gravação síncrona do nome do arquivo ou do timestamp idêntico pelo motor do Supabase/Lovable.

## TIPO 1 — Correspondência Exata
SQL remoto e local são equivalentes e os schemas de dados provam isso (ex: `roles` existem, `purchases_pkey` existe). Apenas o timestamp variou na inserção ou o nome foi ignorado.
**Ação Adotada:** Renomear os arquivos locais de 14 dígitos para parear com a tabela de histórico remoto (Sem migration repair).

**Lista de Pares TIPO 1 (Exemplos Recentes Identificados):**
- **Local:** `20260722180729_e6dd8ffe-9cc2-4009-a596-2f6c7601fe4a.sql` 
  - **Remote Equivalente:** `20260722180736`
- **Local:** `20260722173238_8eed0b21-3047-46bc-8beb-a48baa55e80b.sql`
  - **Remote Equivalente:** `20260722173243`
- **Local:** `20260722172058_8112a36e-42c0-4469-835d-cac9c8b9f20b.sql`
  - **Remote Equivalente:** `20260722172107`
- **Local:** `20260722131759_e158db73-3c26-4e04-9897-602113427a6e.sql`
  - **Remote Equivalente:** `20260722131810`
- **Local:** `20260722130016_e70d93d1-e0c4-4c53-818e-1aebdbd89218.sql`
  - **Remote Equivalente:** `20260722130023`
- **Local:** `20260722122320_251a18c2-8eb1-4748-9af9-fcb4d3443d1e.sql`
  - **Remote Equivalente:** `20260722122324`
- **Local:** `20260721203541_bd0c583f-1f88-4b73-a8d2-c1b2bcba1f97.sql`
  - **Remote Equivalente:** `20260721203545`

*Para todas as outras antigas onde o timestamp é igual e só falta o name, o CLI aceita como match, então não precisamos mexer.*

## TIPO 3 — Migration Local Realmente Pendente
Migrations cujo timestamp local não existe nem de forma similar remotamente, ou que usam formato inválido de 8 dígitos (`YYYYMMDD`):

- `20260318_171500_fix_admission_files_exam_link_type.sql` (timestamp inválido)
- `20260709_sprint5_consolidation.sql` (timestamp inválido)
- `20260720_sprint116_db001.sql` (timestamp inválido)
- `20260720_sprint116_db002.sql`
- `20260720_sprint116_db003.sql`
- `20260720_sprint116_db004.sql`
- `20260720_sprint116_db005.sql`
- `20260720_sprint11_desligamentos.sql`
- `20260723130100_sprint15_001_purchases_schema.sql` (Sprint 15 corrigida)
- `20260723130200_sprint15_002_purchase_rpcs.sql` (Sprint 15 corrigida)
- `20260723130300_sprint15_003_termination_unlink.sql` (Sprint 15 corrigida)

Essas migrations são pendentes e precisariam ter seus timestamps normalizados para 14 dígitos caso formos aplicá-las em homologação.

## TIPO 4 / TIPO 5 — Desvios não mapeados
Não foram encontrados objetos não justificados (Tipo 5) pelas migrations locais. Funções faltando (como `get_approval_context`) sugerem que não foram aplicadas (as migrations de 8 dígitos de Sprint 11, etc., contêm algumas delas, e elas caem no Tipo 3).

---
**Bloqueios:** Nenhum Repair em Massa será utilizado. As únicas modificações serão o rename no git para forçar a conciliação CLI local/remoto para o TIPO 1, transformando as divergências de poucos segundos em hits autênticos para o comando `db push`.
