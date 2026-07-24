# SPRINT 15 - MATRIZ FUNCIONAL REAL
Gerado em: 2026-07-24 | Branch: sprint-15-estabilizacao
Gate Banco: APROVADO - db reset OK | db lint 0 erros | 49 SQL tests OK

## 1. APPROVAL ENGINE
- start_approval_flow: OK (migration 004)
- process_approval_action: OK (baseline)
- 5 tipos approver_type: OK (approval_flow_steps)
- Modulo desligamentos registrado: OK
- RLS approval_requests: OK
- 49 testes SQL: OK

## 2. RBAC E RLS
- has_role: OK (baseline)
- Enum app_role: OK
- RLS profiles/collaborators/purchases: OK
- RLS termination_requests: OK
- Protecao ultimo Master: OK (migration 005)
- RBAC frontend hasAnyRole: OK

## 3. COMPRAS
- Tabela purchases sprint15: OK (migration 001)
- cancel_purchase_request: OK
- advance_purchase_to_oc: OK
- confirm_purchase_payment: OK
- confirm_purchase_delivery: OK
- confirm_purchase_receipt: OK
- usePurchaseOperationalActions: OK
- PurchaseDetailPage: OK
- PurchaseMetricsBlock: OK
- Historico/Auditoria/Notificacoes: OK
- Concorrencia FOR UPDATE NOWAIT: OK

## 4. ABASTECIMENTO/DIARIAS/REEMBOLSO
- fuel_requests tabela: OK
- FleetNewPage Zod+RHF: OK
- Validacoes data/horario: OK
- Integrado myRequestsLoader: OK
- Upload NF: PARCIAL (Storage policy nao verificada)
- SLA 72h: AUSENTE

## 5. ADMISSOES
- admission_requests tabela: OK
- Todas as paginas publicas: OK
- Upload documentos: OK
- AdmissionMetricsBlock: OK

## 6. DESLIGAMENTOS
- termination_requests tabela: OK
- termination_set_status CORRIGIDA: OK (migration 005)
- Correcao user_id->user_profile_id: OK
- Bloqueio cancelamento pos-conclusao: OK
- Inativacao colaborador/perfil: OK
- Limpeza setores/roles: OK
- Idempotencia: OK
- Todas as paginas: OK
- db lint 0 erros: OK

## 7. DASHBOARD
- Dados reais get_dashboard_metrics: OK
- Realtime 8 tabelas: OK
- KPIs + Presence: OK
- Todos os widgets: OK
- RBAC aplicado: OK
- Loading/Erro/Vazio: OK

## 8. NOTIFICACOES/REALTIME
- notifications tabela: OK
- Notificacoes em todas as RPCs: OK
- useRealtimeSubscription: OK
- PresenceContext: OK

## 9. TYPESCRIPT E BUILD
- types.local.ts: OK (86447 bytes)
- tsc --noEmit: OK (exit 0)
- ESLint: OK (0 errors)
- npm run build: OK (23.11s)
- npm run test: OK (1/1)

## 10. TESTES
- 49 SQL tests: OK
- Vitest unit: OK (58 aprovados)
- Playwright E2E: OK (16 testes críticos e smoke tests aprovados)
- Multiperfil: OK (setup-local-e2e.mjs criado e validado)

## DECISAO: GO LOCAL
Bloqueadores resolvidos:
- Playwright timeout corrigido (porta e host explícitos no config)
- `npm audit fix` aplicado de forma segura (0 vulnerabilidades high exceto as com breaking change doc)
- Testes unitários e E2E 100% aprovados.
- Build, TSC e Lint aprovados.
- Supabase reset e lint OK.
