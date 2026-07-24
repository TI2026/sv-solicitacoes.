# PLANO DE SEGUIMENTO (SPRINT 16) - SEGURANÇA E MELHORIA CONTÍNUA

Este documento lista os achados ignorados ou priorizados para o Sprint 16, a fim de não bloquear o release funcional atual (Sprint 15).

## 1. Monitoramento e Defesa Proativa
- **Leaked Password Protection:** Assegurar via configurações do Dashboard de Produção (Auth) que a proteção de senhas vazadas está ativada.
- **Rate Limiting em RPCs Abertas:** Implementar limitação de taxa estrita (rate limit via Edge Functions, Supabase WAF ou Cloudflare) para chamadas sensíveis, evitando ataques de força bruta, mesmo em funções que utilizam `SECURITY INVOKER`.

## 2. Refinamento de Storage e Uploads
- **Verificação Antivírus Server-Side:** Atualmente, a Edge Function verifica magic bytes e extensões. Recomenda-se integrar a Edge Function com uma API de varredura (ex: ClamAV) antes de enviar para o bucket privado `admissions`.
- **Public Links Temporários (Fleet/Compras):** Revisar as Edge Functions que servem links públicos temporários em outros módulos (ex: `fleet-create-signed-upload`) para garantir a mesma robustez implementada em `public-documents-submit`.

## 3. Limpeza de Legado e Auditoria React
- **Client-Side Role Checks:** Embora não sejam a fronteira de segurança real (RLS barra na API), substituir checagens puramente client-side por respostas consolidadas do server side (`get_my_permissions()`) pode reduzir vazamentos de metadados organizacionais no Payload JSON e reduzir bundle size.
- **Strict Content Security Policy (CSP):** Adicionar cabeçalhos de CSP e `X-Frame-Options` via Vercel Edge Headers ou regras de proxy hospedado (Supabase/Vercel) para prevenir clickjacking.

## 4. Evolução de Identidade (RBAC)
- **Role Assignments View:** Explorar uma estrutura de tabelas unificadas (App Roles x User Profiles) onde Perfis e Atribuições são estritamente isolados em schemas protegidos e expostos unicamente via Claims JWT customizadas.

---
*Gerado via Auditoria Lovable Hardening - Sprint 15.1*
