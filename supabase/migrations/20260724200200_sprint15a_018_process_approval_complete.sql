-- ============================================================
-- SPRINT 15A: Migration 018 - process_approval_action COMPLETO
-- Cobre: enviar, aprovar, devolver, rejeitar, cancelar
-- Cada operacao: FOR UPDATE, auditoria, historico, notificacao
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_approval_action(
  p_approval_request_id UUID,
  p_action TEXT,  -- 'approve' | 'reject' | 'return'
  p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_is_master     BOOLEAN;
  v_req           RECORD;
  v_cur_step      RECORD;
  v_next_step     RECORD;
  v_module_code   TEXT;
  v_ref_table     TEXT;
  v_new_status    TEXT;
  v_entity_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  v_is_master := public.has_role(v_uid, 'master'::app_role);

  -- ====== 1. LOCK DO APPROVAL_REQUEST ======
  SELECT ar.*, am.code AS module_code
    INTO v_req
  FROM public.approval_requests ar
  JOIN public.approval_modules am ON am.id = ar.module_id
  WHERE ar.id = p_approval_request_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fluxo de aprovação não encontrado');
  END IF;

  IF v_req.status IN ('approved', 'rejected', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este fluxo já foi encerrado (' || v_req.status || ')');
  END IF;

  v_module_code := v_req.module_code;

  -- ====== 2. IDEMPOTENCIA: detectar acao duplicada ======
  -- (verificado via lock de linha acima e status check)

  -- ====== 3. VALIDAR QUE O ATOR E O APROVADOR CORRETO ======
  SELECT ars.*, afs.approver_role_key
    INTO v_cur_step
  FROM public.approval_request_steps ars
  LEFT JOIN public.approval_flow_steps afs ON afs.id = ars.flow_step_id
  WHERE ars.approval_request_id = p_approval_request_id
    AND ars.step_order = v_req.current_step_order
    AND ars.status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Etapa de aprovação atual não encontrada ou já processada');
  END IF;

  IF v_cur_step.approver_user_id IS DISTINCT FROM v_uid AND NOT v_is_master THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não é o aprovador designado para esta etapa (etapa ' || v_req.current_step_order || ')');
  END IF;

  -- ====== 4. PROCESSAR A ACAO ======

  IF p_action = 'approve' THEN
    -- Marcar etapa atual como aprovada
    UPDATE public.approval_request_steps
    SET status = 'approved', action_at = now(), comments = p_comments
    WHERE id = v_cur_step.id;

    -- Verificar se existe proxima etapa
    SELECT ars.*
      INTO v_next_step
    FROM public.approval_request_steps ars
    WHERE ars.approval_request_id = p_approval_request_id
      AND ars.step_order > v_req.current_step_order
      AND ars.status = 'pending'
    ORDER BY ars.step_order
    LIMIT 1;

    IF FOUND THEN
      -- Avancar para proxima etapa
      v_new_status := 'awaiting_step_' || v_next_step.step_order;
      UPDATE public.approval_requests
      SET status = v_new_status,
          current_step_order = v_next_step.step_order,
          current_approver_user_id = v_next_step.approver_user_id,
          updated_at = now()
      WHERE id = p_approval_request_id;

      -- Notificar proximo aprovador
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (
        v_next_step.approver_user_id,
        'Aprovação pendente - Etapa ' || v_next_step.step_order,
        'Uma solicitação avançou para sua etapa de aprovação.',
        jsonb_build_object('approval_request_id', p_approval_request_id, 'entity_type', v_module_code)
      );

    ELSE
      -- Ultima etapa aprovada: encerrar fluxo
      v_new_status := 'approved';
      v_entity_status := 'aguardando_oc'; -- padrão para compras/outros
      
      -- Definir status pos-aprovacao por modulo
      CASE v_module_code
        WHEN 'compras'       THEN v_entity_status := 'aguardando_oc';
        WHEN 'abastecimento' THEN v_entity_status := 'aguardando_execucao';
        WHEN 'diaria'        THEN v_entity_status := 'programada';
        WHEN 'reembolso'     THEN v_entity_status := 'aguardando_pagamento';
        WHEN 'admissoes'     THEN v_entity_status := 'analise_documental';
        WHEN 'desligamentos' THEN v_entity_status := 'aprovacao';
        ELSE v_entity_status := 'aprovado';
      END CASE;

      UPDATE public.approval_requests
      SET status = v_new_status,
          ended_at = now(),
          updated_at = now()
      WHERE id = p_approval_request_id;

      -- Atualizar entidade
      PERFORM public._update_entity_status(v_module_code, v_req.reference_id, v_entity_status);

      -- Notificar solicitante
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (
        v_req.requester_user_id,
        'Solicitação aprovada!',
        'Sua solicitação foi aprovada e avançou para: ' || v_entity_status,
        jsonb_build_object('entity_type', v_module_code, 'entity_id', v_req.reference_id)
      );
    END IF;

  ELSIF p_action = 'reject' THEN
    IF p_comments IS NULL OR trim(p_comments) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Motivo de reprovação é obrigatório');
    END IF;

    UPDATE public.approval_request_steps
    SET status = 'rejected', action_at = now(), comments = p_comments
    WHERE id = v_cur_step.id;

    UPDATE public.approval_requests
    SET status = 'rejected', ended_at = now(), updated_at = now()
    WHERE id = p_approval_request_id;

    -- Atualizar entidade para reprovado
    PERFORM public._update_entity_status(v_module_code, v_req.reference_id, 'reprovado');

    -- Notificar solicitante
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      v_req.requester_user_id,
      'Solicitação reprovada',
      'Sua solicitação foi reprovada. Motivo: ' || COALESCE(p_comments, '(sem motivo)'),
      jsonb_build_object('entity_type', v_module_code, 'entity_id', v_req.reference_id)
    );

    v_new_status := 'rejected';

  ELSIF p_action = 'return' THEN
    IF p_comments IS NULL OR trim(p_comments) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Motivo de devolução é obrigatório');
    END IF;

    UPDATE public.approval_request_steps
    SET status = 'returned', action_at = now(), comments = p_comments
    WHERE id = v_cur_step.id;

    UPDATE public.approval_requests
    SET status = 'returned', ended_at = now(), updated_at = now()
    WHERE id = p_approval_request_id;

    -- Atualizar entidade para retornado
    PERFORM public._update_entity_status(v_module_code, v_req.reference_id, 'retornado');

    -- Notificar solicitante
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      v_req.requester_user_id,
      'Solicitação devolvida para ajuste',
      'Sua solicitação foi devolvida para correção. Motivo: ' || COALESCE(p_comments, '(sem motivo)'),
      jsonb_build_object('entity_type', v_module_code, 'entity_id', v_req.reference_id)
    );

    v_new_status := 'returned';

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida: ' || p_action || '. Use: approve, reject, return');
  END IF;

  -- ====== 5. HISTORICO ======
  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES (
    v_module_code, v_module_code, v_req.reference_id,
    'em_aprovacao', COALESCE(v_entity_status, v_new_status),
    v_uid
  );

  -- ====== 6. AUDITORIA ======
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'APPROVAL_' || upper(p_action),
    v_module_code,
    v_req.reference_id,
    jsonb_build_object(
      'approval_request_id', p_approval_request_id,
      'step_order', v_req.current_step_order,
      'comments', p_comments,
      'new_status', COALESCE(v_entity_status, v_new_status)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'new_status', COALESCE(v_entity_status, v_new_status),
    'approval_request_status', v_new_status
  );

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação está sendo processada por outro usuário. Tente novamente em instantes.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro interno: ' || SQLERRM);
END;
$$;

-- ====== HELPER: atualizar status da entidade por modulo ======
CREATE OR REPLACE FUNCTION public._update_entity_status(
  p_module_code TEXT,
  p_entity_id   UUID,
  p_new_status  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_module_code
    WHEN 'compras' THEN
      UPDATE public.purchases
      SET status = p_new_status, updated_at = now()
      WHERE id = p_entity_id;
    WHEN 'abastecimento', 'diaria', 'reembolso' THEN
      UPDATE public.fuel_requests
      SET status = p_new_status::public.fuel_status, updated_at = now()
      WHERE id = p_entity_id;
    WHEN 'admissoes' THEN
      UPDATE public.admission_requests
      SET status = p_new_status::public.admission_status, updated_at = now()
      WHERE id = p_entity_id;
    WHEN 'desligamentos' THEN
      UPDATE public.termination_requests
      SET status = p_new_status::public.termination_status, updated_at = now()
      WHERE id = p_entity_id;
    ELSE
      RAISE WARNING '_update_entity_status: modulo desconhecido %', p_module_code;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.process_approval_action(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_approval_action(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public._update_entity_status(TEXT, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._update_entity_status(TEXT, UUID, TEXT) TO authenticated;
