-- sprint15_013_transition_rpcs.sql
-- Motor unificado de execução de transições funcionais

CREATE OR REPLACE FUNCTION public.execute_entity_action(
    p_module_key TEXT,
    p_entity_id UUID,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_ctx public.entity_action_context;
    v_uid UUID := auth.uid();
    v_new_status TEXT;
    v_audit_details JSONB;
BEGIN
    -- 1. Obter contexto atual e validar
    v_ctx := public.get_entity_action_context(p_module_key, p_entity_id);
    
    IF v_ctx.allowed_actions IS NULL OR NOT (v_ctx.allowed_actions ? p_action) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ação não permitida para o status atual e perfil do usuário.', 'reasons', v_ctx.blocked_reasons);
    END IF;

    -- 2. Lock de linha para concorrência
    IF p_module_key = 'purchases' THEN
        PERFORM id FROM public.purchases WHERE id = p_entity_id FOR UPDATE NOWAIT;
    ELSIF p_module_key = 'fleet' THEN
        PERFORM id FROM public.fuel_requests WHERE id = p_entity_id FOR UPDATE NOWAIT;
    ELSIF p_module_key = 'admissions' THEN
        PERFORM id FROM public.admission_requests WHERE id = p_entity_id FOR UPDATE NOWAIT;
    ELSIF p_module_key = 'desligamentos' THEN
        PERFORM id FROM public.termination_requests WHERE id = p_entity_id FOR UPDATE NOWAIT;
    END IF;

    -- 3. Mapear novo status com base na ação e módulo
    v_new_status := v_ctx.current_status;

    IF p_module_key = 'purchases' THEN
        IF p_action = 'enviar' THEN v_new_status := 'em_aprovacao';
        ELSIF p_action = 'cancelar' THEN v_new_status := 'cancelado';
        ELSIF p_action = 'gerar_oc' THEN v_new_status := 'aguardando_pagamento';
        ELSIF p_action = 'pagar' THEN v_new_status := 'aguardando_entrega';
        ELSIF p_action = 'informar_entrega' THEN v_new_status := 'entregue';
        ELSIF p_action = 'concluir' THEN v_new_status := 'concluido';
        ELSIF p_action = 'divergencia' THEN v_new_status := 'divergencia';
        END IF;
    ELSIF p_module_key = 'fleet' THEN
        IF p_action = 'enviar' THEN v_new_status := 'em_aprovacao';
        ELSIF p_action = 'cancelar' THEN v_new_status := 'cancelado';
        ELSIF p_action = 'informar_abastecimento' THEN v_new_status := 'aguardando_comprovante';
        ELSIF p_action = 'enviar_documentos' THEN v_new_status := 'revisao_administrativa';
        ELSIF p_action = 'concluir_revisao' THEN v_new_status := 'concluido';
        ELSIF p_action = 'devolver' THEN v_new_status := 'retornado';
        ELSIF p_action = 'confirmar_horas' THEN v_new_status := 'aguardando_pagamento';
        ELSIF p_action = 'pagar' THEN 
             IF (SELECT type FROM public.fuel_requests WHERE id = p_entity_id) = 'reembolso' THEN
                  v_new_status := 'pago';
             ELSE
                  v_new_status := 'concluido';
             END IF;
        ELSIF p_action = 'confirmar_recebimento' THEN v_new_status := 'concluido';
        END IF;
    -- Etc. Admissions e Terminations
    END IF;

    -- Idempotência: Se o status não mudou e a ação deveria mudar o status (e não é apenas 'editar'), retorne sucesso silencioso.
    IF v_new_status = v_ctx.current_status AND p_action NOT IN ('editar', 'aprovar', 'rejeitar', 'devolver') THEN
        RETURN jsonb_build_object('success', true, 'status', v_new_status, 'message', 'Ação já processada (idempotente).');
    END IF;

    -- 4. Executar transição (Se for ação do Approval Engine, usar process_approval_action e abortar o update manual)
    IF p_action IN ('aprovar', 'devolver', 'rejeitar') THEN
         -- Encontrar o approval_request_id correspondente
         DECLARE
             v_appr_id UUID;
         BEGIN
             SELECT id INTO v_appr_id FROM public.approval_requests 
             WHERE reference_id = p_entity_id AND module_id = (SELECT id FROM public.approval_modules WHERE code = p_module_key LIMIT 1) 
             ORDER BY created_at DESC LIMIT 1;
             
             IF v_appr_id IS NULL THEN
                 RETURN jsonb_build_object('success', false, 'error', 'Fluxo de aprovação não encontrado');
             END IF;
             RETURN public.process_approval_action(v_appr_id, p_action, p_payload->>'notes');
         END;
    END IF;

    -- 5. Atualizar registro Base
    IF v_new_status <> v_ctx.current_status THEN
        IF p_module_key = 'purchases' THEN
            UPDATE public.purchases SET status = v_new_status, updated_at = now() WHERE id = p_entity_id;
        ELSIF p_module_key = 'fleet' THEN
            UPDATE public.fuel_requests SET status = v_new_status::public.fuel_status, updated_at = now() WHERE id = p_entity_id;
        ELSIF p_module_key = 'admissions' THEN
            UPDATE public.admission_requests SET status = v_new_status::public.admission_status, updated_at = now() WHERE id = p_entity_id;
        ELSIF p_module_key = 'desligamentos' THEN
            UPDATE public.termination_requests SET status = v_new_status::public.termination_status, updated_at = now() WHERE id = p_entity_id;
        END IF;

        -- 6. Histórico e Auditoria
        INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES (p_module_key, p_module_key, p_entity_id, v_ctx.current_status, v_new_status, v_uid);
        
        v_audit_details := jsonb_build_object('action', p_action, 'payload', p_payload, 'from', v_ctx.current_status, 'to', v_new_status);
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (v_uid, 'ENTITY_TRANSITION', p_module_key, p_entity_id, v_audit_details);

        -- 7. Notificações (Simples)
        INSERT INTO public.notifications (user_id, title, message, read, metadata)
        VALUES (v_ctx.requester_user_id, 'Atualização de Solicitação', 'Sua solicitação mudou para: ' || v_new_status, false, jsonb_build_object('type', 'status_update', 'reference_id', p_entity_id, 'reference_type', p_module_key));
    END IF;

    RETURN jsonb_build_object('success', true, 'status', v_new_status);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
