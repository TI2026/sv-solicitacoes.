# Débito Técnico Conhecido

Este documento registra os débitos técnicos conhecidos do projeto, suas origens e os sprints responsáveis pela correção.

---

## ESLint — `@typescript-eslint/no-explicit-any`

**Volume:** ~554 erros  
**Introduzido em:** Sprints anteriores à Sprint 6A  
**Descoberto em:** Validação técnica da Sprint 6A (build + lint)  
**Sprint responsável pela correção:** Sprint 8  

### Descrição
O projeto possui aproximadamente 554 erros de ESLint, predominantemente relacionados ao uso de `any` explícito em tipagens TypeScript (`@typescript-eslint/no-explicit-any`). Esses erros são anteriores à Sprint 6A e não fazem parte do escopo desta entrega.

A Sprint 6A **não introduziu nenhum novo erro** deste tipo — confirmado via diff de contagem de ocorrências antes e depois do commit `2f212d1`.

### Distribuição dos erros (principal)
- `FleetDetailContext.tsx` — `any` em hooks, handlers e tipos de retorno do Supabase
- `useApprovalAction.ts` — `any` no tipo de erro do `onError`
- Páginas (`DashboardPage`, `PermissionsPage`, `AuditLogsPage`, etc.)
- Edge Functions Supabase (`export-dashboard-report`, `epi-check-pending`, etc.)

### Causa raiz
A integração com o Supabase gera tipos genéricos que frequentemente requerem `any` como workaround temporário até a geração formal dos tipos via `supabase gen types`. A maioria dos usos é defensivo e não representa risco de runtime.

### Plano de resolução (Sprint 8)
1. Executar `supabase gen types typescript` para gerar tipos atualizados do banco.
2. Substituir `any` por tipos gerados onde possível.
3. Usar `unknown` com type guards para os casos restantes.
4. Habilitar `@typescript-eslint/no-explicit-any: warn` (de `error` para `warn`) durante a transição.

---

## Chunk size warning (Vite build)

**Volume:** 1 aviso  
**Chunk:** `index-CpGpXTfg.js` — 2,126 kB (minificado), 608 kB (gzip)  
**Sprint responsável:** Sprint 8 ou posterior  

### Descrição
O bundle principal excede 500 kB após minificação. O Vite recomenda code splitting via `import()` dinâmico ou `manualChunks`. Não representa risco funcional, mas impacta o tempo de carregamento inicial.
