/**
 * approvalV2Loader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: consultar o backend do Motor V2 (health de configuração,
 * status de cutover e setores com responsável/substituto).
 *
 * Regras: sem React, sem estado, sem cache. Apenas consulta e retorno tipado.
 */

import { supabase } from '@/integrations/supabase/client';

export type HealthStatus = 'ready' | 'warning' | 'blocked';

export interface V2StepHealth {
  module_code: string;
  module_name: string;
  flow_id: string;
  flow_name: string;
  flow_active: boolean;
  step_id: string;
  step_order: number;
  step_code: string;
  step_name: string;
  step_kind: string | null;
  completion_action: string | null;
  assignment_mode: 'person' | 'sector';
  primary_user_id: string | null;
  primary_user_name: string | null;
  substitute_user_id: string | null;
  substitute_user_name: string | null;
  sector_id: string | null;
  sector_name: string | null;
  sector_responsible_name: string | null;
  sector_substitute_name: string | null;
  sla_hours: number | null;
  status: HealthStatus;
  reason: string | null;
}

export interface V2ModuleHealth {
  module_code: string;
  module_name: string;
  flow_id: string;
  flow_name: string;
  flow_active: boolean;
  steps_total: number;
  status: HealthStatus;
}

export interface V2Health {
  overall: HealthStatus;
  flows_total: number;
  steps_total: number;
  template: {
    ok: boolean;
    expected_flows: number;
    expected_steps: number;
    missing_steps: Array<{ module_code: string; step_order: number; step_code: string }>;
    extra_steps: Array<{ module_code: string; step_order: number; step_code: string }>;
    divergent_steps: Array<{ module_code: string; step_order: number; expected: any; found: any }>;
  };
  modules: V2ModuleHealth[];
  steps: V2StepHealth[];
}

export interface V2ActiveLegacyRequest {
  approval_request_id: string;
  module_code: string;
  entity_id: string;
  flow_name: string;
  flow_version: string;
  requester_user_id: string;
  current_step_order: number | null;
  current_approver_user_id: string | null;
  created_at: string;
  status: string;
}

export interface V2CutoverStatus {
  health: V2Health;
  active_v1_requests: V2ActiveLegacyRequest[];
  active_v1_count: number;
  can_activate: boolean;
}

export async function loadApprovalV2Health(): Promise<V2Health> {
  const { data, error } = await (supabase as any).rpc('get_approval_configuration_health');
  if (error) throw error;
  if (data?.error === 'FORBIDDEN_MASTER_ONLY') {
    throw new Error('Somente o perfil Master pode visualizar a configuração de aprovação.');
  }
  if (data?.error) throw new Error(data.error);
  return data as V2Health;
}

export async function loadV2CutoverStatus(): Promise<V2CutoverStatus | null> {
  const { data, error } = await (supabase as any).rpc('get_v2_cutover_status');
  if (error) throw error;
  if (data?.error) return null; // usuário não é Master
  return data as V2CutoverStatus;
}

export interface SectorOption {
  id: string;
  name: string;
  responsible_name: string | null;
  substitute_name: string | null;
}

export async function loadSectorsWithResponsibles(): Promise<SectorOption[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('id, name, responsible:responsible_user_id(full_name), substitute:substitute_user_id(full_name)')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    responsible_name: s.responsible?.full_name ?? null,
    substitute_name: s.substitute?.full_name ?? null,
  }));
}

export async function saveStepAssignment(params: {
  stepId: string;
  assignmentMode: 'person' | 'sector';
  primaryUserId?: string | null;
  substituteUserId?: string | null;
  sectorId?: string | null;
  slaHours: number;
}): Promise<void> {
  const { data, error } = await (supabase as any).rpc('save_approval_step_assignment', {
    p_step_id: params.stepId,
    p_assignment_mode: params.assignmentMode,
    p_primary_user_id: params.primaryUserId ?? null,
    p_substitute_user_id: params.substituteUserId ?? null,
    p_sector_id: params.sectorId ?? null,
    p_sla_hours: params.slaHours,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Cutover real do Motor V2 (Master-only, protegido por advisory lock no backend).
 * Nunca força ativação: o backend recusa enquanto houver blockers.
 */
export async function activateApprovalV2(): Promise<{ activated: boolean; message?: string }> {
  const { data, error } = await (supabase as any).rpc('activate_approval_v2');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('ACTIVATION_NO_RESULT');
  if (data.error) throw new Error(data.error);
  return { activated: data.activated !== false, message: data.message ?? undefined };
}

