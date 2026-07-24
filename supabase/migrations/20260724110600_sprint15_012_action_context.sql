-- sprint15_012_action_context.sql
-- Implementa a fonte de verdade centralizada para ações do frontend

-- 1. Tipo de retorno consolidado
CREATE TYPE public.entity_action_context AS (
    module_key TEXT,
    entity_id UUID,
    current_status TEXT,
    current_step TEXT,
    current_approver_user_id UUID,
    is_current_actor BOOLEAN,
    allowed_actions JSONB,
    blocked_reasons TEXT[],
    next_step TEXT,
    requester_user_id UUID,
    sla_deadline TIMESTAMP WITH TIME ZONE
);

-- 2. Função Principal
CREATE OR REPLACE FUNCTION public.get_entity_action_context(p_module_key TEXT, p_entity_id UUID)
RETURNS public.entity_action_context
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_ctx public.entity_action_context;
    v_uid UUID := auth.uid();
    v_is_master BOOLEAN;
    v_is_requester BOOLEAN;
    v_flow_record RECORD;
    v_base_status TEXT;
    v_base_requester UUID;
    v_actions JSONB := '[]'::jsonb;
    v_reasons TEXT[] := '{}';
    v_fleet_type TEXT;
BEGIN
    v_ctx.module_key := p_module_key;
    v_ctx.entity_id := p_entity_id;
    
    -- Checar se usuário é master
    v_is_master := public.has_role(v_uid, 'master');

    -- Recuperar entidade base
    IF p_module_key = 'purchases' OR p_module_key = 'compras' THEN
        SELECT status::text, requester_user_id INTO v_base_status, v_base_requester FROM public.purchases WHERE id = p_entity_id;
    ELSIF p_module_key IN ('abastecimento', 'diaria', 'reembolso', 'fleet') THEN
        SELECT status::text, requester_user_id, type INTO v_base_status, v_base_requester, v_fleet_type FROM public.fuel_requests WHERE id = p_entity_id;
        IF p_module_key <> 'fleet' AND v_fleet_type IS DISTINCT FROM p_module_key THEN
            RAISE EXCEPTION 'Entidade não pertence ao módulo fleet informado (esperado %, recebido %)', p_module_key, v_fleet_type;
        END IF;
        -- Se veio como fleet genérico, ajusta para o tipo real para logica de ações funcionar abaixo
        IF p_module_key = 'fleet' THEN
            v_ctx.module_key := v_fleet_type;
            p_module_key := v_fleet_type;
        END IF;
    ELSIF p_module_key = 'admissions' THEN
        SELECT status::text, requester_user_id INTO v_base_status, v_base_requester 
        FROM public.admission_requests WHERE id = p_entity_id;
    ELSIF p_module_key = 'desligamentos' THEN
        SELECT status::text, requester_user_id INTO v_base_status, v_base_requester FROM public.termination_requests WHERE id = p_entity_id;
    ELSE
        RAISE EXCEPTION 'Módulo inválido: %', p_module_key;
    END IF;

    IF v_base_status IS NULL THEN
        RAISE EXCEPTION 'Entidade não encontrada ou inacessível via RLS';
    END IF;

    v_ctx.current_status := v_base_status;
    v_ctx.requester_user_id := v_base_requester;
    v_is_requester := (v_uid = v_base_requester);

    -- Recuperar estado do approval_requests (se existir)
    SELECT * INTO v_flow_record 
    FROM public.approval_requests 
    WHERE reference_id = p_entity_id AND module_id = (SELECT id FROM public.approval_modules WHERE code = p_module_key LIMIT 1) 
    ORDER BY created_at DESC LIMIT 1;

    IF FOUND THEN
        v_ctx.current_step := v_flow_record.status; -- o motor salva step em status, ex: awaiting_step_1
        v_ctx.current_approver_user_id := v_flow_record.current_approver_user_id;
        v_ctx.is_current_actor := (v_uid = v_flow_record.current_approver_user_id) OR v_is_master;
    ELSE
        v_ctx.current_step := NULL;
        v_ctx.current_approver_user_id := NULL;
        -- Se não tem fluxo, o ator costuma ser o próprio requester (em rascunho) ou master (ações reversas)
        v_ctx.is_current_actor := v_is_requester OR v_is_master;
    END IF;

    -- Lógica centralizada de ações permitidas (Máquinas de Estado de SPRINT15_FONTE_UNICA_VERDADE.md)
    IF p_module_key = 'purchases' THEN
        IF v_base_status IN ('rascunho', 'retornado') THEN
            IF v_is_requester OR v_is_master THEN
                v_actions := '["enviar", "editar", "cancelar"]'::jsonb;
            ELSE
                v_reasons := array_append(v_reasons, 'Apenas o solicitante pode enviar ou editar rascunhos.');
            END IF;
        ELSIF v_base_status = 'em_aprovacao' THEN
            IF v_ctx.is_current_actor THEN
                v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
            ELSE
                v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
            END IF;
        ELSIF v_base_status = 'aguardando_oc' THEN
            IF public.has_role(v_uid, 'compras') OR v_is_master THEN
                v_actions := '["gerar_oc"]'::jsonb;
            ELSE
                v_reasons := array_append(v_reasons, 'Apenas Compras pode gerar a OC.');
            END IF;
        ELSIF v_base_status = 'aguardando_pagamento' THEN
            IF public.has_role(v_uid, 'financeiro') OR v_is_master THEN
                v_actions := '["pagar"]'::jsonb;
            ELSE
                v_reasons := array_append(v_reasons, 'Apenas Financeiro pode confirmar pagamento.');
            END IF;
        ELSIF v_base_status = 'aguardando_entrega' THEN
            IF v_is_requester OR public.has_role(v_uid, 'compras') OR v_is_master THEN
                v_actions := '["informar_entrega"]'::jsonb;
            END IF;
        ELSIF v_base_status = 'entregue' THEN
            IF v_is_requester OR public.has_role(v_uid, 'compras') OR v_is_master THEN
                v_actions := '["concluir", "divergencia"]'::jsonb;
            END IF;
        END IF;

    ELSIF p_module_key IN ('abastecimento', 'diaria', 'reembolso') THEN
        -- Fleet Submodules
        IF v_base_status IN ('rascunho', 'retornado') THEN
            IF v_is_requester OR v_is_master THEN
                v_actions := '["enviar", "editar", "cancelar"]'::jsonb;
            END IF;
        ELSIF v_base_status = 'em_aprovacao' THEN
            IF v_ctx.is_current_actor THEN
                v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
            END IF;
        ELSE
            IF v_fleet_type = 'abastecimento' THEN
                IF v_base_status = 'aprovado' AND (v_is_requester OR v_is_master) THEN
                    v_actions := '["informar_abastecimento"]'::jsonb;
                ELSIF v_base_status = 'aguardando_comprovante' AND (v_is_requester OR v_is_master) THEN
                    v_actions := '["enviar_documentos"]'::jsonb;
                ELSIF v_base_status = 'em_revisao_admin' AND (public.has_role(v_uid, 'administrativo') OR v_is_master) THEN
                    v_actions := '["concluir_revisao", "devolver"]'::jsonb;
                END IF;
            ELSIF v_fleet_type = 'diaria' THEN
                IF v_base_status = 'em_revisao' AND (v_ctx.is_current_actor OR public.has_role(v_uid, 'supervisor') OR v_is_master) THEN
                    v_actions := '["confirmar_horas"]'::jsonb;
                ELSIF v_base_status = 'aguardando_pagamento' AND (public.has_role(v_uid, 'financeiro') OR v_is_master) THEN
                    v_actions := '["pagar"]'::jsonb;
                END IF;
            ELSIF v_fleet_type = 'reembolso' THEN
                IF v_base_status = 'aguardando_pagamento' AND (public.has_role(v_uid, 'financeiro') OR v_is_master) THEN
                    v_actions := '["pagar"]'::jsonb;
                ELSIF v_base_status = 'pago' AND (v_is_requester OR v_is_master) THEN
                    v_actions := '["confirmar_recebimento"]'::jsonb;
                END IF;
            END IF;
        END IF;

    ELSIF p_module_key = 'desligamentos' THEN
        IF v_base_status = 'rascunho' THEN
            IF v_is_requester OR v_is_master THEN
                v_actions := '["enviar", "editar", "cancelar"]'::jsonb;
            END IF;
        ELSIF v_base_status = 'em_aprovacao' THEN
            IF v_ctx.is_current_actor THEN
                v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
            END IF;
        ELSIF v_base_status = 'aprovado' THEN
             IF public.has_role(v_uid, 'rh') OR v_is_master THEN
                v_actions := '["processar"]'::jsonb;
             END IF;
        ELSIF v_base_status = 'processamento' THEN
             IF public.has_role(v_uid, 'rh') OR v_is_master THEN
                v_actions := '["verificar_epis"]'::jsonb;
             END IF;
        -- E assim por diante para desligamentos
        END IF;
        
    ELSIF p_module_key = 'admissions' THEN
        IF v_base_status = 'abertura' THEN
             IF public.has_role(v_uid, 'rh') OR v_is_master THEN
                v_actions := '["enviar_convite"]'::jsonb;
             END IF;
        ELSIF v_base_status = 'aguardando_documentos' THEN
             IF v_is_requester OR v_is_master THEN
                 v_actions := '["enviar_documentos"]'::jsonb;
             END IF;
        -- RH processa restante
        ELSIF v_base_status NOT IN ('concluido', 'arquivado', 'cancelado') AND (public.has_role(v_uid, 'rh') OR v_is_master) THEN
             v_actions := '["avancar_etapa", "devolver", "cancelar"]'::jsonb;
        END IF;
    END IF;

    v_ctx.allowed_actions := v_actions;
    v_ctx.blocked_reasons := v_reasons;
    
    RETURN v_ctx;
END;
$$;
