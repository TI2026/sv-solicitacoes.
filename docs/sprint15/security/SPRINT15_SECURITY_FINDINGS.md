# SPRINT 15.1 - INVENTÁRIO DE SEGURANÇA E CORREÇÕES (HARDENING)

## CRITICAL

### 1. Approval flow start RPC does not verify requester ownership
- **Objeto exato:** `public.start_approval_flow`
- **Arquivo:** `20260724110000_sprint15_006_approval_ownership_security.sql`
- **Causa:** A função recebia `p_requester_user_id` sem validá-lo contra `auth.uid()`, permitindo Forgery.
- **Correção:** Adicionado hard-check contra `auth.uid()`, exceção permitida apenas via `has_permission('approval.start_on_behalf')`, log de auditoria obrigatório de impersonation, e validação se o `requester` na tabela física pertence ao usuário que clama autoria.
- **Teste Positivo:** Criação de solicitação sendo o próprio requester funciona perfeitamente.
- **Teste Negativo:** Tentativa de criar para outro usuário sem permissão falha estruturadamente.
- **Status:** **CORRIGIDO**

## WARNINGS

### 2. Unvalidated external URLs in purchase attachments
- **Objeto exato:** `window.open` e `PurchaseAttachments.tsx`
- **Arquivo:** `src/utils/urlSecurity.ts`, `fix-urls.cjs` -> Múltiplos componentes React.
- **Causa:** Componentes consumiam strings do banco ou props de link e abriam `window.open(link, '_blank')` diretamente.
- **Correção:** Helper `openSecureWindow` central criado para validar protocolo (`https://` ou local dev), sanitizar path, barrar credenciais no path e impedir `javascript:` schemas.
- **Teste Positivo:** Abriu URL legada https:// válida e abriu signedUrl interna.
- **Teste Negativo:** Tentativa de injetar `javascript:alert(1)` bloqueada, e `data:` bloqueado.
- **Status:** **CORRIGIDO**

### 3. Approver user IDs exposed to all authenticated users
- **Objeto exato:** `public.approval_requests` e `public.approval_flow_steps`
- **Arquivo:** `20260724110100_sprint15_007_sensitive_data_rls.sql`
- **Causa:** Tabelas administrativas legíveis abertamente via GraphQL/PostgREST.
- **Correção:** RLS aplicado para leitura estrita. Adição de RPC `get_my_approval_queue` (para aprovadores) e `get_request_approval_status` (para acompanhamento).
- **Teste Positivo:** Usuário com permissões (ou na fila) pode ler seu fragmento de dados.
- **Teste Negativo:** Consulta GET irrestrita bloqueada (0 rows).
- **Status:** **CORRIGIDO**

### 4. Candidate upload portal trusts client-declared file type
- **Objeto exato:** Edge Function `public-documents-submit`
- **Arquivo:** `supabase/functions/public-documents-submit/index.ts`, `20260724110300_sprint15_009_storage_security.sql`
- **Causa:** Servia `signedUploadUrl` confiando no mime/type do form client.
- **Correção:** Edge function modificada para receber `multipart/form-data`, extrair array buffer do arquivo, validar "magic bytes" reais, renomear com Random UUID limitando extensões mapeadas, e salvar via server-side Bypass para o Storage.
- **Teste Positivo:** Envio de PDF real (iniciando em `%PDF`) é aceito e armazenado em path randômico.
- **Teste Negativo:** Envio de PDF falso (extensão .pdf mas corpo executável) rejeitado.
- **Status:** **CORRIGIDO**

### 5. Role assignments visible to all authenticated users
- **Objeto exato:** `public.user_role_assignments`
- **Arquivo:** `20260724110100_sprint15_007_sensitive_data_rls.sql`
- **Causa:** RLS ausente ou com policy aberta em tabelas de relacionamento RBAC.
- **Correção:** RLS reescrito para permitir leitura apenas pelo próprio id ou admin. GraphQL omission. RPC `get_my_permissions` extraída para uso front.
- **Status:** **CORRIGIDO**

### 6. All employee emails and names readable by any authenticated user
- **Objeto exato:** `public.profiles`
- **Arquivo:** `20260724110100_sprint15_007_sensitive_data_rls.sql`
- **Causa:** Qualque autenticado podia escanear todos os e-mails e perfis (mesmo de inativos).
- **Correção:** Policy `Users can read own profile` definida e view segura `vw_employee_directory` extraída sem metadados sensíveis para os loaders (sem emails).
- **Status:** **CORRIGIDO**

### 7 & 8. Public / Signed-In Can Execute SECURITY DEFINER Function
- **Objeto exato:** Helpers como `has_role`, `has_permission`, `start_approval_flow`
- **Arquivo:** `20260724110200_sprint15_008_function_grants_graphql.sql`
- **Causa:** Default Grants de PostgreSQL concedem `EXECUTE` genérico no public schema.
- **Correção:** `REVOKE EXECUTE ... FROM PUBLIC` implementado, além da conversão de funções puramente de leitura em `SECURITY INVOKER` reduzindo escopo abusivo de context elevation.
- **Status:** **CORRIGIDO**

### 9 & 10. Public / Signed-In Can See Object in GraphQL Schema
- **Objeto exato:** Schema Reflection
- **Arquivo:** `20260724110200_sprint15_008_function_grants_graphql.sql`
- **Causa:** `pg_graphql` reflete todos os objetos em `public` com acessibilidade.
- **Correção:** Tabelas RBAC e fluxos suprimidas do GraphQL Schema via diretiva COMMENT `@graphql({"omit": true})`.
- **Status:** **CORRIGIDO**

## CONFIGURAÇÕES MANUAIS DE PRODUÇÃO (BLOCKERS EXECUTIVOS)
Vide `MANUAL_PRODUCTION_SECURITY_SETTINGS.md` (Pendente documentar proteção contra senhas vazadas no dashboard oficial).
