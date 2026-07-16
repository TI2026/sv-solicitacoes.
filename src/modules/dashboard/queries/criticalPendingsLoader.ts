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

export async function loadCriticalPendings(): Promise<CriticalPending[]> {
  const results: CriticalPending[] = [];

  // 1. Solicitações devolvidas ao solicitante (fuel_requests)
  const { data: returnedFuel } = await supabase
    .from('fuel_requests')
    .select('id, type, status, created_at')
    .eq('status', 'retornado')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);

  for (const row of returnedFuel || []) {
    results.push({
      id: row.id,
      reference_id: row.id,
      kind: 'retornada',
      description: `Solicitação de ${row.type ?? 'frota'} devolvida — aguardando ação do solicitante`,
      created_at: row.created_at,
      route: `/fleet/${row.id}`,
    });
  }

  // 2. Approval requests ativas sem current_approver_user_id
  const { data: noApprover } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(name)')
    .is('ended_at', null)
    .is('current_approver_user_id', null)
    .order('created_at', { ascending: true })
    .limit(20);

  for (const row of noApprover || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'sem_aprovador',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" sem aprovador definido`,
      created_at: row.created_at,
      route: row.reference_id ? `/fleet/${row.reference_id}` : null,
    });
  }

  // 3. Approval requests ativas sem current_step_order
  const { data: noStep } = await supabase
    .from('approval_requests')
    .select('id, reference_id, status, created_at, approval_modules(name)')
    .is('ended_at', null)
    .is('current_step_order', null)
    .not('status', 'in', '("approved","rejected","returned_to_requester")')
    .order('created_at', { ascending: true })
    .limit(20);

  for (const row of noStep || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'sem_etapa',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" travado sem etapa`,
      created_at: row.created_at,
      route: row.reference_id ? `/fleet/${row.reference_id}` : null,
    });
  }

  // 4. Inconsistência: status 'em_aprovacao' com ended_at preenchido
  const { data: inconsistent } = await supabase
    .from('approval_requests')
    .select('id, reference_id, created_at, approval_modules(name)')
    .eq('status', 'pending_approval')
    .not('ended_at', 'is', null)
    .order('created_at', { ascending: true })
    .limit(20);

  for (const row of inconsistent || []) {
    results.push({
      id: row.id,
      reference_id: row.reference_id,
      kind: 'inconsistencia',
      description: `Fluxo "${(row as any).approval_modules?.name ?? 'desconhecido'}" em aprovação mas marcado como encerrado`,
      created_at: row.created_at,
      route: row.reference_id ? `/fleet/${row.reference_id}` : null,
    });
  }

  return results.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
