/**
 * recentActivityLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: retornar as últimas 30 transições de status
 * do sistema, lendo da tabela status_history, ordenadas por data
 * decrescente. Sem scroll infinito.
 *
 * Nota: Lê apenas de status_history por ora. No Sprint 10, quando
 * houver mais módulos ativos, esta função será expandida para
 * agregar de approval_history e outros eventos — tornando-se o
 * ActivityService definitivo.
 *
 * Padrão: Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';

export interface ActivityItem {
  id: string;
  entity_id: string;
  entity_type: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
  actor_name: string | null;
  /** Rota de navegação para o item, se disponível */
  route: string | null;
}

function resolveRoute(entityType: string, entityId: string): string | null {
  if (entityType === 'fuel_requests') return `/fleet/${entityId}`;
  if (entityType === 'admission_requests') return `/admissions/${entityId}`;
  // Compras — desabilitado na Sprint 13.9. Reativar na Sprint 14.
  return null;
}

export async function loadRecentActivity(): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('status_history')
    .select(`
      id,
      entity_id,
      entity_type,
      from_status,
      to_status,
      created_at,
      profiles:changed_by(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;

  return (data || []).map((row: any): ActivityItem => ({
    id: row.id,
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    from_status: row.from_status ?? null,
    to_status: row.to_status,
    created_at: row.created_at,
    actor_name: row.profiles?.full_name ?? null,
    route: resolveRoute(row.entity_type, row.entity_id),
  }));
}
