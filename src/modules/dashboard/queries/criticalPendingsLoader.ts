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
 *   2. approval_requests V2 aguardando etapa sem ator esperado
 *   3. approval_requests V2 aguardando etapa sem etapa definida
 *   4. approval_requests V2 aguardando etapa, mas encerradas
 *
 * Padrão: Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import { approvalModuleDetailRoute, requestDetailRoute } from '@/modules/fleet/requestRoutes';

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

function resolveRoute(moduleCode: string | null, referenceId: string | null): string | null {
  if (!referenceId) return null;
  return approvalModuleDetailRoute(moduleCode || '', referenceId);
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

  // 2. V2 somente: waiting_operational/returned não esperam aprovador.
  // Compatibilidade V1 permanece isolada no RPC get_my_approval_queue().
  const { data: noApprover, error: noApproverError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .is('ended_at', null)
    .is('current_approver_user_id', null)
    .eq('status', 'awaiting_step')
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

  // 3. V2 aguardando etapa sem current_step_order.
  const { data: noStep, error: noStepError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .is('ended_at', null)
    .is('current_step_order', null)
    .eq('status', 'awaiting_step')
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

  // 4. Inconsistência V2: fluxo aguardando etapa, mas já encerrado.
  const { data: inconsistent, error: inconsistentError } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(code, name)')
    .eq('status', 'awaiting_step')
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
