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
        const { data: ar } = await supabase
          .from('approval_requests')
          .select('id, current_approver_user_id, ended_at')
          .eq('reference_id', itemId)
          .is('ended_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (ar && ar.current_approver_user_id === userId) {
          const { data: result } = await supabase.rpc('process_approval_action', {
            p_approval_request_id: ar.id,
            p_action: action,
            p_comments: comments,
          });
          if ((result as any)?.success) {
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
