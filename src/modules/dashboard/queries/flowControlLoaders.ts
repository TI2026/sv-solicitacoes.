/**
 * flowControlLoaders.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: isolar consultas de dados do componente FlowControlPanel,
 * garantindo aderência à arquitetura de Component → Hook → Loader → Supabase.
 */

import { supabase } from '@/integrations/supabase/client';

export async function loadFuelFluxos() {
  const { data, error } = await supabase
    .from('fuel_requests')
    .select('id, valor, status, created_at, type, profiles!fuel_requests_requester_user_id_fkey(full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function loadAdmFluxos() {
  const { data, error } = await supabase
    .from('admission_requests')
    .select('id, status, cargo_funcao, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
