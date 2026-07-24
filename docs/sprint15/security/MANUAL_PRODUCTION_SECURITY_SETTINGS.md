# MANUAL HOSTED CONFIGURATION — BLOCKER BEFORE PRODUCTION

Conforme as resoluções de segurança do Sprint 15.1, as seguintes configurações hospedadas não podem ser manipuladas via migrations locais ou Git, mas são **OBRIGATÓRIAS** para o painel de administração do Lovable / Supabase antes do Go-Live em produção:

### 1. Leaked Password Protection
- **O que fazer:** Acessar o dashboard do projeto no Supabase > Settings > Auth.
- **Ação:** Ativar a flag "Enable Leaked Password Protection" (e.g., integração HIBP).
- **Motivo:** Protege contra credential stuffing impedindo senhas reconhecidas em vazamentos globais, sanando o finding "Leaked Password Protection Disabled".

### 2. Configuração de Complexidade de Senhas
- **Ação:** No mesmo painel de Auth, assegurar que a "Minimum Password Length" seja pelo menos 8 (recomendado 12).
- **Ação:** (Se disponível) forçar requisitos mistos de complexidade.

### 3. Edge Functions Secret/Environment Keys
- **Ação:** Atualizar a variável de ambiente `SUPABASE_SERVICE_ROLE_KEY` na hospedagem. O uso de tokens Service Role só é feito server-side (Deno Edge Functions) e nunca vazado ao cliente web.

---
**Status Local:** *Desconsiderado para a CLI local. Mapeado para auditoria final remota.*
