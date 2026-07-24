-- ============================================================
-- SPRINT 15A: Migration 019 - execute_entity_action COMPLETO
-- Acoes do Sprint 15A: enviar, aprovar, devolver, rejeitar, cancelar
-- Caminho unico: get_entity_action_context -> execute_entity_action
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key TEXT,
  p_entity_id  UUID,
  p_action     TEXT,
  p_payload    JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_ctx       public.entity_action_context;
  v_notes     TEXT;
  v_req_id    UUID;
  v_module    TEXT;
  v_result    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_module_key IS NULL OR p_entity_id IS NULL OR p_action IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parâmetros obrigatórios ausentes (module_key, entity_id, action)');
  END IF;

  IF p_action NOT IN ('enviar', 'aprovar', 'devolver', 'rejeitar', 'cancelar', 'editar') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação não reconhecida no Sprint 15A: ' || p_action);
  END IF;

  v_notes := p_payload->>'notes';

  -- ====== 1. OBTER CONTEXTO (validacao centralizada) ======
  BEGIN
    v_ctx := public.get_entity_action_context(p_module_key, p_entity_id);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro ao obter contexto da entidade: ' || SQLERRM);
  END;

  IF v_ctx.current_status = 'ERRO' THEN
    RETURN jsonb_build_object('success', false, 'error', array_to_string(v_ctx.blocked_reasons, '; '));
  END IF;

  -- ====== 2. VERIFICAR SE A ACAO E PERMITIDA ======
  IF NOT (v_ctx.allowed_actions ? p_action) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ação "' || p_action || '" não permitida para o status "' || v_ctx.current_status || '".',
      'blocked_reasons', to_json(v_ctx.blocked_reasons)
    );
  END IF;

  v_module := v_ctx.module_key;

  -- ====== 3. EXECUTAR ACAO ======

  -- ---- ENVIAR (rascunho -> em_aprovacao) ----
  IF p_action = 'enviar' THEN
    -- Atualizar status da entidade para em_aprovacao
    PERFORM public._update_entity_status(v_module, p_entity_id, 'em_aprovacao');

    -- Iniciar fluxo de aprovacao
    v_result := public.start_approval_flow(v_module, p_entity_id, v_uid);

    IF v_result->>'error' IS NOT NULL THEN
      -- Reverter status se falhou ao iniciar fluxo
      PERFORM public._update_entity_status(v_module, p_entity_id, v_ctx.current_status);
      RETURN jsonb_build_object('success', false, 'error', 'Falha ao iniciar fluxo de aprovação: ' || (v_result->>'error'));
    END IF;

    -- Historico
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_module, v_module, p_entity_id, v_ctx.current_status, 'em_aprovacao', v_uid);

    -- Auditoria
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENTITY_SEND', v_module, p_entity_id,
      jsonb_build_object('from', v_ctx.current_status, 'to', 'em_aprovacao', 'approval_request_id', v_result->'approval_request_id'));

    RETURN jsonb_build_object('success', true, 'status', 'em_aprovacao', 'approval_request_id', v_result->'approval_request_id');

  -- ---- CANCELAR ----
  ELSIF p_action = 'cancelar' THEN
    PERFORM public._update_entity_status(v_module, p_entity_id, 'cancelado');

    -- Cancelar fluxo ativo se existir
    UPDATE public.approval_requests
    SET status = 'cancelled', ended_at = now(), updated_at = now()
    WHERE reference_id = p_entity_id
      AND status NOT IN ('approved', 'rejected', 'cancelled');

    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_module, v_module, p_entity_id, v_ctx.current_status, 'cancelado', v_uid);

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENTITY_CANCEL', v_module, p_entity_id,
      jsonb_build_object('from', v_ctx.current_status, 'notes', v_notes));

    RETURN jsonb_build_object('success', true, 'status', 'cancelado');

  -- ---- APROVAR / DEVOLVER / REJEITAR (via process_approval_action) ----
  ELSIF p_action IN ('aprovar', 'devolver', 'rejeitar') THEN
    -- Mapear acao para o formato do process_approval_action
    DECLARE
      v_internal_action TEXT;
    BEGIN
      v_internal_action := CASE p_action
        WHEN 'aprovar'  THEN 'approve'
        WHEN 'devolver' THEN 'return'
        WHEN 'rejeitar' THEN 'reject'
      END;

      -- Localizar o approval_request ativo
      SELECT id INTO v_req_id
      FROM public.approval_requests
      WHERE reference_id = p_entity_id
        AND status NOT IN ('approved', 'rejected', 'cancelled')
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_req_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum fluxo de aprovação ativo encontrado para esta solicitação');
      END IF;

      v_result := public.process_approval_action(v_req_id, v_internal_action, v_notes);
      RETURN v_result;
    END;

  -- ---- EDITAR (nenhuma transicao de status) ----
  ELSIF p_action = 'editar' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENTITY_EDIT', v_module, p_entity_id,
      jsonb_build_object('status', v_ctx.current_status, 'notes', v_notes));
    RETURN jsonb_build_object('success', true, 'status', v_ctx.current_status, 'action', 'editar');

  END IF;

  -- Nao deve chegar aqui
  RETURN jsonb_build_object('success', false, 'error', 'Ação não processada');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_entity_action(TEXT, UUID, TEXT, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(TEXT, UUID, TEXT, JSONB) TO authenticated;
