/**
 * diariaProgressLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade única: consultar o Supabase e retornar o mapa
 * de datas de transição de status para o progresso da Diária.
 *
 * Regras obrigatórias desta camada:
 *  - NUNCA importar React, Hooks ou QueryClient.
 *  - NUNCA gerenciar estado, cache ou invalidações.
 *  - NUNCA conter regras de negócio.
 *  - Apenas consultar, ordenar e retornar.
 *
 * Padrão arquitetural:
 *   Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Carrega o histórico de status de uma solicitação e retorna um mapa
 * de { [to_status]: created_at } com o timestamp da primeira ocorrência
 * de cada status. Usado pela DiariaProgressBar para exibir datas nas etapas.
 */
export async function loadDiariaStatusDates(requestId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('status_history')
    .select('to_status, created_at')
    .eq('entity_id', requestId)
    .eq('entity_type', 'fuel_requests')
    .eq('module', 'fleet')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data || []) {
    if (!map[row.to_status]) map[row.to_status] = row.created_at;
  }
  return map;
}
