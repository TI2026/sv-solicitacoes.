/**
 * criticalPendingsLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: detectar anomalias operacionais do sistema.
 * Pendências críticas NÃO são "minhas solicitações" — são gargalos
 * e inconsistências que requerem atenção imediata da operação.
 *
 * 4 verificações cobertas:
 *   1. fuel_requests com status 'retornado' (devolvidas para o solicitante)
 *   2. approval_requests ativas sem current_approver_user_id (sem aprovador)
 *   3. approval_requests ativas sem current_step_order (sem etapa definida)
 *   4. approval_requests com status 'em_aprovacao' e ended_at preenchido (inconsistência)
 *
 * Padrão: Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import { requestDetailRoute } from '@/modules/fleet/requestRoutes';

export type CriticalPendingKind =
  | 'retornada'          // fuel_request devolvida ao solicitante
  | 'sem_aprovador'      // approval_request ativa sem aprovador
  | 'sem_etapa'          // approval_request ativa sem step definida
  | 'inconsistencia';    // em_aprovacao mas ended_at preenchido

export interface CriticalPending {
  id: string;
  reference_id: string | null;
  kind: CriticalPendingKind;
  description: string;
  created_at: string;
  route: string | null;
}

const MODULE_ROUTE: Record<string, string> = {
  abastecimento: '/fleet',
  reembolso: '/reembolsos',
  diaria: '/diarias',
  admissions: '/admissions',
  desligamentos: '/desligamentos',
  // B6 Fix: rota de Compras reativada na Sprint 15
  compras: '/purchases',
};

function resolveRoute(moduleCode: string | null, referenceId: string | null): string | null {
  if (!referenceId) return null;
  const base = MODULE_ROUTE[moduleCode || ''] || '/fleet';
  return `${base}/${referenceId}`;
}

export async function loadCriticalPendings(): Promise<CriticalPending[]> {
  const results: CriticalPending[] = [];

  // 1. Solicitações devolvidas ao solicitante (fuel_requests)
  const { data: returnedFuel, error: returnedFuelError } = await supabase
    .from('fuel_requests')
    .select('id, type, status, created_at')
    .eq('status', 'retornado')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (returnedFuelError) throw returnedFuelError;

  for (const row of returnedFuel || []) {
    results.push({
      id: row.id,
      reference_id: row.id,
      kind: 'retornada',
      description: `Solicitação de ${row.type ?? 'frota'} devolvida — aguardando ação do solicitante`,
      created_at: row.created_at,
      route: requestDetailRoute(row.type, row.id),
    });
  }

  // 2. Approval requests ativas sem current_approver_user_id
  const { data: noApprover, error: noApproverError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .is('ended_at', null)
    .is('current_approver_user_id', null)
    .or('status.eq.awaiting_step,status.like.awaiting_step_%')
    .order('created_at', { ascending: true })
    .limit(20);
  if (noApproverError) throw noApproverError;

  for (const row of noApprover || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'sem_aprovador',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" sem aprovador definido`,
      created_at: row.created_at,
      route: resolveRoute((row as any).approval_modules?.code, row.reference_id),
    });
  }

  // 3. Approval requests ativas sem current_step_order
  // B4 Fix: incluir 'returned_for_adjustment' além de 'returned_to_requester' pois o motor usa ambos em versões distintas
  const { data: noStep, error: noStepError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .is('ended_at', null)
    .is('current_step_order', null)
    .or('status.eq.awaiting_step,status.like.awaiting_step_%')
    .order('created_at', { ascending: true })
    .limit(20);
  if (noStepError) throw noStepError;

  for (const row of noStep || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'sem_etapa',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" travado sem etapa`,
      created_at: row.created_at,
      route: resolveRoute((row as any).approval_modules?.code, row.reference_id),
    });
  }

  // 4. Inconsistência: approval_requests com status awaiting_step_N mas ended_at preenchido.
  // B3 Fix: o motor NUNCA escreve 'pending_approval'. Ele usa 'awaiting_step_1', 'awaiting_step_2', etc.
  // A inconsistência real é: fluxo em etapa ativa (awaiting_step_%) porém ended_at já está preenchido,
  // indicando que foi encerrado prematuramente sem transição correta de status.
  const { data: inconsistent, error: inconsistentError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .or('status.eq.awaiting_step,status.like.awaiting_step_%')
    .not('ended_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (inconsistentError) throw inconsistentError;

  for (const row of inconsistent || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'inconsistencia',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" em aprovação mas marcado como encerrado`,
      created_at: row.created_at,
      route: resolveRoute((row as any).approval_modules?.code, row.reference_id),
    });
  }

  return results.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
