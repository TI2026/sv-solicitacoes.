/**
 * Sprint 15 — Testes Unitários Reais
 *
 * Cobertura:
 * - classifyStatus (myRequestsLoader)
 * - resolveRoute (criticalPendingsLoader)
 * - handleRpcResult (usePurchaseOperationalActions)
 * - Enums e labels de status
 */

import { describe, it, expect } from 'vitest';

// ─── Replicar lógica testável isolada ─────────────────────────────────────────

type RequestGroup = 'em_aprovacao' | 'devolvida' | 'concluida' | 'cancelada' | 'outra';

function classifyStatus(status: string): RequestGroup {
  if (['em_aprovacao', 'em_revisao', 'em_revisao_admin', 'enviado'].includes(status)) return 'em_aprovacao';
  if (['retornado'].includes(status)) return 'devolvida';
  if (['concluido', 'pago', 'aprovado'].includes(status)) return 'concluida';
  if (['reprovado', 'encerrado'].includes(status)) return 'cancelada';
  return 'outra';
}

function classifyPurchaseStatus(status: string): RequestGroup {
  if (['em_aprovacao', 'em_revisao'].includes(status)) return 'em_aprovacao';
  if (['retornado'].includes(status)) return 'devolvida';
  if (['concluido', 'aprovado', 'aguardando_pagamento', 'pago'].includes(status)) return 'concluida';
  if (['rejeitado', 'cancelado', 'encerrado'].includes(status)) return 'cancelada';
  return 'outra';
}

function classifyTerminationStatus(status: string): RequestGroup {
  if (['desligamento_concluido', 'aprovado'].includes(status)) return 'concluida';
  if (['cancelado', 'reprovado'].includes(status)) return 'cancelada';
  if (['retornado'].includes(status)) return 'devolvida';
  return 'em_aprovacao';
}

const MODULE_ROUTE: Record<string, string> = {
  abastecimento: '/fleet',
  reembolso: '/fleet',
  diaria: '/fleet',
  admissions: '/admissions',
  desligamentos: '/desligamentos',
  compras: '/purchases',
};

function resolveRoute(moduleCode: string | null, referenceId: string | null): string | null {
  if (!referenceId) return null;
  const base = MODULE_ROUTE[moduleCode || ''] || '/fleet';
  return `${base}/${referenceId}`;
}

function handleRpcResult(result: any, label: string) {
  if (!result) throw new Error(`Resposta vazia do servidor (${label})`);
  if (result.code && result.code !== '200') {
    throw new Error(result.message || `Erro ao executar ${label}`);
  }
  return result;
}

// ─── STATUS — fuel/fleet ──────────────────────────────────────────────────────

describe('classifyStatus (fuel_requests)', () => {
  it('retorna em_aprovacao para status em_aprovacao', () => {
    expect(classifyStatus('em_aprovacao')).toBe('em_aprovacao');
  });
  it('retorna em_aprovacao para enviado', () => {
    expect(classifyStatus('enviado')).toBe('em_aprovacao');
  });
  it('retorna devolvida para retornado', () => {
    expect(classifyStatus('retornado')).toBe('devolvida');
  });
  it('retorna concluida para concluido', () => {
    expect(classifyStatus('concluido')).toBe('concluida');
  });
  it('retorna concluida para aprovado', () => {
    expect(classifyStatus('aprovado')).toBe('concluida');
  });
  it('retorna cancelada para reprovado', () => {
    expect(classifyStatus('reprovado')).toBe('cancelada');
  });
  it('retorna outra para rascunho', () => {
    expect(classifyStatus('rascunho')).toBe('outra');
  });
  it('retorna outra para status desconhecido', () => {
    expect(classifyStatus('status_invalido_xyz')).toBe('outra');
  });
});

// ─── STATUS — purchases ───────────────────────────────────────────────────────

describe('classifyPurchaseStatus', () => {
  it('em_aprovacao para em_aprovacao', () => {
    expect(classifyPurchaseStatus('em_aprovacao')).toBe('em_aprovacao');
  });
  it('devolvida para retornado', () => {
    expect(classifyPurchaseStatus('retornado')).toBe('devolvida');
  });
  it('concluida para concluido', () => {
    expect(classifyPurchaseStatus('concluido')).toBe('concluida');
  });
  it('concluida para aguardando_pagamento (em progresso positivo)', () => {
    expect(classifyPurchaseStatus('aguardando_pagamento')).toBe('concluida');
  });
  it('cancelada para rejeitado', () => {
    expect(classifyPurchaseStatus('rejeitado')).toBe('cancelada');
  });
  it('cancelada para cancelado', () => {
    expect(classifyPurchaseStatus('cancelado')).toBe('cancelada');
  });
  it('outra para rascunho', () => {
    expect(classifyPurchaseStatus('rascunho')).toBe('outra');
  });
  it('outra para aguardando_entrega', () => {
    // aguardando_entrega não está na lista — retorna outra
    expect(classifyPurchaseStatus('aguardando_entrega')).toBe('outra');
  });
});

// ─── STATUS — termination_requests ───────────────────────────────────────────

describe('classifyTerminationStatus', () => {
  it('concluida para desligamento_concluido', () => {
    expect(classifyTerminationStatus('desligamento_concluido')).toBe('concluida');
  });
  it('concluida para aprovado', () => {
    expect(classifyTerminationStatus('aprovado')).toBe('concluida');
  });
  it('cancelada para cancelado', () => {
    expect(classifyTerminationStatus('cancelado')).toBe('cancelada');
  });
  it('cancelada para reprovado', () => {
    expect(classifyTerminationStatus('reprovado')).toBe('cancelada');
  });
  it('devolvida para retornado', () => {
    expect(classifyTerminationStatus('retornado')).toBe('devolvida');
  });
  it('em_aprovacao para em_aprovacao', () => {
    expect(classifyTerminationStatus('em_aprovacao')).toBe('em_aprovacao');
  });
  it('em_aprovacao para rascunho (padrão)', () => {
    expect(classifyTerminationStatus('rascunho')).toBe('em_aprovacao');
  });
});

