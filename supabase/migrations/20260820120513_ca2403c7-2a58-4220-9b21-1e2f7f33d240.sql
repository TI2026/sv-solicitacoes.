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
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    v_ctx.module_key      := p_module_key;
    v_ctx.entity_id       := p_entity_id;
    v_ctx.current_status  := 'ERRO';
    v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Usuário não autenticado.'];
    RETURN v_ctx;
  END IF;

  SELECT active INTO v_user_active FROM public.profiles WHERE id = v_uid;

  IF NOT FOUND OR NOT v_user_active THEN
    v_ctx.module_key      := p_module_key;
    v_ctx.entity_id       := p_entity_id;
    v_ctx.current_status  := 'ERRO';
    v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Usuário inativo ou perfil inexistente.'];
    RETURN v_ctx;
  END IF;

  IF p_module_key IN ('compras', 'purchases') THEN
    v_norm_module := 'compras';
    SELECT status::text, requester_user_id INTO v_base_status, v_base_requester
    FROM public.purchases WHERE id = p_entity_id;
    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key := v_norm_module; v_ctx.entity_id := p_entity_id;
      v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('abastecimento', 'diaria', 'reembolso') THEN
    v_norm_module := p_module_key;
    SELECT status::text, requester_user_id, type::text
      INTO v_base_status, v_base_requester, v_fleet_type
    FROM public.fuel_requests WHERE id = p_entity_id;
    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key := v_norm_module; v_ctx.entity_id := p_entity_id;
      v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;
    IF v_fleet_type IS DISTINCT FROM p_module_key THEN
      v_ctx.module_key := v_norm_module; v_ctx.entity_id := p_entity_id;
      v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Módulo incompatível. Solicitado: ' || p_module_key || ', Real: ' || COALESCE(v_fleet_type, 'NULL')];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('admissoes', 'admissions') THEN
    v_norm_module := 'admissoes';
    SELECT status::text, requester_user_id INTO v_base_status, v_base_requester
    FROM public.admission_requests WHERE id = p_entity_id;
    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key := v_norm_module; v_ctx.entity_id := p_entity_id;
      v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSIF p_module_key IN ('desligamentos', 'terminations') THEN
    v_norm_module := 'desligamentos';
    SELECT status::text, requester_user_id INTO v_base_status, v_base_requester
    FROM public.termination_requests WHERE id = p_entity_id;
    IF NOT FOUND OR v_base_status IS NULL THEN
      v_ctx.module_key := v_norm_module; v_ctx.entity_id := p_entity_id;
      v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
      v_ctx.blocked_reasons := ARRAY['Entidade não encontrada ou inacessível.'];
      RETURN v_ctx;
    END IF;

  ELSE
    v_ctx.module_key := p_module_key; v_ctx.entity_id := p_entity_id;
    v_ctx.current_status := 'ERRO'; v_ctx.allowed_actions := '[]'::jsonb;
    v_ctx.blocked_reasons := ARRAY['Módulo inválido ou desconhecido: ' || p_module_key];
    RETURN v_ctx;
  END IF;

  v_ctx.module_key        := v_norm_module;
  v_ctx.entity_id         := p_entity_id;
  v_ctx.current_status    := v_base_status;
  v_ctx.requester_user_id := v_base_requester;
  v_is_requester          := (v_uid = v_base_requester);

  SELECT ar.id AS ar_id, ar.flow_id AS flow_id, ar.status AS ar_status,
         ars.step_order AS step_order, ars.approver_user_id AS approver_user_id,
         af.name AS flow_name, afs.approver_role_key AS responsible_rule
  INTO v_flow_rec
  FROM public.approval_requests ar
  JOIN public.approval_flows af ON af.id = ar.flow_id
  LEFT JOIN public.approval_request_steps ars
    ON ars.approval_request_id = ar.id AND ars.status = 'pending'
  LEFT JOIN public.approval_flow_steps afs
    ON afs.flow_id = ar.flow_id AND afs.step_order = ars.step_order
  WHERE ar.reference_id = p_entity_id
    AND ar.status NOT IN ('approved', 'rejected', 'cancelled')
  ORDER BY ar.created_at DESC, ars.step_order ASC
  LIMIT 1;

  IF FOUND AND v_flow_rec.ar_id IS NOT NULL THEN
    v_ctx.flow_version             := v_flow_rec.flow_name;
    v_ctx.current_step_order       := v_flow_rec.step_order;
    v_ctx.current_step_name        := NULL;
    v_ctx.current_approver_user_id := v_flow_rec.approver_user_id;
    IF v_flow_rec.approver_user_id IS NOT NULL THEN
      v_ctx.is_current_actor := (v_uid = v_flow_rec.approver_user_id);
    ELSE
      v_ctx.is_current_actor := v_is_requester;
    END IF;
    SELECT afs2.step_order, afs2.approver_role_key
      INTO v_ctx.next_step_order, v_ctx.next_responsible_rule
    FROM public.approval_flow_steps afs2
    WHERE afs2.flow_id = v_flow_rec.flow_id
      AND afs2.step_order > COALESCE(v_flow_rec.step_order, 0)
    ORDER BY afs2.step_order ASC LIMIT 1;
    v_ctx.next_step_name := NULL;
    v_ctx.sla_deadline := NULL;
    v_ctx.overdue      := false;
  ELSE
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

  IF v_norm_module = 'compras' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'retornado' THEN
        IF v_is_requester THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode reenviar após devolução.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'abastecimento' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'diaria' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'reembolso' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'retornado' THEN
        IF v_is_requester THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode reenviar após devolução.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'reprovado', 'rejeitado', 'cancelado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído' THEN
        v_reasons := array_append(v_reasons, 'Solicitação concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'admissoes' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'cancelado', 'reprovado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'concluido', 'concluído', 'conclusao' THEN
        v_reasons := array_append(v_reasons, 'Admissão concluída.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  ELSIF v_norm_module = 'desligamentos' THEN
    CASE v_base_status
      WHEN 'rascunho' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["enviar", "cancelar"]'::jsonb;
        ELSE v_reasons := array_append(v_reasons, 'Apenas o solicitante pode atuar no estágio inicial.'); END IF;
      WHEN 'em_aprovacao' THEN
        IF v_ctx.is_current_actor THEN v_actions := '["aprovar", "devolver", "rejeitar"]'::jsonb;
        ELSE
          IF v_is_requester THEN v_reasons := array_append(v_reasons, 'Solicitação em aprovação. Aguarde a decisão do aprovador.');
          ELSE v_reasons := array_append(v_reasons, 'Você não é o aprovador atual desta etapa.'); END IF;
        END IF;
      WHEN 'cancelado', 'reprovado' THEN
        v_reasons := array_append(v_reasons, 'Solicitação encerrada.');
      WHEN 'desligamento_concluido' THEN
        v_reasons := array_append(v_reasons, 'Desligamento concluído.');
      ELSE
        v_reasons := array_append(v_reasons, 'Etapa operacional posterior. Ações de aprovação não permitidas neste sprint.');
    END CASE;

  END IF;

  v_ctx.allowed_actions := v_actions;
  v_ctx.blocked_reasons := v_reasons;

  RETURN v_ctx;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_action_context(TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(TEXT, UUID) TO authenticated;