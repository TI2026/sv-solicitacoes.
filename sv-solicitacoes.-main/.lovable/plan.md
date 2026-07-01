# Fase 2 + Complementos Fase 1 — Plano de Execução

Escopo amplo (7 blocos + complemento backend). Vou executar em **ondas independentes** para reduzir risco e permitir validação intermediária. Cada onda é entregue, validada e somente depois sigo para a próxima.

## Onda 1 — BLOCO 0 (CRÍTICO BACKEND) + BLOCO F2 (Status visuais)

Base para tudo o que vem depois.

**Backend (migration):**
- Atualizar `fuel_set_status`:
  - `aguardando_pagamento` → liberar para papel `compras`
  - `pago` → liberar para papel `financeiro`
  - Remover bloco duplicado de notificação `em_aprovacao` (spam global)
  - Notificações de `enviado` lendo apenas `user_role_assignments` (remover legado `user_roles`)

**Frontend:**
- `usePermissionsData.ts` → `useEligibleApprovers`: remover leitura de `user_roles` legado, manter apenas `user_role_assignments` + `profiles.active`
- `src/lib/constants.ts` + `StatusBadge`: padronizar cores + ícones Lucide para todos os 13 status (F2). Centralizado para reuso nos blocos seguintes.

## Onda 2 — BLOCO G (Menu lateral)

- Reorganizar `AppLayout.tsx` em 3 grupos (Geral / Operacional / Sistema) com guards por papel
- Badges reativos (Realtime) em "Minhas Aprovações" (vermelho) e "Minhas Solicitações" (laranja para `retornado`)
- Rodapé com avatar, nome, papel formatado e indicador online (Presence)

## Onda 3 — BLOCO A (Dashboard: Minha Fila + Cards por perfil)

- Separar query "Minha Fila" (pessoal) vs "Visão Geral" (admin/diretoria/master)
- Card destaque "Minha Fila de Aprovação" no topo (âmbar, badge vermelho se >2 dias)
- Card "Pendências Urgentes" para admin (fuel_requests `enviado` >24h)
- Drawer (mobile) / Dialog (desktop) de aprovação rápida com botões Aprovar/Devolver/Recusar via `useProcessApproval`
- Métricas customizadas por perfil (colaborador/supervisor/financeiro/compras/rh/admin)

## Onda 4 — BLOCO F1, F3 (UX listagem e detalhes)

- Botões de ação rápida contextual no `FleetListPage` por status × papel
- Reorganizar `FleetDetailPage`: painel de ação no topo, dados laterais, anexos em grid 2×

## Onda 5 — BLOCO C (Abastecimento)

- Card "Revisor Responsável" + alerta se sem revisor
- Painel revisão hodômetro (KM real + checkbox + justificativa de divergência)
- Painel revisão NF (valor + checkbox + justificativa)
- Modal de visualização inline (imagem/PDF iframe, sem auto-download)
- Captura mobile nativa (`capture="environment"`) + preview antes do upload

## Onda 6 — BLOCO D (Reembolso)

- Checklist obrigatório pré-aprovação (4 itens, salvo em `review_notes` JSON)
- Justificativa obrigatória (mín 20 chars) para Recusa/Devolução + destaque visual
- Timeline cronológica completa (criação, encaminhamento, etapas, OC, pagamento)

## Onda 7 — BLOCO E (Diária)

- Barra de progresso visual 8 etapas (etapa atual pulsando, datas das vencidas)
- Painel OC para `aguardando_oc` (compras/admin)
- Painel Pagamento para `aguardando_pagamento` (financeiro/admin)
- Painel Encerramento para `pago` (admin)

## Onda 8 — BLOCO B (Veículos / Dashboard Frota)

- Indicadores consolidados no topo de `VehiclesAdminPage`
- Cálculo de consumo médio por veículo (ΔKM ÷ litros entre abastecimentos)
- Aba "Histórico de KM" com filtros placa + período
- Alertas: consumo anômalo (-25% da média) + sem abastecimento >30 dias

---

## Notas técnicas

- Regras invioláveis preservadas em todos os blocos (approval_request fonte única, `fuel_set_status` não aprova com fluxo ativo, return não encerra, diária respeita `aprovado → aguardando_oc`).
- `profiles.active = true` + cargo atribuído já enforced pela Fase 1.
- Versionamento de fluxo preservado.
- Reutilizo helpers existentes: `useProcessApproval`, `useIsMaster`, `AuthContext`, `getApproverTypeLabel`.

## Confirmação

Confirma que sigo nessa ordem **começando pela Onda 1 agora** (Bloco 0 backend + F2 visual)? Ou prefere ajustar a ordem (ex: priorizar A — Dashboard, ou G — Menu)?
