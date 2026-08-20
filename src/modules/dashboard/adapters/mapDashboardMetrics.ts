/**
 * mapDashboardMetrics.ts
 *
 * CAMADA: Adapter
 *
 * Responsabilidade: traduzir o CONTRATO REAL de `get_dashboard_metrics()`
 * para a forma consumida pelos blocos de métricas do Dashboard.
 *
 * Contrato real da RPC (fonte única de verdade):
 *   {
 *     abastecimento: { total, em_aprovacao, aprovados, aguardando_fotos,
 *                      revisao_administrativa, valor_total },
 *     diarias:       { total, em_aprovacao, programadas, em_verificacao,
 *                      aguardando_pagamento, valor_total },
 *     reembolsos:    { total, em_aprovacao, aguardando_pagamento, valor_total },
 *     admission:     { total, em_andamento, concluidas, active_cost },
 *     purchases:     { total, em_aprovacao, aguardando_oc, aguardando_pagamento,
 *                      aguardando_entrega, entregue, divergencia, valor_total },
 *     terminations:  { total, em_aprovacao, aprovado, desligamento_concluido }
 *   }
 *
 * Regras desta camada:
 *  - NUNCA inventar zeros quando a RPC falha (a query deve lançar o erro).
 *  - Zero verdadeiro continua sendo zero verdadeiro.
 */

export interface RawDashboardMetrics {
  abastecimento?: Record<string, number> | null;
  diarias?: Record<string, number> | null;
  reembolsos?: Record<string, number> | null;
  admission?: Record<string, number> | null;
  purchases?: Record<string, number> | null;
  terminations?: Record<string, number> | null;
}

export interface DashboardMetricsView {
  /** Consolidado Abastecimento + Diária + Reembolso (módulos operados via fuel_requests) */
  fuel: {
    total: number;
    pendentes: number;
    aprovados: number;
    aguardando_pagamento: number;
    em_revisao_admin: number;
    valor_total: number;
  };
  admission: {
    total: number;
    em_andamento: number;
    concluidas: number;
    active_cost: number;
  };
  purchases: {
    total: number;
    abertas: number;
    aprovadas: number;
    valor_total: number;
  };
  terminations: {
    total: number;
    em_aprovacao: number;
    concluidos: number;
  };
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function mapDashboardMetrics(raw: RawDashboardMetrics): DashboardMetricsView {
  const ab = raw.abastecimento ?? {};
  const di = raw.diarias ?? {};
  const re = raw.reembolsos ?? {};
  const ad = raw.admission ?? {};
  const pu = raw.purchases ?? {};
  const te = raw.terminations ?? {};

  return {
    fuel: {
      total: n(ab.total) + n(di.total) + n(re.total),
      pendentes: n(ab.em_aprovacao) + n(di.em_aprovacao) + n(re.em_aprovacao),
      aprovados: n(ab.aprovados) + n(di.programadas),
      aguardando_pagamento: n(di.aguardando_pagamento) + n(re.aguardando_pagamento),
      em_revisao_admin: n(ab.revisao_administrativa) + n(di.em_verificacao),
      valor_total: n(ab.valor_total) + n(di.valor_total) + n(re.valor_total),
    },
    admission: {
      total: n(ad.total),
      em_andamento: n(ad.em_andamento),
      concluidas: n(ad.concluidas),
      active_cost: n(ad.active_cost),
    },
    purchases: {
      total: n(pu.total),
      abertas:
        n(pu.em_aprovacao) + n(pu.aguardando_oc) + n(pu.aguardando_pagamento) +
        n(pu.aguardando_entrega) + n(pu.divergencia),
      aprovadas: n(pu.entregue),
      valor_total: n(pu.valor_total),
    },
    terminations: {
      total: n(te.total),
      em_aprovacao: n(te.em_aprovacao),
      concluidos: n(te.desligamento_concluido),
    },
  };
}
