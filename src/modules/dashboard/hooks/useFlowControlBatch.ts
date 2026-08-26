/**
 * useFlowControlBatch.ts
 *
 * CAMADA: Hook
 *
 * Responsabilidade: isolar a lógica de aprovação e reprovação em lote,
 * chamando o motor de aprovação via RPC e cuidando do cache.
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { refreshApprovalData } from '@/lib/refreshApprovalData';
import { STEP_COMPLETION_ACTIONS } from '@/lib/approvalKeys';
import { executeEntityAction } from '@/hooks/useEntityAction';

export function useFlowControlBatch(userId?: string) {
  const qc = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ ok: number; fail: number } | null>(null);

  const processBatch = async (
    entityKeys: Set<string>,
    action: 'approve' | 'reject',
    comments: string
  ) => {
    if (entityKeys.size === 0) return;
    setIsProcessing(true);
    let ok = 0;
    let fail = 0;

    for (const entityKey of entityKeys) {
      try {
        const separator = entityKey.indexOf(':');
        if (separator <= 0) { fail++; continue; }
        const moduleKey = entityKey.slice(0, separator);
        const itemId = entityKey.slice(separator + 1);

        // [Sprint Final 1] Lote também converge no executor único.
        // Módulo + entidade são inseparáveis em toda resolução de autoridade.
        const { data: ar } = await supabase
          .from('approval_requests')
          .select('id, current_approver_user_id, ended_at, approval_modules!inner(code)')
          .eq('approval_modules.code', moduleKey)
          .eq('reference_id', itemId)
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (ar && ar.current_approver_user_id === userId && moduleKey) {
          const { data: ctx } = await (supabase as any).rpc('get_entity_action_context', {
            p_module_key: moduleKey,
            p_entity_id: itemId,
          });
          const allowed: string[] = (ctx as any)?.allowed_actions ?? [];
          const canonical =
            action === 'reject'
              ? 'rejeitar'
              : allowed.find((a) => (STEP_COMPLETION_ACTIONS as readonly string[]).includes(a)) ?? 'aprovar';
          if (!allowed.includes(canonical)) { fail++; continue; }
          await executeEntityAction({
            moduleKey,
            entityId: itemId,
            action: canonical,
            payload: comments ? { notes: comments } : {},
          });
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }

    setResults({ ok, fail });
    setIsProcessing(false);
    refreshApprovalData(qc);
    return { ok, fail };
  };

  const clearResults = () => setResults(null);

  return {
    processBatch,
    isProcessing,
    results,
    clearResults,
  };
}
