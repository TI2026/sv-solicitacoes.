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
    targets: Array<{ moduleKey: string; entityId: string }>,
    action: 'approve' | 'reject',
    comments: string
  ) => {
    if (targets.length === 0) return;
    setIsProcessing(true);
    let ok = 0;
    let fail = 0;

    for (const target of targets) {
      try {
        // Targets come from get_my_approval_queue(), already scoped by
        // module + entity. Action Context remains authoritative per item.
        const { data: ctx, error: contextError } = await (supabase as any).rpc('get_entity_action_context', {
          p_module_key: target.moduleKey,
          p_entity_id: target.entityId,
        });
        if (contextError || (ctx as any)?.current_approver_user_id !== userId) {
          fail++;
          continue;
        }
        const allowed: string[] = (ctx as any)?.allowed_actions ?? [];
        const canonical =
          action === 'reject'
            ? 'rejeitar'
            : allowed.find((a) => (STEP_COMPLETION_ACTIONS as readonly string[]).includes(a)) ?? 'aprovar';
        if (!allowed.includes(canonical)) { fail++; continue; }
        await executeEntityAction({
          moduleKey: target.moduleKey,
          entityId: target.entityId,
          action: canonical,
          payload: comments ? { notes: comments } : {},
        });
        ok++;
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
