/**
 * myRequestsLoader.ts
 *
 * CAMADA: Loader (Query)
 *
 * Responsabilidade: agregar solicitações do usuário logado de todos os
 * módulos ativos. Cada módulo tem sua sub-função isolada — facilitando
 * a migração para RequestAggregator/Registry no Sprint 10.
 *
 * Padrão: Component → Hook → Loader (este arquivo) → Supabase
 */

import { supabase } from '@/integrations/supabase/client';

export type RequestGroup = 'em_aprovacao' | 'devolvida' | 'concluida' | 'cancelada' | 'outra';

export interface MyRequest {
  id: string;
  type: string;           // 'abastecimento' | 'reembolso' | 'diaria' | 'admissions' ...
  module: string;         // label human-readable
  status: string;
  group: RequestGroup;
  created_at: string;
  valor?: number | null;
  description?: string | null;
  route: string;
}

// ─── Sub-funções por módulo ───────────────────────────────────────────────────
// No Sprint 10, este array de funções se tornará o RequestRegistry.

async function fetchFuelRequests(userId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from('fuel_requests')
    .select('id, type, status, created_at, valor, description')
    .eq('requester_user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  const MODULE_LABELS: Record<string, string> = {
    abastecimento: 'Abastecimento',
    reembolso: 'Reembolso',
    diaria: 'Diária',
  };

  return (data || []).map((row: any): MyRequest => ({
    id: row.id,
    type: row.type,
    module: MODULE_LABELS[row.type] ?? row.type,
    status: row.status,
    group: classifyStatus(row.status),
    created_at: row.created_at,
    valor: row.valor,
    description: row.description,
    route: `/fleet/${row.id}`,
  }));
}

async function fetchAdmissionRequests(userId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from('admission_requests')
    .select('id, status, created_at, cargo_funcao')
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data || []).map((row: any): MyRequest => ({
    id: row.id,
    type: 'admissions',
    module: 'Admissão',
    status: row.status,
    group: classifyAdmissionStatus(row.status),
    created_at: row.created_at,
    valor: null,
    description: row.cargo_funcao,
    route: `/admissions/${row.id}`,
  }));
}

async function fetchPurchaseRequests(userId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('id, status, created_at, estimated_value, description')
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data || []).map((row: any): MyRequest => ({
    id: row.id,
    type: 'compras',
    module: 'Compras',
    status: row.status,
    group: classifyPurchaseStatus(row.status),
    created_at: row.created_at,
    valor: row.estimated_value,
    description: row.description,
    route: `/purchases/${row.id}`,
  }));
}

async function fetchTerminationRequests(userId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from('termination_requests' as any)
    .select('id, status, created_at, collaborator:collaborators(full_name)')
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data || []).map((row: any): MyRequest => ({
    id: row.id,
    type: 'desligamentos',
    module: 'Desligamento',
    status: row.status,
    group: classifyTerminationStatus(row.status),
    created_at: row.created_at,
    valor: null,
    description: row.collaborator?.full_name ?? null,
    route: `/desligamentos/${row.id}`,
  }));
}

// ─── Classificadores de grupo ──────────────────────────────────────────────────────

function classifyStatus(status: string): RequestGroup {
  if (['em_aprovacao', 'em_revisao', 'em_revisao_admin', 'enviado'].includes(status)) return 'em_aprovacao';
  if (['retornado'].includes(status)) return 'devolvida';
  if (['concluido', 'pago', 'aprovado'].includes(status)) return 'concluida';
  if (['reprovado', 'encerrado'].includes(status)) return 'cancelada';
  return 'outra';
}

function classifyAdmissionStatus(status: string): RequestGroup {
  if (['concluido', 'registros_concluidos'].includes(status)) return 'concluida';
  if (['cancelado'].includes(status)) return 'cancelada';
  return 'em_aprovacao';
}

function classifyPurchaseStatus(status: string): RequestGroup {
  if (['em_aprovacao', 'aguardando_pagamento'].includes(status)) return 'em_aprovacao';
  if (['retornado'].includes(status)) return 'devolvida';
  if (['aprovado'].includes(status)) return 'concluida';
  if (['cancelado', 'rejeitado'].includes(status)) return 'cancelada';
  return 'outra';
}

function classifyTerminationStatus(status: string): RequestGroup {
  if (['desligamento_concluido', 'aprovado'].includes(status)) return 'concluida';
  if (['cancelado', 'reprovado'].includes(status)) return 'cancelada';
  if (['retornado'].includes(status)) return 'devolvida';
  return 'em_aprovacao';
}

// ─── Agregador principal ──────────────────────────────────────────────────────

export async function loadMyRequests(userId: string): Promise<MyRequest[]> {
  const [fuel, admissions, purchases, terminations] = await Promise.all([
    fetchFuelRequests(userId),
    fetchAdmissionRequests(userId),
    fetchPurchaseRequests(userId),
    fetchTerminationRequests(userId),
  ]);

  return [
    ...(Array.isArray(fuel) ? fuel : []),
    ...(Array.isArray(admissions) ? admissions : []),
    ...(Array.isArray(purchases) ? purchases : []),
    ...(Array.isArray(terminations) ? terminations : []),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
