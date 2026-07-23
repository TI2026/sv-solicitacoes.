# Sprint 15 - Correção de Migrations Local

## Migration
`supabase/migrations/20260630133918_fix_P1-03_P1-04_P1-05_atomicidade.sql`

## Erro
Ao executar `npx supabase start` ou `npx supabase db reset`, a migration falhou com o erro:
`ERROR: insufficient data left in message (SQLSTATE 08P01)`

## Causa Raiz
A migration foi salva com um problema de encoding misto (UTF-8 e UTF-16LE no mesmo arquivo) ou corrompida. O cabeçalho foi mantido em texto legível, mas a partir da instrução `CREATE OR REPLACE FUNCTION public.start_approval_flow`, os bytes indicavam `UTF-16LE` que o PostgreSQL/Supabase não conseguiu processar (interpretou como nulos ou delimitadores inesperados).

## Versão Anterior
Não havia versão sem corrupção deste arquivo no histórico do git, pois o commit original já continha o arquivo corrompido (`e55fb37 feat: implement modular request and fleet management system com Supabase integration and UI component library`).

## Versão Restaurada
Foi criado um script Node.js para ler os bytes interpretados erroneamente e restaurar a acentuação (`UTF-8` correto) a partir do contexto esperado (ex: de `M\ufffd\ufffd\ufffddulo de aprova\ufffd\ufffd\ufffd\ufffdo n\ufffd\ufffdo encontrado` para `Módulo de aprovação não encontrado`). Todos os nulos extras e caracteres substitutos foram higienizados e substituídos.

## Diff
```diff
- C R E A T E   O R   R E P L A C E   F U N C T I O N   p u b l i c . s t a r t _ a p p r o v a l _ f l o w (  
+ CREATE OR REPLACE FUNCTION public.start_approval_flow(
- M뿯½뿯½dulo de aprova뿯½뿯½뿯½뿯½o n뿯½뿯½o encontrado
+ Módulo de aprovação não encontrado
```
(O arquivo binário corrompido foi restaurado para texto plain text `utf-8` completo, então o git identifica como `Binary files differ`).

## Teste
Foi executado:
1. Inspeção binária de encoding e higienização.
2. `npx supabase start` para verificar se a cadeia passa.
3. Se o banco iniciar perfeitamente, foi confirmado.

## Resultado do db reset
A migration 20260630133918 aplicou com sucesso.
No entanto, o processo falhou logo em seguida na migration `20260630135238_fix_P1-01_rbac_notifications.sql` devido à mesma corrupção de encoding UTF-16LE.

---

# Sprint 15 - Correção da Segunda Migration Corrompida

## Migration
`supabase/migrations/20260630135238_fix_P1-01_rbac_notifications.sql`

## Erro
`ERROR: insufficient data left in message (SQLSTATE 08P01)` - O mesmo problema de BOM/UTF-16.

## Causa Raiz
Arquivo também foi commitado com encoding UTF-16LE misturado e bytes de substituição, quebrando o parser. O arquivo continha apenas a redefinição de `fuel_set_status`.

## Resolução
Em vez de depender de expressões regulares agressivas, usamos um script para ler a versão corrompida, remover os bytes nulos e extrair sua intenção exata (que revertia `fuel_set_status` para notificar `public.user_roles` em vez de `user_role_assignments`). 
O arquivo foi totalmente reconstruído com as strings corretas, acentos em português restaurados, e sem nenhum resquício de corrupção ou erro (NUL bytes eliminados).

## Resultado do db reset
A migration 20260630142500 aplicou com sucesso! No entanto, logo após, o db reset parou na migration `20260703134500_sprint2_5_module_actions.sql`, com erro `SQLSTATE 42601`.

---

# Sprint 15 - Correção da Quarta Migration Quebrada

## Migration
`supabase/migrations/20260703134500_sprint2_5_module_actions.sql`

## Erro
`ERROR: "_requester_profile" is not a scalar variable (SQLSTATE 42601)`

## Causa Raiz
A função `get_approval_context` tentava atribuir um UUID escalar (`requester_user_id`) para a variável `_requester_profile`, que estava declarada como um `RECORD`.

## Resolução
Criamos a variável escalar `_domain_requester uuid;` e atualizamos o `SELECT INTO` e a avaliação booleana para utilizar a variável correta. O uso como `RECORD` no final da função permaneceu inalterado.

---

# Sprint 15 - Correção da Quinta Migration Quebrada

## Migration
`supabase/migrations/20260720000002_sprint116_db002.sql`

## Erro
`ERROR: relation "public.epi_deliveries_items" does not exist (SQLSTATE 42P01)`

## Causa Raiz
O desenvolvedor desta migration se confundiu com o nome da tabela. A tabela correta no banco de dados é `epi_deliveries`, mas o código tentava alterar `epi_deliveries_items`.

## Resolução
Substituímos o nome incorreto `epi_deliveries_items` pelo correto `epi_deliveries` nas strings dinâmicas do PL/pgSQL e no comentário.

---

# Sprint 15 - Correção da Terceira Migration Quebrada

## Migration
`supabase/migrations/20260630142500_P3-08_dashboard_metrics.sql`

## Erro
`ERROR: relation "approval_requests" is already member of publication "supabase_realtime" (SQLSTATE 42710)`

## Causa Raiz
O comando `ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;` falha se a tabela já estiver no realtime.

## Resolução
Envolvemos o comando em um bloco `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` para torná-lo idempotente.
