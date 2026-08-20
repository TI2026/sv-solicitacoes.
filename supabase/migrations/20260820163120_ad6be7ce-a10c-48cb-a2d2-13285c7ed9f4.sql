-- Sprint Final 1 — Convergência V2
-- Adiciona a trilha OPERACIONAL de Admissões ao ponto de entrada único
-- execute_entity_action, delegando para admission_set_status (que mantém
-- as validações de permissão, transição e histórico).
CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key text, p_entity_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_mod      text;
  v_ent      RECORD;
  v_req      RECORD;
  v_step     RECORD;
  v_master   boolean;
  v_action   text := lower(trim(p_action));
  v_notes    text := NULLIF(trim(COALESCE(p_payload->>'notes','')), '');
  v_res      jsonb;
  v_new      text;
  v_adm_next text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('code','401','message','Não autenticado'); END IF;

  v_mod := public._engine_module_norm(p_module_key);
  IF v_mod IS NULL THEN RETURN jsonb_build_object('code','400','message','Módulo inválido'); END IF;

  v_action := CASE v_action WHEN 'approve' THEN 'aprovar' WHEN 'reject' THEN 'rejeitar'
                            WHEN 'return' THEN 'devolver' WHEN 'submit' THEN 'enviar'
                            WHEN 'cancel' THEN 'cancelar' ELSE v_action END;

  PERFORM pg_advisory_xact_lock_shared(hashtext('approval_engine_config'));

  SELECT * INTO v_ent FROM public._engine_entity_read(v_mod, p_entity_id, true);
  IF v_ent.requester_user_id IS NULL AND v_ent.status IS NULL THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  v_master := public.is_master(v_uid);

  IF NOT public._engine_can_view(v_mod, p_entity_id, v_ent.requester_user_id, v_uid) THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  SELECT ar.* INTO v_req FROM public.approval_requests ar
  WHERE ar.reference_id = p_entity_id AND ar.ended_at IS NULL
  ORDER BY ar.created_at DESC LIMIT 1;

  IF v_req.id IS NOT NULL THEN
    SELECT * INTO v_step FROM public.approval_request_steps
    WHERE approval_request_id = v_req.id AND step_order = v_req.current_step_order;
  END IF;

  IF v_action IN ('devolver','rejeitar')
     OR (v_req.id IS NOT NULL AND v_req.status = 'awaiting_step'
         AND v_action IN ('aprovar', COALESCE(v_step.completion_action,'aprovar'))) THEN
    IF v_req.id IS NULL THEN
      RETURN jsonb_build_object('code','409','message','Nenhum fluxo ativo para esta solicitação');
    END IF;
    v_res := public.process_approval_action(v_req.id, v_action, v_notes);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('code','200','message','Ação processada','data', v_res);
    END IF;
    RETURN jsonb_build_object('code', CASE v_res->>'error' WHEN 'CONFLICT' THEN '409' ELSE '400' END,
                              'message', COALESCE(v_res->>'detail', v_res->>'error', 'Falha na ação'),
                              'data', v_res);
  END IF;

  IF v_action = 'enviar' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar');
    END IF;
    IF v_req.id IS NOT NULL AND v_req.status = 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Solicitação já está em aprovação');
    END IF;
    IF v_mod = 'reembolso' AND NOT EXISTS (
      SELECT 1 FROM public.fuel_attachments fa WHERE fa.fuel_request_id = p_entity_id
    ) THEN
      RETURN jsonb_build_object('code','422','message','Anexe o comprovante antes de enviar o reembolso');
    END IF;
    v_res := public.start_approval_flow(v_mod, p_entity_id, v_ent.requester_user_id);
    IF COALESCE(v_res->>'error','') <> '' THEN
      RETURN jsonb_build_object('code','422','message', v_res->>'error', 'data', v_res);
    END IF;
    RETURN jsonb_build_object('code','200','message','Solicitação enviada','data', v_res);
  END IF;

  IF v_action = 'enviar_comprovantes' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode enviar comprovantes');
    END IF;
    IF v_req.id IS NULL OR v_req.status NOT IN ('waiting_operational','returned') THEN
      RETURN jsonb_build_object('code','409','message','A solicitação não aguarda comprovantes');
    END IF;

    IF v_mod = 'abastecimento' THEN
      IF NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id AND type='hodometro')
         OR NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id AND type='nota_fiscal') THEN
        RETURN jsonb_build_object('code','422','message','Envie a foto do hodômetro e a nota fiscal');
      END IF;
    ELSIF v_mod = 'diaria' THEN
      IF NOT EXISTS (SELECT 1 FROM public.fuel_attachments WHERE fuel_request_id=p_entity_id) THEN
        RETURN jsonb_build_object('code','422','message','Anexe ao menos um comprovante da diária');
      END IF;
    END IF;

    IF v_req.status = 'returned' THEN
      v_res := public._engine_reactivate_returned(v_req.id);
    ELSE
      v_res := public._engine_activate_next(v_req.id, v_req.current_step_order);
      IF NOT COALESCE((v_res->>'activated')::boolean, false) THEN
        UPDATE public.approval_requests SET status='completed', ended_at=now(),
               current_approver_user_id=NULL, updated_at=now() WHERE id = v_req.id;
      END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENGINE_V2_ENVIAR_COMPROVANTES', v_mod, p_entity_id::text,
            jsonb_build_object('approval_request_id', v_req.id, 'result', v_res));
    RETURN jsonb_build_object('code','200','message','Comprovantes enviados','data', v_res);
  END IF;

  IF v_action = 'cancelar' THEN
    IF v_uid IS DISTINCT FROM v_ent.requester_user_id AND NOT v_master THEN
      RETURN jsonb_build_object('code','403','message','Sem permissão para cancelar');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Informe o motivo do cancelamento (mín. 10 caracteres)');
    END IF;
    IF v_ent.status IN ('pago','concluido','entregue','desligamento_concluido','cancelado','arquivado') THEN
      RETURN jsonb_build_object('code','409','message','Solicitação não pode mais ser cancelada');
    END IF;

    IF v_req.id IS NOT NULL THEN
      UPDATE public.approval_request_steps
         SET status='cancelled', action_at=now()
       WHERE approval_request_id = v_req.id AND status IN ('pending','waiting');
      UPDATE public.approval_requests
         SET status='cancelled', ended_at=now(), current_approver_user_id=NULL, updated_at=now()
       WHERE id = v_req.id;
    END IF;

    PERFORM public._update_entity_status(v_mod, p_entity_id, 'cancelado');
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (v_mod, v_mod, p_entity_id, v_ent.status, 'cancelado', v_uid);
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENGINE_V2_CANCELAR', v_mod, p_entity_id::text,
            jsonb_build_object('reason', v_notes, 'approval_request_id', v_req.id));
    RETURN jsonb_build_object('code','200','message','Solicitação cancelada');
  END IF;

  -- ── Admissões: trilha OPERACIONAL (pós-aprovação da vaga) ──────────────
  -- Delegada a admission_set_status, que valida permissão, transição e log.
  IF v_mod = 'admissoes' AND v_action = 'avancar_etapa' THEN
    v_adm_next := NULLIF(trim(COALESCE(p_payload->>'to_status','')), '');
    IF v_adm_next IS NULL THEN
      RETURN jsonb_build_object('code','422','message','Informe a etapa de destino');
    END IF;
    IF v_adm_next NOT IN ('em_triagem','aguardando_documentos','documentos_em_analise',
                          'aguardando_exame','exame_realizado','aguardando_registro',
                          'registros_concluidos','concluido') THEN
      RETURN jsonb_build_object('code','400','message','Etapa operacional inválida');
    END IF;
    IF v_req.id IS NOT NULL AND v_req.status = 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Ação indisponível enquanto o fluxo está em andamento');
    END IF;
    v_res := public.admission_set_status(p_entity_id, v_adm_next::admission_status, v_notes, p_payload);
    IF COALESCE(v_res->>'error','') <> '' THEN
      RETURN jsonb_build_object('code','422','message', v_res->>'error', 'data', v_res);
    END IF;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'ENGINE_V2_AVANCAR_ETAPA', v_mod, p_entity_id::text,
            jsonb_build_object('from', v_ent.status, 'to', v_adm_next));
    RETURN jsonb_build_object('code','200','message','Etapa atualizada','data', v_res);
  END IF;

  IF v_req.id IS NOT NULL AND v_req.status IN ('awaiting_step','waiting_operational') THEN
    RETURN jsonb_build_object('code','409','message','Ação indisponível enquanto o fluxo está em andamento');
  END IF;

  IF v_mod = 'compras' THEN
    IF v_action = 'gerar_oc' THEN
      IF v_ent.status <> 'aguardando_oc' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando OC');
      END IF;
      IF NULLIF(trim(COALESCE(p_payload->>'ocNumber','')),'') IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Informe o número da OC');
      END IF;
      UPDATE public.purchases
         SET purchase_number = p_payload->>'ocNumber',
             supplier        = COALESCE(NULLIF(p_payload->>'supplier',''), supplier),
             approved_value  = COALESCE(NULLIF(p_payload->>'approvedValue','')::numeric, approved_value),
             status = 'aguardando_pagamento', updated_at = now()
       WHERE id = p_entity_id;
      v_new := 'aguardando_pagamento';
    ELSIF v_action = 'pagar' THEN
      IF v_ent.status <> 'aguardando_pagamento' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando pagamento');
      END IF;
      v_new := 'aguardando_entrega';
    ELSIF v_action = 'informar_entrega' THEN
      IF v_ent.status <> 'aguardando_entrega' THEN
        RETURN jsonb_build_object('code','409','message','Solicitação não está aguardando entrega');
      END IF;
      v_new := 'entregue';
    ELSIF v_action = 'concluir' THEN
      IF v_ent.status <> 'entregue' THEN
        RETURN jsonb_build_object('code','409','message','Confirme a entrega antes de concluir');
      END IF;
      v_new := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_ent.status NOT IN ('aguardando_entrega','entregue') THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new := 'divergencia';
    END IF;

  ELSIF v_mod = 'reembolso' THEN
    IF v_action = 'concluir' THEN
      IF v_ent.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Reembolso ainda não foi pago');
      END IF;
      v_new := 'concluido';
    ELSIF v_action = 'relatar_divergencia' THEN
      IF v_ent.status <> 'pago' THEN
        RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
      END IF;
      IF v_notes IS NULL THEN
        RETURN jsonb_build_object('code','422','message','Descreva a divergência');
      END IF;
      v_new := 'em_revisao';
    END IF;
  END IF;

  IF v_new IS NULL THEN
    RETURN jsonb_build_object('code','400','message','Ação não permitida para este módulo/estado');
  END IF;

  IF v_action <> 'gerar_oc' THEN
    PERFORM public._update_entity_status(v_mod, p_entity_id, v_new);
  END IF;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES (v_mod, v_mod, p_entity_id, v_ent.status, v_new, v_uid);
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'ENGINE_V2_' || upper(v_action), v_mod, p_entity_id::text,
          jsonb_build_object('from', v_ent.status, 'to', v_new, 'payload', p_payload));

  RETURN jsonb_build_object('code','200','message','Ação executada','data',
                            jsonb_build_object('status', v_new));
END $function$;