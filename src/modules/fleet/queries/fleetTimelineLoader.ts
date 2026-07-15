/**
 * fleetTimelineLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade única: consultar o Supabase e montar o array de TimelineEvent.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA importar React, Hooks ou QueryClient.
 *  - NUNCA gerenciar estado, cache ou invalidações.
 *  - NUNCA conter regras de negócio além da montagem do modelo de dados.
 *
 * A função principal (loadFleetTimeline) é composta por sub-funções menores e
 * testáveis individualmente:
 *   loadHistory()
 *   loadApprovalEvents()
 *   loadUsers()
 *   mergeTimeline()
 *
 * Padrão arquitetural:
 *   Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import { FUEL_STATUS_LABELS } from '@/lib/constants';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  at: string;
  kind: 'created' | 'status' | 'approval' | 'oc' | 'payment';
  title: string;
  detail?: string | null;
  actor?: string | null;
  toStatus?: string;
  fromStatus?: string | null;
  icon?: 'send' | 'oc' | 'payment' | 'approve' | 'reject' | 'return' | 'sparkles' | 'clock';
}

export interface FleetTimelineParams {
  requestId: string;
  req: any;
  approvalRequestId?: string;
}

const APPROVAL_ICON: Record<string, TimelineEvent['icon']> = {
  approved: 'approve',
  rejected: 'reject',
  returned: 'return',
};

// ─── Sub-funções testáveis ────────────────────────────────────────────────────

/**
 * Carrega o histórico de transições de status para um request específico.
 */
export async function loadHistory(requestId: string) {
  const { data, error } = await supabase
    .from('status_history')
    .select('id, from_status, to_status, changed_by, created_at, reason')
    .eq('entity_id', requestId)
    .eq('entity_type', 'fuel_requests')
    .eq('module', 'fleet')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as any[];
}

/**
 * Carrega os steps de aprovação que já foram executados (com action_at preenchido).
 */
export async function loadApprovalEvents(approvalRequestId: string) {
  const { data, error } = await supabase
    .from('approval_request_steps')
    .select('id, step_order, status, action_at, comments, approver_user_id, profiles:approver_user_id(full_name)')
    .eq('approval_request_id', approvalRequestId)
    .order('step_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as any[];
}

/**
 * Carrega os perfis (nomes) de um conjunto de user IDs.
 * Retorna um Map de id → full_name para lookup eficiente.
 */
export async function loadUsers(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (error) throw error;
  return new Map((data ?? []).map((p: any) => [p.id, p.full_name]));
}

/**
 * Monta o array final de TimelineEvent a partir das fontes de dados brutas.
 * Pura — sem chamadas ao Supabase. Testável com mocks.
 */
export function mergeTimeline({
  requestId,
  req,
  history,
  steps,
  nameMap,
}: {
  requestId: string;
  req: any;
  history: any[];
  steps: any[];
  nameMap: Map<string, string>;
}): TimelineEvent[] {
  const all: TimelineEvent[] = [];

  // Evento de criação
  if (req?.created_at) {
    all.push({
      id: `created-${requestId}`,
      at: req.created_at,
      kind: 'created',
      title: 'Solicitação criada',
      actor: req.profiles?.full_name ?? null,
      icon: 'sparkles',
    });
  }

  // Transições de status
  for (const h of history) {
    let icon: TimelineEvent['icon'] = 'clock';
    if (h.to_status === 'enviado') icon = 'send';
    else if (h.to_status === 'aguardando_oc') icon = 'oc';
    else if (h.to_status === 'aguardando_pagamento') icon = 'oc';
    else if (h.to_status === 'pago') icon = 'payment';
    else if (h.to_status === 'concluido' || h.to_status === 'aprovado') icon = 'approve';
    else if (h.to_status === 'reprovado') icon = 'reject';
    else if (h.to_status === 'retornado') icon = 'return';

    all.push({
      id: `h-${h.id}`,
      at: h.created_at,
      kind: 'status',
      title: FUEL_STATUS_LABELS[h.to_status] || h.to_status,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      detail: h.reason,
      actor: h.changed_by ? nameMap.get(h.changed_by) ?? 'Sistema' : 'Sistema',
      icon,
    });
  }

  // Ações de approval steps (apenas steps já executados)
  for (const s of steps) {
    if (!s.action_at || s.status === 'pending') continue;
    all.push({
      id: `s-${s.id}`,
      at: s.action_at,
      kind: 'approval',
      title: `Etapa ${s.step_order} · ${
        s.status === 'approved' ? 'Aprovada' :
        s.status === 'rejected' ? 'Recusada' :
        s.status === 'returned' ? 'Devolvida' :
        s.status
      }`,
      detail: s.comments,
      actor: s.profiles?.full_name ?? 'Aprovador',
      icon: APPROVAL_ICON[s.status] ?? 'clock',
    });
  }

  // Marcadores de OC e pagamento a partir do req (fallback defensivo)
  if (req?.oc_number) {
    const hasOcEvent = history.some(
      (h) => h.to_status === 'aguardando_oc' || h.to_status === 'aguardando_pagamento'
    );
    if (!hasOcEvent) {
      all.push({
        id: `oc-${requestId}`,
        at: req.updated_at || req.created_at,
        kind: 'oc',
        title: `OC registrada: ${req.oc_number}`,
        detail: req.oc_notes,
        icon: 'oc',
      });
    }
  }

  if (req?.paid_at) {
    all.push({
      id: `paid-${requestId}`,
      at: req.paid_at,
      kind: 'payment',
      title: 'Pagamento confirmado',
      detail: req.payment_notes,
      icon: 'payment',
    });
  }

  // Ordenação cronológica inversa (mais recente primeiro)
  all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return all;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Carrega e monta a timeline completa de uma solicitação.
 * Orquestra as sub-funções testáveis acima.
 */
export async function loadFleetTimeline({
  requestId,
  req,
  approvalRequestId,
}: FleetTimelineParams): Promise<TimelineEvent[]> {
  const [history, steps] = await Promise.all([
    loadHistory(requestId),
    approvalRequestId
      ? loadApprovalEvents(approvalRequestId)
      : Promise.resolve([] as any[]),
  ]);

  const userIds = [...new Set(history.filter((h) => h.changed_by).map((h) => h.changed_by))];
  const nameMap = await loadUsers(userIds);

  return mergeTimeline({ requestId, req, history, steps, nameMap });
}
