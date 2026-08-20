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

export function useFlowControlBatch(userId?: string) {
  const qc = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ ok: number; fail: number } | null>(null);

  const processBatch = async (
    referenceIds: Set<string>,
    action: 'approve' | 'reject',
    comments: string
  ) => {
    if (referenceIds.size === 0) return;
    setIsProcessing(true);
    let ok = 0;
    let fail = 0;

    for (const itemId of referenceIds) {
      try {
        // [Sprint Final 1] Lote também converge no executor único.
        // O contexto informa o módulo e a ação canônica da etapa atual.
        const { data: ar } = await supabase
          .from('approval_requests')
          .select('id, current_approver_user_id, ended_at, approval_modules(code)')
          .eq('reference_id', itemId)
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const moduleKey = (ar as any)?.approval_modules?.code as string | undefined;
        if (ar && ar.current_approver_user_id === userId && moduleKey) {
          const { data: ctx } = await (supabase as any).rpc('get_entity_action_context', {
            p_module_key: moduleKey,
            p_entity_id: itemId,
          });
          const allowed: string[] = (ctx as any)?.allowed_actions ?? [];
          const canonical =
            action === 'reject' || action === 'rejeitar'
              ? 'rejeitar'
              : action === 'return' || action === 'devolver'
                ? 'devolver'
                : allowed.find((a) => STEP_COMPLETION_ACTIONS.includes(a)) ?? 'aprovar';
          if (!allowed.includes(canonical)) { fail++; continue; }
          const { data: result, error } = await (supabase as any).rpc('execute_entity_action', {
            p_module_key: moduleKey,
            p_entity_id:  itemId,
            p_action:     canonical,
            p_payload:    comments ? { comments } : {},
          });
          if (!error && (result as any)?.success && !(result as any)?.error) {
            ok++;
          } else {
            fail++;
          }
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
