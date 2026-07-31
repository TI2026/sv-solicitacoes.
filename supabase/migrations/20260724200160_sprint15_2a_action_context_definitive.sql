-- ============================================================
-- SPRINT 15.2A: Migration 020 - get_entity_action_context DEFINITIVO
-- ============================================================
-- Fonte absoluta de verdade para determinar:
--   - estado atual
--   - responsável atual (via approval_requests + approval_request_steps + fluxo canônico)
--   - ações de aprovação permitidas
--   - motivos de bloqueio
-- para os seis módulos: compras, abastecimento, diaria, reembolso, admissoes, desligamentos.
--
-- REGRAS:
--   - SECURITY DEFINER para acessar tabelas protegidas por RLS sem depender do contexto do chamador.
--   - search_path explícito e seguro.
--   - Erros de negócio retornam current_status = 'ERRO' com blocked_reasons (comportamento esperado).
--   - Erros técnicos inesperados (coluna ausente, falha SQL) são lançados via RAISE (sem WHEN OTHERS oculto).
--   - anon NÃO possui permissão de execução.
--   - allowed_actions sempre array JSONB válido.
--   - blocked_reasons sempre array TEXT válido.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_entity_action_context(p_module_key TEXT, p_entity_id UUID)
RETURNS public.entity_action_context
SECURITY DEFINER
SET search_path = 'public', 'auth'
LANGUAGE plpgsql
AS $$
DECLARE
  v_ctx                   public.entity_action_context;
  v_uid                   UUID;
  v_user_active           BOOLEAN;
  v_norm_module           TEXT;
  v_base_status           TEXT;
  v_base_requester        UUID;
  v_fleet_type            TEXT;
  v_is_requester          BOOLEAN;
  v_flow_rec              RECORD;
  v_actions               JSONB := '[]'::jsonb;
  v_reasons               TEXT[] := ARRAY[]::TEXT[];
