# Migrations propostas (NÃO aplicadas)

Conteúdo deste diretório aguarda autorização humana explícita.
Não faz parte da cadeia oficial `supabase/migrations` (152 migrations).

- `20260922160000_checkpoint_final_bootstrap_master.sql`
  Bootstrap controlado do Master inicial (singleton + advisory lock + e-mail
  autorizado no servidor) e remoção da promoção automática do primeiro usuário
  a `diretoria` em `public.user_roles`.
  Validada em banco limpo local com pgTAP. Produção intocada.