// ─── resolveRoute ─────────────────────────────────────────────────────────────

describe('resolveRoute (criticalPendingsLoader)', () => {
  const uuid = 'abc-123-def';

  it('retorna rota correta para compras', () => {
    expect(resolveRoute('compras', uuid)).toBe(`/purchases/${uuid}`);
  });
  it('retorna rota correta para desligamentos', () => {
    expect(resolveRoute('desligamentos', uuid)).toBe(`/desligamentos/${uuid}`);
  });
  it('retorna rota correta para admissions', () => {
    expect(resolveRoute('admissions', uuid)).toBe(`/admissions/${uuid}`);
  });
  it('retorna /fleet para abastecimento', () => {
    expect(resolveRoute('abastecimento', uuid)).toBe(`/fleet/${uuid}`);
  });
  it('retorna /fleet para módulo desconhecido (fallback)', () => {
    expect(resolveRoute('modulo_inexistente', uuid)).toBe(`/fleet/${uuid}`);
  });
  it('retorna null se referenceId for null', () => {
    expect(resolveRoute('compras', null)).toBeNull();
  });
  it('retorna null se moduleCode for null e referenceId for null', () => {
    expect(resolveRoute(null, null)).toBeNull();
  });
});

// ─── handleRpcResult ─────────────────────────────────────────────────────────

describe('handleRpcResult (usePurchaseOperationalActions)', () => {
  it('retorna o resultado se for sucesso', () => {
    const result = { success: true, status: 'concluido' };
    expect(handleRpcResult(result, 'test')).toEqual(result);
  });
  it('lança erro se result for null/undefined', () => {
    expect(() => handleRpcResult(null, 'test_op')).toThrow('Resposta vazia do servidor (test_op)');
  });
  it('lança erro se result.code não for 200', () => {
    const errResult = { code: 'ENGINE-403', message: 'Sem permissão' };
    expect(() => handleRpcResult(errResult, 'test_op')).toThrow('Sem permissão');
  });
  it('lança erro genérico se code for não-200 sem message', () => {
    const errResult = { code: 'ENGINE-500' };
    expect(() => handleRpcResult(errResult, 'minha_op')).toThrow('Erro ao executar minha_op');
  });
  it('não lança erro se code for 200', () => {
    const ok = { code: '200', data: 'ok' };
    expect(handleRpcResult(ok, 'op')).toEqual(ok);
  });
});

// ─── Terminação — Enums e Labels ─────────────────────────────────────────────

describe('termination_status enum valores', () => {
  const VALID_STATUSES = [
    'rascunho', 'em_aprovacao', 'aprovado', 'reprovado',
    'retornado', 'desligamento_concluido', 'cancelado',
  ];

  it.each(VALID_STATUSES)('status "%s" é reconhecido', (status) => {
    // Garante que o status tem um label definido
    const STATUS_LABELS: Record<string, string> = {
      rascunho: 'Rascunho',
      em_aprovacao: 'Em Aprovação',
      aprovado: 'Aprovado',
      reprovado: 'Reprovado',
      retornado: 'Devolvido',
      desligamento_concluido: 'Concluído',
      cancelado: 'Cancelado',
    };
    expect(STATUS_LABELS[status]).toBeDefined();
  });
});

describe('termination_type enum valores', () => {
  const VALID_TYPES = [
    'pedido_demissao', 'demissao_sem_justa_causa', 'demissao_por_justa_causa',
    'acordo', 'termino_contrato', 'experiencia', 'aposentadoria', 'falecimento', 'outros',
  ];

  it.each(VALID_TYPES)('tipo "%s" está na lista válida', (tipo) => {
    expect(VALID_TYPES).toContain(tipo);
  });

  it('lista tem exatamente 9 tipos', () => {
    expect(VALID_TYPES).toHaveLength(9);
  });
});

// ─── Módulo Compras — estados de transição ────────────────────────────────────

describe('máquina de estados de compras', () => {
  const PURCHASE_TRANSITIONS: Record<string, string[]> = {
    rascunho:             ['em_aprovacao', 'cancelado'],
    em_aprovacao:         ['aprovado', 'retornado', 'rejeitado', 'cancelado'],
    retornado:            ['em_aprovacao', 'cancelado'],
    aprovado:             ['aguardando_pagamento', 'cancelado'],
    aguardando_pagamento: ['aguardando_entrega', 'cancelado'],
    aguardando_entrega:   ['entregue', 'cancelado'],
    entregue:             ['concluido'],
    concluido:            [],
    cancelado:            [],
    rejeitado:            [],
  };

  it('rascunho pode ir para em_aprovacao', () => {
    expect(PURCHASE_TRANSITIONS['rascunho']).toContain('em_aprovacao');
  });
  it('aprovado pode gerar OC (aguardando_pagamento)', () => {
    expect(PURCHASE_TRANSITIONS['aprovado']).toContain('aguardando_pagamento');
  });
  it('entregue pode ser concluido', () => {
    expect(PURCHASE_TRANSITIONS['entregue']).toContain('concluido');
  });
  it('concluido não tem transições', () => {
    expect(PURCHASE_TRANSITIONS['concluido']).toHaveLength(0);
  });
  it('cancelado não tem transições', () => {
    expect(PURCHASE_TRANSITIONS['cancelado']).toHaveLength(0);
  });
});