BEGIN

  -- ================================================================
  -- 1. AUTENTICAÇÃO: auth.uid() obrigatório
  -- ================================================================
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    v_ctx.module_key      := p_module_key;
    v_ctx.entity_id       := p_entity_id;
    v_ctx.current_status  := 'ERRO';
    v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Usuário não autenticado.'];
    RETURN v_ctx;
  END IF;

  -- ================================================================
  -- 2. USUÁRIO ATIVO
  -- ================================================================
  SELECT active INTO v_user_active
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND OR NOT v_user_active THEN
    v_ctx.module_key      := p_module_key;
    v_ctx.entity_id       := p_entity_id;
    v_ctx.current_status  := 'ERRO';
    v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Usuário inativo ou perfil inexistente.'];
    RETURN v_ctx;
  END IF;

  -- ================================================================
  -- 3. NORMALIZAÇÃO E LEITURA DA ENTIDADE
  -- ================================================================
  IF p_module_key IN ('compras', 'purchases') THEN
    -- ---- COMPRAS ----
    v_norm_module := 'compras';
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.purchases
    WHERE id = p_entity_id;

    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key      := v_norm_module;
      v_ctx.entity_id       := p_entity_id;
      v_ctx.current_status  := 'ERRO';
      v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('abastecimento', 'diaria', 'reembolso') THEN
    -- ---- FUEL_REQUESTS COM DISCRIMINATOR ----
    v_norm_module := p_module_key;
    SELECT status::text, requester_user_id, type::text
      INTO v_base_status, v_base_requester, v_fleet_type
    FROM public.fuel_requests
    WHERE id = p_entity_id;

    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key      := v_norm_module;
      v_ctx.entity_id       := p_entity_id;
      v_ctx.current_status  := 'ERRO';
      v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

    -- Validar discriminator
    IF v_fleet_type IS DISTINCT FROM p_module_key THEN
      v_ctx.module_key      := v_norm_module;
      v_ctx.entity_id       := p_entity_id;
      v_ctx.current_status  := 'ERRO';
      v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY[
        'Módulo incompatível. Solicitado: ' || p_module_key ||
        ', Real: ' || COALESCE(v_fleet_type, 'NULL')
      ];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('admissoes', 'admissions') THEN
    -- ---- ADMISSÕES ----
    v_norm_module := 'admissoes';
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.admission_requests
    WHERE id = p_entity_id;

    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key      := v_norm_module;
      v_ctx.entity_id       := p_entity_id;
      v_ctx.current_status  := 'ERRO';
      v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('desligamentos', 'terminations') THEN
    -- ---- DESLIGAMENTOS ----
    v_norm_module := 'desligamentos';
    SELECT status::text, requester_user_id
      INTO v_base_status, v_base_requester
    FROM public.termination_requests
    WHERE id = p_entity_id;

    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key      := v_norm_module;
      v_ctx.entity_id       := p_entity_id;
      v_ctx.current_status  := 'ERRO';
      v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSE
    -- ---- MÓDULO DESCONHECIDO ----
    -- Não consultar tabela genérica. Retornar erro controlado de negócio.
    v_ctx.module_key      := p_module_key;
    v_ctx.entity_id       := p_entity_id;
    v_ctx.current_status  := 'ERRO';
    v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Módulo inválido ou desconhecido: ' || p_module_key];
    RETURN v_ctx;
  END IF;

  -- ================================================================
  -- 4. PREENCHER CAMPOS BASE DO CONTEXTO
  -- ================================================================
  v_ctx.module_key        := v_norm_module;
  v_ctx.entity_id         := p_entity_id;
  v_ctx.current_status    := v_base_status;
  v_ctx.requester_user_id := v_base_requester;
  v_is_requester          := (v_uid = v_base_requester);

  -- ================================================================
  -- 5. ESTADO DO FLUXO DE APROVAÇÃO
  --    Responsável vem EXCLUSIVAMENTE de:
  --      approval_requests + approval_request_steps + fluxo canônico ativo
  --
  --    NOTA: Usa apenas colunas da baseline (step_order, approver_role_key).
  --    As colunas step_name e default_sla_hours só existem após a migration
  --    20260725100000, portanto ficam como NULL nesta função para garantir
  --    compatibilidade na ordem de aplicação das migrations.
  -- ================================================================
  SELECT
    ar.id                AS ar_id,
    ar.flow_id           AS flow_id,
    ar.status            AS ar_status,
    ars.step_order       AS step_order,
    ars.approver_user_id AS approver_user_id,
    af.name              AS flow_name,
    afs.approver_role_key AS responsible_rule
  INTO v_flow_rec
  FROM public.approval_requests ar
  JOIN public.approval_flows af ON af.id = ar.flow_id
  LEFT JOIN public.approval_request_steps ars
    ON ars.approval_request_id = ar.id
   AND ars.status = 'pending'
  LEFT JOIN public.approval_flow_steps afs
    ON afs.flow_id = ar.flow_id
   AND afs.step_order = ars.step_order
  WHERE ar.reference_id = p_entity_id
    AND ar.status NOT IN ('approved', 'rejected', 'cancelled')
  ORDER BY ar.created_at DESC, ars.step_order ASC
  LIMIT 1;

  IF FOUND AND v_flow_rec.ar_id IS NOT NULL THEN
    -- Fluxo ativo encontrado
    v_ctx.flow_version             := v_flow_rec.flow_name;
    v_ctx.current_step_order       := v_flow_rec.step_order;
    v_ctx.current_step_name        := NULL; -- populado após migration 20260725100000
    v_ctx.current_approver_user_id := v_flow_rec.approver_user_id;
    -- Actor: aprovador da etapa pendente OU solicitante se fluxo não tiver etapa pendente
    IF v_flow_rec.approver_user_id IS NOT NULL THEN
      v_ctx.is_current_actor := (v_uid = v_flow_rec.approver_user_id);
    ELSE
      v_ctx.is_current_actor := v_is_requester;
    END IF;
    -- Next step: busca próxima etapa do fluxo (apenas step_order e approver_role_key da baseline)
    SELECT afs2.step_order, afs2.approver_role_key
      INTO v_ctx.next_step_order, v_ctx.next_responsible_rule
    FROM public.approval_flow_steps afs2
    WHERE afs2.flow_id = v_flow_rec.flow_id
      AND afs2.step_order > COALESCE(v_flow_rec.step_order, 0)
    ORDER BY afs2.step_order ASC
    LIMIT 1;
    v_ctx.next_step_name := NULL; -- populado após migration 20260725100000
    -- SLA: não calculado aqui (depende de default_sla_hours, adicionado em 20260725100000)
    v_ctx.sla_deadline := NULL;
    v_ctx.overdue      := false;
  ELSE
    -- Sem fluxo ativo: contexto é do solicitante
    v_ctx.flow_version             := NULL;
    v_ctx.current_step_order       := NULL;
    v_ctx.current_step_name        := NULL;
    v_ctx.current_approver_user_id := NULL;
    v_ctx.is_current_actor         := v_is_requester;
    v_ctx.next_step_order          := NULL;
    v_ctx.next_step_name           := NULL;
    v_ctx.next_responsible_rule    := NULL;
    v_ctx.sla_deadline             := NULL;
    v_ctx.overdue                  := false;
  END IF;


  -- ================================================================
  -- 6. LÓGICA DE AÇÕES POR MÓDULO
  --    Apenas ações de início e aprovação neste sprint:
  --    enviar, aprovar, devolver, rejeitar, cancelar
  -- ================================================================

  IF v_norm_module = 'compras' THEN
    -- ---- COMPRAS ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'retornado' THEN
        -- Retornado: solicitante pode reenviar
        IF v_is_requester THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode reenviar após devolução.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        -- Status operacional posterior (aguardando_oc, aguardando_pagamento, etc.)
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'abastecimento' THEN
    -- ---- ABASTECIMENTO ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'diaria' THEN
    -- ---- DIÁRIA ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'reembolso' THEN
    -- ---- REEMBOLSO ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'retornado' THEN
        IF v_is_requester THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode reenviar após devolução.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'admissoes' THEN
    -- ---- ADMISSÕES ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'cancelado', 'reprovado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído', 'conclusao' THEN
        v_reasons := array_append(v_reasons, 'Admissão concluída.');
      ELSE
        -- Etapas intermediárias do fluxo de admissão
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'desligamentos' THEN
    -- ---- DESLIGAMENTOS ----
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE
          v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.');
        END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN
          v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN
            v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE
            v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.');
          END IF;
        END IF;
      WHEN 'cancelado', 'reprovado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'desligamento_concluido' THEN
        v_reasons := array_append(v_reasons, 'Desligamento concluído.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  END IF;

  -- ================================================================
  -- 7. MONTAR RESPOSTA FINAL
  -- ================================================================
  v_ctx.allowed_actions := v_actions;
  v_ctx.blocked_reasons := v_reasons;

  RETURN v_ctx;

  -- *** INTENCIONALMENTE SEM "EXCEPTION WHEN OTHERS THEN" ***
  -- Erros técnicos inesperados (coluna ausente, função inválida, etc.)
  -- devem ser lançados sem silêncio para que logs e testes os revelem.
END;
$$;

-- ================================================================
-- GRANTS: anon não executa; apenas authenticated
-- ================================================================
REVOKE ALL ON FUNCTION public.get_entity_action_context(TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(TEXT, UUID) TO authenticated;
