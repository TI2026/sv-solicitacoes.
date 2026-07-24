-- ============================================================
-- SPRINT 15A: Migration 017 - get_entity_action_context COMPLETO
-- Sem fallbacks genericos. Cobertura explicita dos 6 modulos.
-- Retorna contexto para o motor de aprovacao e frontend.
-- ============================================================

-- Dropar e recriar o type se necessario (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_action_context' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.entity_action_context AS (
      module_key            TEXT,
      entity_id             UUID,
      current_status        TEXT,
      flow_version          TEXT,
      current_step_order    INT,
      current_step_name     TEXT,
      current_approver_user_id UUID,
      requester_user_id     UUID,
      is_current_actor      BOOLEAN,
      allowed_actions       JSONB,
      blocked_reasons       TEXT[],
      next_step_order       INT,
      next_step_name        TEXT,
      next_responsible_rule TEXT,
      sla_deadline          TIMESTAMPTZ,
      overdue               BOOLEAN
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_entity_action_context(p_module_key TEXT, p_entity_id UUID)
RETURNS public.entity_action_context
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx             public.entity_action_context;
  v_uid             UUID := auth.uid();
  v_is_master       BOOLEAN;
  v_is_requester    BOOLEAN;
  v_base_status     TEXT;
  v_base_requester  UUID;
  v_fleet_type      TEXT;
  v_norm_module     TEXT;
  v_actions         JSONB := '[]'::jsonb;
  v_reasons         TEXT[] := '{}';
  v_flow_rec        RECORD;
  v_step_rec        RECORD;
  v_next_step_rec   RECORD;
  v_flow_name       TEXT;
BEGIN
  -- ====== 1. RESOLUCAO DO MODULO NORMALIZADO ======
  -- 'fleet' generico: delegar ao tipo real do registro
  v_norm_module := p_module_key;

  IF p_module_key IN ('abastecimento','diaria','reembolso','fleet') THEN
    SELECT status::text, requester_user_id, type
      INTO v_base_status, v_base_requester, v_fleet_type
    FROM public.fuel_requests
    WHERE id = p_entity_id;

    IF v_base_status IS NULL THEN
      RAISE EXCEPTION 'fuel_request % nao encontrado ou inacessivel via RLS', p_entity_id;
    END IF;

    -- Se veio como 'fleet', normaliza para o tipo real
    IF p_module_key = 'fleet' THEN
      v_norm_module := v_fleet_type;
    ELSE
      -- Validar que o type bate com o modulo solicitado
      IF v_fleet_type IS DISTINCT FROM p_module_key THEN
        RAISE EXCEPTION 'Modulo % solicitado mas registro e do tipo %', p_module_key, v_fleet_type;
      END IF;
    END IF;

  ELSIF p_module_key IN ('compras','purchases') THEN
    v_norm_module := 'compras';
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.purchases
    WHERE id = p_entity_id;
    IF v_base_status IS NULL THEN
      RAISE EXCEPTION 'purchase % nao encontrado ou inacessivel via RLS', p_entity_id;
    END IF;

  ELSIF p_module_key IN ('admissoes','admissions') THEN
    v_norm_module := 'admissoes';
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.admission_requests
    WHERE id = p_entity_id;
    IF v_base_status IS NULL THEN
      RAISE EXCEPTION 'admission_request % nao encontrado ou inacessivel via RLS', p_entity_id;
    END IF;

  ELSIF p_module_key = 'desligamentos' THEN
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.termination_requests
    WHERE id = p_entity_id;
    IF v_base_status IS NULL THEN
      RAISE EXCEPTION 'termination_request % nao encontrado ou inacessivel via RLS', p_entity_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Modulo invalido: %. Modulos validos: compras, abastecimento, diaria, reembolso, admissoes, desligamentos', p_module_key;
  END IF;

  -- ====== 2. ESTADO BASE ======
  v_ctx.module_key          := v_norm_module;
  v_ctx.entity_id           := p_entity_id;
  v_ctx.current_status      := v_base_status;
  v_ctx.requester_user_id   := v_base_requester;
  v_is_master               := public.has_role(v_uid, 'master'::app_role);
  v_is_requester            := (v_uid = v_base_requester);

  -- ====== 3. ESTADO DO FLUXO DE APROVACAO ======
  SELECT ar.*, af.name AS flow_name
    INTO v_flow_rec
  FROM public.approval_requests ar
  JOIN public.approval_flows af ON af.id = ar.flow_id
  WHERE ar.reference_id = p_entity_id
    AND ar.status NOT IN ('approved', 'rejected', 'cancelled')
  ORDER BY ar.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_ctx.flow_version            := v_flow_rec.flow_name;
    v_ctx.current_step_order      := v_flow_rec.current_step_order;
    v_ctx.current_approver_user_id := v_flow_rec.current_approver_user_id;
    v_ctx.is_current_actor        := (v_uid = v_flow_rec.current_approver_user_id) OR v_is_master;

    -- Nome da etapa atual
    SELECT afs.approver_type || ' / ordem ' || ars.step_order
      INTO v_ctx.current_step_name
    FROM public.approval_request_steps ars
    JOIN public.approval_flow_steps afs ON afs.id = ars.flow_step_id
    WHERE ars.approval_request_id = v_flow_rec.id
      AND ars.step_order = v_flow_rec.current_step_order
    LIMIT 1;

    -- Proxima etapa
    SELECT ars.step_order, afs.approver_type
      INTO v_next_step_rec
    FROM public.approval_request_steps ars
    JOIN public.approval_flow_steps afs ON afs.id = ars.flow_step_id
    WHERE ars.approval_request_id = v_flow_rec.id
      AND ars.step_order > v_flow_rec.current_step_order
      AND ars.status = 'pending'
    ORDER BY ars.step_order
    LIMIT 1;

    IF FOUND THEN
      v_ctx.next_step_order       := v_next_step_rec.step_order;
      v_ctx.next_responsible_rule := v_next_step_rec.approver_type;
    END IF;
  ELSE
    v_ctx.flow_version            := NULL;
    v_ctx.current_step_order      := NULL;
    v_ctx.current_approver_user_id := NULL;
    v_ctx.is_current_actor        := v_is_requester OR v_is_master;
  END IF;

  -- ====== 4. LOGICA DE ACOES POR MODULO (SEM FALLBACK GENERICO) ======

  -- ---- COMPRAS ----
  IF v_norm_module = 'compras' THEN
    IF v_base_status IN ('rascunho','retornado') THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas o solicitante pode editar ou enviar rascunhos de compra.');
      END IF;
    ELSIF v_base_status = 'em_aprovacao' THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSIF v_is_requester THEN
        v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa de compra.');
      END IF;
    ELSIF v_base_status IN ('cancelado','reprovado') THEN
      v_reasons := array_append(v_reasons, 'Solicitação de compra encerrada (' || v_base_status || ').');
    ELSIF v_base_status = 'concluido' THEN
      v_reasons := array_append(v_reasons, 'Compra concluída. Nenhuma ação disponível.');
    ELSE
      -- Estados operacionais pos-aprovação: aguardando_oc, aguardando_pagamento, etc.
      -- Tratados no Sprint 15B. Aqui apenas registra.
      v_reasons := array_append(v_reasons, 'Ações operacionais para status "' || v_base_status || '" disponíveis no módulo de operações.');
    END IF;

  -- ---- ABASTECIMENTO ----
  ELSIF v_norm_module = 'abastecimento' THEN
    IF v_base_status IN ('rascunho','retornado') THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas o solicitante pode editar ou enviar solicitação de abastecimento.');
      END IF;
    ELSIF v_base_status = 'em_aprovacao' THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa de abastecimento.');
      END IF;
    ELSIF v_base_status IN ('cancelado','reprovado') THEN
      v_reasons := array_append(v_reasons, 'Solicitação de abastecimento encerrada (' || v_base_status || ').');
    ELSIF v_base_status = 'concluido' THEN
      v_reasons := array_append(v_reasons, 'Abastecimento concluído.');
    ELSE
      v_reasons := array_append(v_reasons, 'Ações operacionais para status "' || v_base_status || '" tratadas no Sprint 15B.');
    END IF;

  -- ---- DIARIA ----
  ELSIF v_norm_module = 'diaria' THEN
    IF v_base_status = 'rascunho' THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas o solicitante pode editar diárias em rascunho.');
      END IF;
    ELSIF v_base_status = 'em_aprovacao' THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta diária.');
      END IF;
    ELSIF v_base_status IN ('cancelado','reprovado') THEN
      v_reasons := array_append(v_reasons, 'Diária encerrada (' || v_base_status || ').');
    ELSIF v_base_status IN ('concluido','encerrado') THEN
      v_reasons := array_append(v_reasons, 'Diária concluída.');
    ELSE
      v_reasons := array_append(v_reasons, 'Ações operacionais para status "' || v_base_status || '" tratadas no Sprint 15B.');
    END IF;

  -- ---- REEMBOLSO ----
  ELSIF v_norm_module = 'reembolso' THEN
    IF v_base_status IN ('rascunho','retornado') THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas o solicitante pode editar reembolsos em rascunho.');
      END IF;
    ELSIF v_base_status = 'em_aprovacao' THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual deste reembolso.');
      END IF;
    ELSIF v_base_status IN ('cancelado','reprovado') THEN
      v_reasons := array_append(v_reasons, 'Reembolso encerrado (' || v_base_status || ').');
    ELSIF v_base_status IN ('concluido','pago') THEN
      v_reasons := array_append(v_reasons, 'Reembolso já finalizado.');
    ELSE
      v_reasons := array_append(v_reasons, 'Ações operacionais para status "' || v_base_status || '" tratadas no Sprint 15B.');
    END IF;

  -- ---- ADMISSOES ----
  ELSIF v_norm_module = 'admissoes' THEN
    IF v_base_status IN ('abertura','dados_candidato','documentos') THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Nesta etapa apenas o responsável pela admissão pode editar.');
      END IF;
    ELSIF v_base_status = 'em_aprovacao' THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta admissão.');
      END IF;
    ELSIF v_base_status IN ('cancelado','arquivado') THEN
      v_reasons := array_append(v_reasons, 'Processo de admissão encerrado (' || v_base_status || ').');
    ELSIF v_base_status = 'conclusao' THEN
      v_reasons := array_append(v_reasons, 'Admissão concluída.');
    ELSE
      -- Etapas intermediarias do RH (analise_documental, exames, assinatura, revisao, aprovacao)
      IF public.has_role(v_uid, 'rh'::app_role) OR v_is_master THEN
        v_actions := '["enviar","devolver","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas RH pode avançar o processo de admissão na etapa atual (' || v_base_status || ').');
      END IF;
    END IF;

  -- ---- DESLIGAMENTOS ----
  ELSIF v_norm_module = 'desligamentos' THEN
    IF v_base_status IN ('abertura','rascunho') THEN
      IF v_is_requester OR v_is_master THEN
        v_actions := '["enviar","editar","cancelar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas o solicitante pode editar o desligamento em abertura.');
      END IF;
    ELSIF v_base_status IN ('envio','em_aprovacao') THEN
      IF v_ctx.is_current_actor THEN
        v_actions := '["aprovar","devolver","rejeitar"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Você não é o aprovador atual deste desligamento.');
      END IF;
    ELSIF v_base_status IN ('cancelado','reprovado') THEN
      v_reasons := array_append(v_reasons, 'Desligamento encerrado (' || v_base_status || ').');
    ELSIF v_base_status = 'concluido' THEN
      v_reasons := array_append(v_reasons, 'Desligamento concluído.');
    ELSE
      -- aprovacao, processamento, devolucoes_epi, desvinculos, inativacao
      IF public.has_role(v_uid, 'rh'::app_role) OR v_is_master THEN
        v_actions := '["enviar","devolver"]'::jsonb;
      ELSE
        v_reasons := array_append(v_reasons, 'Apenas RH pode avançar desligamentos na etapa "' || v_base_status || '".');
      END IF;
    END IF;

  ELSE
    -- Este bloco nunca deve ser alcancado dado que validamos acima.
    RAISE EXCEPTION 'Modulo normalizado desconhecido: %', v_norm_module;
  END IF;

  -- ====== 5. MONTAR RESPOSTA FINAL ======
  v_ctx.allowed_actions := v_actions;
  v_ctx.blocked_reasons := v_reasons;
  v_ctx.sla_deadline    := NULL; -- SLA implementado no Sprint 15B
  v_ctx.overdue         := false;

  RETURN v_ctx;
EXCEPTION WHEN OTHERS THEN
  -- Retornar contexto vazio com erro registrado (nao expor stack ao frontend)
  v_ctx.module_key      := p_module_key;
  v_ctx.entity_id       := p_entity_id;
  v_ctx.current_status  := 'ERRO';
  v_ctx.allowed_actions := '[]'::jsonb;
  v_ctx.blocked_reasons := ARRAY['Erro interno ao obter contexto: ' || SQLERRM];
  RETURN v_ctx;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_action_context(TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(TEXT, UUID) TO authenticated;
