-- =======================================================================================
-- MIGRATION: sprint15_2b_start_approval_flow.sql (Correção + Função)
-- DESCRIÇÃO: Resolve a falta de estado 'em_aprovacao' e implementa start_approval_flow.
-- =======================================================================================

ALTER TYPE public.admission_status ADD VALUE IF NOT EXISTS 'em_aprovacao' AFTER 'rascunho';

-- ============================================================
-- 1. ASSINATURA ADMINISTRATIVA (COMPATIBILIDADE E IMPERSONATION)
-- ============================================================
DROP FUNCTION IF EXISTS public.start_approval_flow(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.start_approval_flow(text, uuid);

CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_key text,
  p_entity_id uuid,
  p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_real_requester uuid;
  v_is_master_or_admin boolean;
  v_module_id uuid;
  v_table text;
  v_discriminator_col text;
  v_discriminator_val text;
  v_status_col text;
  v_requester_col text;
  
  v_entity_status text;
  v_entity_requester uuid;
  
  v_flow_rec record;
  v_step_rec record;
  
  v_request_id uuid;
  
  v_resolved_user_id uuid;
  v_resolved_sector_id uuid;
  v_resolved_role_key text;
  
  v_first_approver uuid := NULL;
  v_is_first_step boolean := true;
  
  v_query text;
  v_active boolean;
BEGIN
  -- 1. Validar usuário autenticado
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  SELECT COALESCE(active, true) INTO v_active FROM public.profiles WHERE id = v_uid;
  IF NOT v_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário inativo.');
  END IF;

  -- 2. Validar Impersonation
  IF p_requester_user_id <> v_uid THEN
    v_is_master_or_admin := public.has_role(v_uid, 'master'::app_role) OR public.has_role(v_uid, 'administrativo'::app_role);
    IF NOT v_is_master_or_admin THEN
      RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para iniciar fluxo em nome de outro usuário.');
    END IF;
    v_real_requester := p_requester_user_id;
  ELSE
    v_real_requester := v_uid;
  END IF;

  -- 3. Mapear Módulo
  v_discriminator_col := NULL;
  v_discriminator_val := NULL;

  CASE p_module_key
    WHEN 'compras', 'purchases' THEN
      p_module_key := 'compras';
      v_table := 'purchases';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
    WHEN 'abastecimento' THEN
      p_module_key := 'abastecimento';
      v_table := 'fuel_requests';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type';
      v_discriminator_val := 'abastecimento';
    WHEN 'diaria' THEN
      p_module_key := 'diaria';
      v_table := 'fuel_requests';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type';
      v_discriminator_val := 'diaria';
    WHEN 'reembolso' THEN
      p_module_key := 'reembolso';
      v_table := 'fuel_requests';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
      v_discriminator_col := 'type';
      v_discriminator_val := 'reembolso';
    WHEN 'admissoes', 'admissions' THEN
      p_module_key := 'admissoes';
      v_table := 'admission_requests';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
    WHEN 'desligamentos', 'terminations' THEN
      p_module_key := 'desligamentos';
      v_table := 'termination_requests';
      v_status_col := 'status';
      v_requester_col := 'requester_user_id';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Módulo desconhecido: ' || p_module_key);
  END CASE;

  -- Obter module_id
  SELECT id INTO v_module_id FROM public.approval_modules WHERE code = p_module_key AND active = true;
  IF v_module_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Módulo inativo ou não configurado.');
  END IF;

  -- 4. Bloquear e carregar a entidade (FOR UPDATE)
  IF v_discriminator_col IS NOT NULL THEN
    v_query := format('SELECT %I, %I FROM public.%I WHERE id = $1 AND %I = $2 FOR UPDATE', v_status_col, v_requester_col, v_table, v_discriminator_col);
    EXECUTE v_query INTO v_entity_status, v_entity_requester USING p_entity_id, v_discriminator_val;
  ELSE
    v_query := format('SELECT %I, %I FROM public.%I WHERE id = $1 FOR UPDATE', v_status_col, v_requester_col, v_table);
    EXECUTE v_query INTO v_entity_status, v_entity_requester USING p_entity_id;
  END IF;

  IF v_entity_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entidade não encontrada ou discriminator incompatível.');
  END IF;

  -- 5. Validar ownership
  IF v_entity_requester <> v_real_requester THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas o solicitante original pode iniciar o fluxo.');
  END IF;

  -- 6. Validar status da entidade
  IF v_entity_status NOT IN ('rascunho', 'retornado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status atual (' || v_entity_status || ') não permite envio para aprovação.');
  END IF;

  -- 7. Validar duplicidade (Idempotência)
  IF EXISTS (
    SELECT 1 FROM public.approval_requests 
    WHERE reference_id = p_entity_id 
      AND status NOT IN ('approved', 'rejected', 'cancelled')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um fluxo de aprovação ativo para esta entidade.');
  END IF;

  -- 8. Obter fluxo canônico
  SELECT * INTO v_flow_rec 
  FROM public.approval_flows 
  WHERE module_id = v_module_id AND active = true 
  ORDER BY created_at DESC LIMIT 1;

  IF v_flow_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nenhum fluxo de aprovação ativo encontrado para o módulo.');
  END IF;

  -- Verificar se há etapas
  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = v_flow_rec.id AND active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'O fluxo não possui etapas configuradas.');
  END IF;

  -- 9. Criar Request Snapshot
  INSERT INTO public.approval_requests (
    module_id, flow_id, reference_id, requester_user_id, status
  ) VALUES (
    v_module_id, v_flow_rec.id, p_entity_id, v_real_requester, 'pending_resolution'
  ) RETURNING id INTO v_request_id;

  -- 10. Resolver e Inserir Etapas
  FOR v_step_rec IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = v_flow_rec.id AND active = true
    ORDER BY step_order ASC
  LOOP
    v_resolved_user_id := NULL;
    v_resolved_sector_id := NULL;
    v_resolved_role_key := NULL;

    -- Resolução do responsável
    CASE COALESCE(v_step_rec.approver_type, 'usuario_fixo')
      WHEN 'usuario_fixo' THEN
        v_resolved_user_id := v_step_rec.approver_user_id;

      WHEN 'responsavel_do_setor_do_solicitante' THEN
        SELECT s.responsible_user_id INTO v_resolved_user_id
        FROM public.profiles p
        JOIN public.sectors s ON s.id = p.sector_id AND s.active = true
        WHERE p.id = v_real_requester;
        
        IF v_resolved_user_id IS NULL OR v_resolved_user_id = v_real_requester THEN
          -- Fallback substituto
          SELECT s.substitute_user_id INTO v_resolved_user_id
          FROM public.profiles p
          JOIN public.sectors s ON s.id = p.sector_id AND s.active = true
          WHERE p.id = v_real_requester;
        END IF;

      WHEN 'responsavel_do_setor_especifico' THEN
        IF v_step_rec.fixed_sector_id IS NOT NULL THEN
          SELECT responsible_user_id INTO v_resolved_user_id
          FROM public.sectors
          WHERE id = v_step_rec.fixed_sector_id AND active = true;

          IF v_resolved_user_id IS NULL THEN
            SELECT substitute_user_id INTO v_resolved_user_id
            FROM public.sectors
            WHERE id = v_step_rec.fixed_sector_id AND active = true;
          END IF;
          v_resolved_sector_id := v_step_rec.fixed_sector_id;
        END IF;

      WHEN 'gestor_imediato' THEN
        SELECT manager_user_id INTO v_resolved_user_id
        FROM public.profiles
        WHERE id = v_real_requester;

      WHEN 'cargo_perfil' THEN
        IF v_step_rec.approver_role_key IS NOT NULL THEN
          -- Tenta achar alguém do mesmo setor com o cargo
          SELECT ura.user_id INTO v_resolved_user_id
          FROM public.user_role_assignments ura
          JOIN public.roles r ON r.id = ura.role_id AND r.key = v_step_rec.approver_role_key
          JOIN public.profiles p ON p.id = ura.user_id AND COALESCE(p.active, true)
          WHERE p.sector_id = (SELECT sector_id FROM public.profiles WHERE id = v_real_requester)
            AND p.id <> v_real_requester
          ORDER BY p.full_name ASC LIMIT 1;
          
          -- Se não achar no setor, pega qualquer um com o cargo (fallback global)
          IF v_resolved_user_id IS NULL THEN
            SELECT ura.user_id INTO v_resolved_user_id
            FROM public.user_role_assignments ura
            JOIN public.roles r ON r.id = ura.role_id AND r.key = v_step_rec.approver_role_key
            JOIN public.profiles p ON p.id = ura.user_id AND COALESCE(p.active, true)
            WHERE p.id <> v_real_requester
            ORDER BY p.full_name ASC LIMIT 1;
          END IF;

          v_resolved_role_key := v_step_rec.approver_role_key;
        END IF;

      ELSE
        v_resolved_user_id := v_step_rec.approver_user_id;
    END CASE;

    -- Usar substituto_user_id da step se principal nulo ou inativo
    IF v_resolved_user_id IS NULL AND v_step_rec.substitute_user_id IS NOT NULL THEN
      v_resolved_user_id := v_step_rec.substitute_user_id;
    END IF;

    -- Checar se usuário resolvido é ativo e não é o próprio solicitante
    IF v_resolved_user_id IS NOT NULL THEN
      SELECT COALESCE(active, true) INTO v_active FROM public.profiles WHERE id = v_resolved_user_id;
      IF NOT v_active THEN
        v_resolved_user_id := NULL;
      END IF;
      IF v_resolved_user_id = v_real_requester THEN
        -- Autoaprovação proibida. Tentativa de fallback? Se não houver, falha.
        v_resolved_user_id := NULL;
      END IF;
    END IF;

    IF v_resolved_user_id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível resolver o aprovador para a etapa % (%)', v_step_rec.step_order, COALESCE(v_step_rec.step_name, v_step_rec.step_code, 'Desconhecida');
    END IF;

    IF v_is_first_step THEN
      v_first_approver := v_resolved_user_id;
    END IF;

    INSERT INTO public.approval_request_steps (
      approval_request_id,
      flow_step_id,
      step_order,
      approver_user_id,
      status,
      approver_rule,
      resolved_sector_id,
      approver_role_key
    ) VALUES (
      v_request_id,
      v_step_rec.id,
      v_step_rec.step_order,
      v_resolved_user_id,
      CASE WHEN v_is_first_step THEN 'pending' ELSE 'waiting' END,
      COALESCE(v_step_rec.approver_type, 'usuario_fixo'),
      v_resolved_sector_id,
      v_resolved_role_key
    );

    v_is_first_step := false;
  END LOOP;

  -- 11. Atualizar request para in_progress
  UPDATE public.approval_requests 
  SET status = 'in_progress' 
  WHERE id = v_request_id;

  -- 12. Atualizar status da entidade (ATÔMICO)
  v_query := format('UPDATE public.%I SET %I = %L, updated_at = now() WHERE id = $1', v_table, v_status_col, 'em_aprovacao');
  EXECUTE v_query USING p_entity_id;

  -- 13. Inserir Histórico e Auditoria
  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES (p_module_key, p_module_key, p_entity_id, v_entity_status, 'em_aprovacao', v_uid);

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_uid, 'START_APPROVAL', p_module_key, p_entity_id,
    jsonb_build_object(
      'flow_id', v_flow_rec.id,
      'flow_version', COALESCE(v_flow_rec.version, 'v1'),
      'first_approver', v_first_approver
    )
  );

  -- 14. Notificação
  IF v_first_approver IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (
      v_first_approver, 'Nova aprovação pendente',
      'Você tem uma nova solicitação aguardando aprovação (' || UPPER(p_module_key) || ').',
      jsonb_build_object(
        'type', 'approval_assigned',
        'link', '/' || (CASE WHEN p_module_key IN ('abastecimento','diaria','reembolso') THEN 'fleet' ELSE p_module_key END) || '/' || p_entity_id
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Revogar EXECUTE para anon
REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_approval_flow(text, uuid, uuid) TO authenticated;

-- ============================================================
-- 2. ASSINATURA OFICIAL DO SPRINT 15.2B
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_key text,
  p_entity_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  -- Delega para a função administrativa usando auth.uid() como o solicitante
  RETURN public.start_approval_flow(p_module_key, p_entity_id, auth.uid());
END;
$$;

-- Revogar EXECUTE para anon
REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_approval_flow(text, uuid) TO authenticated;

-- ============================================================
-- 3. REMOVER ATUALIZAÇÃO DUPLICADA EM execute_entity_action
-- ============================================================
-- Se o execute_entity_action tentar atualizar o status e salvar history para 'enviar', 
-- devemos remover isso de lá pois agora é responsabilidade ATÔMICA do start_approval_flow.
-- Para manter integridade sem editar a migration anterior, nós sobrepomos a função aqui.
CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_entity_id uuid,
  p_action text,
  p_comments text DEFAULT NULL,
  p_additional_data jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx public.entity_action_context;
  v_module text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- 1. Obter contexto
  v_ctx := public.get_entity_action_context(NULL, p_entity_id);
  
  IF v_ctx.current_status = 'ERRO' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Falha ao obter contexto.', 'blocked_reasons', to_json(v_ctx.blocked_reasons));
  END IF;

  -- 2. Verificar permissao
  IF NOT (v_ctx.allowed_actions ? p_action) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação "' || p_action || '" não permitida para o status "' || v_ctx.current_status || '".', 'blocked_reasons', to_json(v_ctx.blocked_reasons));
  END IF;

  v_module := v_ctx.module_key;

  -- 3. EXECUTAR ACAO
  IF p_action = 'enviar' THEN
    -- Iniciar fluxo de aprovacao (AGORA É 100% ATÔMICO DENTRO DESTA FUNÇÃO)
    v_result := public.start_approval_flow(v_module, p_entity_id, v_uid);
    IF v_result->>'error' IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Falha ao iniciar fluxo: ' || (v_result->>'error'));
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Solicitação enviada com sucesso.');
  
  ELSIF p_action IN ('aprovar', 'devolver', 'rejeitar', 'cancelar') THEN
    v_result := public.process_approval_action(p_entity_id, p_action, p_comments);
    IF v_result->>'error' IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Falha ao processar ação: ' || (v_result->>'error'));
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Ação "' || p_action || '" executada com sucesso.');
  
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação operacional "' || p_action || '" ainda não implementada neste módulo genérico.');
  END IF;
END;
$$;
