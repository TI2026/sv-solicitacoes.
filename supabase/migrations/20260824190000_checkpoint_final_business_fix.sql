-- CHECKPOINT FINAL — regras de data, autorização operacional e resolução de
-- divergência de Reembolso. Histórico publicado permanece imutável.

-- Abastecimento pode ser solicitado para hoje ou data futura. Diária e
-- Reembolso mantêm suas regras atuais. A validação continua autoritativa no DB.
CREATE OR REPLACE FUNCTION public.validate_fuel_request_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := lower(COALESCE(NEW.type, ''));
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.type IS NOT DISTINCT FROM OLD.type
     AND NEW.valor IS NOT DISTINCT FROM OLD.valor
     AND NEW.data_abastecimento IS NOT DISTINCT FROM OLD.data_abastecimento
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.placa IS NOT DISTINCT FROM OLD.placa
     AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
     AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
     AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method
     AND NEW.pix_key IS NOT DISTINCT FROM OLD.pix_key
     AND NEW.bank_name IS NOT DISTINCT FROM OLD.bank_name
     AND NEW.bank_agency IS NOT DISTINCT FROM OLD.bank_agency
     AND NEW.bank_account IS NOT DISTINCT FROM OLD.bank_account
     AND NEW.daily_category IS NOT DISTINCT FROM OLD.daily_category
     AND NEW.person_name IS NOT DISTINCT FROM OLD.person_name
     AND NEW.daily_value IS NOT DISTINCT FROM OLD.daily_value
  THEN
    RETURN NEW;
  END IF;

  IF v_type NOT IN ('abastecimento','diaria','reembolso') THEN
    RAISE EXCEPTION 'REQUEST_TYPE_INVALID';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 50000 THEN
    RAISE EXCEPTION 'REQUEST_VALUE_INVALID';
  END IF;

  IF v_type = 'abastecimento' THEN
    IF NEW.data_abastecimento < current_date THEN
      RAISE EXCEPTION 'FUEL_DATE_MUST_BE_TODAY_OR_FUTURE';
    END IF;
    IF NULLIF(trim(NEW.placa), '') IS NULL OR NULLIF(trim(NEW.motivo), '') IS NULL THEN
      RAISE EXCEPTION 'FUEL_REQUIRED_FIELDS_MISSING';
    END IF;
  ELSIF v_type = 'diaria' THEN
    IF NEW.data_abastecimento < current_date THEN
      RAISE EXCEPTION 'DAILY_DATE_MUST_BE_TODAY_OR_FUTURE';
    END IF;
    IF NULLIF(trim(NEW.daily_category), '') IS NULL
       OR NULLIF(trim(NEW.person_name), '') IS NULL
       OR COALESCE(NEW.daily_value, 0) <= 0 THEN
      RAISE EXCEPTION 'DAILY_REQUIRED_FIELDS_MISSING';
    END IF;
  ELSE
    IF NEW.data_abastecimento > current_date THEN
      RAISE EXCEPTION 'REIMBURSEMENT_FUTURE_DATE_DENIED';
    END IF;
    IF NULLIF(trim(NEW.categoria), '') IS NULL OR NULLIF(trim(NEW.notes), '') IS NULL THEN
      RAISE EXCEPTION 'REIMBURSEMENT_REQUIRED_FIELDS_MISSING';
    END IF;
    IF NEW.payment_method = 'pix' AND NULLIF(trim(NEW.pix_key), '') IS NULL THEN
      RAISE EXCEPTION 'REIMBURSEMENT_PIX_REQUIRED';
    ELSIF NEW.payment_method = 'banco'
          AND (NULLIF(trim(NEW.bank_name), '') IS NULL
               OR NULLIF(trim(NEW.bank_agency), '') IS NULL
               OR NULLIF(trim(NEW.bank_account), '') IS NULL) THEN
      RAISE EXCEPTION 'REIMBURSEMENT_BANK_DATA_REQUIRED';
    ELSIF NEW.payment_method NOT IN ('pix','banco') THEN
      RAISE EXCEPTION 'REIMBURSEMENT_PAYMENT_METHOD_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Preserva o executor aprovado no Checkpoint B como helper interno e mantém a
-- mesma API pública. O wrapper fecha autorização operacional e trata o ciclo
-- explícito de divergência pós-pagamento de Reembolso.
ALTER FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  RENAME TO _execute_entity_action_checkpoint_b;

REVOKE ALL ON FUNCTION public._execute_entity_action_checkpoint_b(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key text,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_module text := public._engine_module_norm(p_module_key);
  v_action text := lower(trim(p_action));
  v_notes text := NULLIF(trim(COALESCE(p_payload->>'notes','')), '');
  v_requester uuid;
  v_status text;
  v_reviewer uuid;
  v_request_id uuid;
  v_collaborator_id uuid;
  v_profile_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;

  -- Alias HTTP legado aceito pelo executor anterior, sem criar actions novas.
  v_action := CASE v_action
    WHEN 'approve' THEN 'aprovar'
    WHEN 'reject' THEN 'rejeitar'
    WHEN 'return' THEN 'devolver'
    WHEN 'submit' THEN 'enviar'
    WHEN 'cancel' THEN 'cancelar'
    ELSE v_action
  END;

  IF v_module = 'compras'
     AND v_action IN ('gerar_oc','pagar','informar_entrega','concluir','relatar_divergencia') THEN
    SELECT requester_user_id INTO v_requester
      FROM public.purchases WHERE id = p_entity_id;
    IF v_requester IS NULL THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
    IF NOT public._engine_can_view('compras', p_entity_id, v_requester, v_uid) THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
    IF v_uid IS DISTINCT FROM v_requester
       AND NOT public.is_master(v_uid)
       AND NOT public.has_role(v_uid, 'financeiro'::public.app_role)
       AND NOT public.has_role(v_uid, 'compras'::public.app_role)
       AND NOT public.has_role(v_uid, 'administrativo'::public.app_role)
       AND NOT public.has_role(v_uid, 'diretoria'::public.app_role) THEN
      RETURN jsonb_build_object('code','403','message','Sem permissão para a operação de Compras');
    END IF;
  END IF;

  IF v_module = 'reembolso' AND v_action IN ('concluir','relatar_divergencia') THEN
    SELECT requester_user_id, status::text
      INTO v_requester, v_status
      FROM public.fuel_requests
     WHERE id = p_entity_id AND type = 'reembolso';
    IF v_requester IS NULL THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
    IF v_uid IS DISTINCT FROM v_requester AND NOT public.is_master(v_uid) THEN
      RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode confirmar ou contestar o Reembolso');
    END IF;
  END IF;

  IF v_module = 'reembolso' AND v_action = 'relatar_divergencia' THEN
    IF v_status <> 'pago' THEN
      RETURN jsonb_build_object('code','409','message','Divergência indisponível neste estágio');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Descreva a divergência (mín. 10 caracteres)');
    END IF;

    SELECT ar.id, COALESCE(ars.approver_user_id, ars.primary_user_id)
      INTO v_request_id, v_reviewer
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
      JOIN public.approval_request_steps ars ON ars.approval_request_id = ar.id
     WHERE ar.reference_id = p_entity_id
       AND public._engine_module_norm(am.code) = 'reembolso'
       AND ars.step_code = 'revisao_financeira'
       AND ars.status = 'approved'
     ORDER BY ar.created_at DESC
     LIMIT 1;

    IF v_reviewer IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = v_reviewer AND p.active
    ) THEN
      RETURN jsonb_build_object('code','409','message','Reembolso sem responsável ativo para resolver a divergência');
    END IF;

    v_result := public._execute_entity_action_checkpoint_b(
      v_module, p_entity_id, v_action, p_payload
    );
    IF COALESCE((v_result->>'code')::integer, 500) BETWEEN 200 AND 299 THEN
      UPDATE public.fuel_requests
         SET assigned_to_user_id = v_reviewer, updated_at = now()
       WHERE id = p_entity_id;

      INSERT INTO public.notifications(user_id, title, message, metadata)
      VALUES (
        v_reviewer,
        'Divergência em Reembolso',
        'O solicitante contestou o pagamento. Revise e registre a resolução.',
        jsonb_build_object(
          'event_key', 'reimbursement-divergence:' || p_entity_id::text,
          'type', 'reimbursement_divergence',
          'action', 'concluir_revisao',
          'approval_request_id', v_request_id,
          'module_key', 'reembolso',
          'entity_id', p_entity_id,
          'step_code', 'revisao_financeira',
          'status', 'em_revisao'
        )
      ) ON CONFLICT DO NOTHING;
    END IF;
    RETURN v_result;
  END IF;

  IF v_module = 'reembolso'
     AND v_action = 'concluir_revisao'
     AND EXISTS (
       SELECT 1 FROM public.fuel_requests
        WHERE id = p_entity_id AND type = 'reembolso' AND status::text = 'em_revisao'
     ) THEN
    SELECT requester_user_id, status::text, assigned_to_user_id
      INTO v_requester, v_status, v_reviewer
      FROM public.fuel_requests
     WHERE id = p_entity_id AND type = 'reembolso'
     FOR UPDATE;
    IF v_requester IS NULL THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
    IF v_uid IS DISTINCT FROM v_reviewer AND NOT public.is_master(v_uid) THEN
      RETURN jsonb_build_object('code','403','message','Apenas o responsável atribuído pode resolver a divergência');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Descreva a resolução (mín. 10 caracteres)');
    END IF;

    SELECT ar.id INTO v_request_id
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
     WHERE ar.reference_id = p_entity_id
       AND public._engine_module_norm(am.code) = 'reembolso'
     ORDER BY ar.created_at DESC
     LIMIT 1;

    UPDATE public.fuel_requests
       SET status = 'pago',
           assigned_to_user_id = NULL,
           reviewed_by = v_uid,
           reviewed_at = now(),
           review_notes = v_notes,
           updated_at = now()
     WHERE id = p_entity_id;

    INSERT INTO public.status_history(
      module, entity_type, entity_id, from_status, to_status, changed_by
    ) VALUES ('reembolso','reembolso',p_entity_id,'em_revisao','pago',v_uid);

    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      v_uid, 'ENGINE_V2_CONCLUIR_REVISAO_DIVERGENCIA', 'reembolso', p_entity_id::text,
      jsonb_build_object('from','em_revisao','to','pago','notes',v_notes,
                         'approval_request_id',v_request_id)
    );

    INSERT INTO public.notifications(user_id, title, message, metadata)
    VALUES (
      v_requester,
      'Divergência de Reembolso resolvida',
      'A revisão foi concluída. Confirme o Reembolso para encerrar o processo.',
      jsonb_build_object(
        'event_key', 'reimbursement-divergence-resolved:' || p_entity_id::text,
        'type', 'reimbursement_divergence_resolved',
        'action', 'concluir',
        'approval_request_id', v_request_id,
        'module_key', 'reembolso',
        'entity_id', p_entity_id,
        'step_code', 'revisao_financeira',
        'status', 'pago'
      )
    ) ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'code','200','message','Divergência resolvida',
      'data',jsonb_build_object('status','pago','requester_action','concluir')
    );
  END IF;

  IF v_module = 'desligamentos' AND v_action = 'concluir' THEN
    SELECT tr.collaborator_id, c.user_profile_id, tr.requester_user_id
      INTO v_collaborator_id, v_profile_id, v_requester
      FROM public.termination_requests tr
      JOIN public.collaborators c ON c.id = tr.collaborator_id
     WHERE tr.id = p_entity_id;

    IF v_profile_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = v_profile_id AND r.key = 'master'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      JOIN public.profiles p ON p.id = ura.user_id
      WHERE r.key = 'master' AND p.active
        AND ura.user_id IS DISTINCT FROM v_profile_id
    ) THEN
      RETURN jsonb_build_object('code','409','message','Não é possível desligar o último Master do sistema');
    END IF;
  END IF;

  v_result := public._execute_entity_action_checkpoint_b(
    v_module, p_entity_id, v_action, p_payload
  );

  IF v_module = 'desligamentos'
     AND v_action = 'concluir'
     AND COALESCE((v_result->>'code')::integer, 500) BETWEEN 200 AND 299 THEN
    SELECT status::text INTO v_status
      FROM public.termination_requests
     WHERE id = p_entity_id;

    -- O executor anterior pode ter aplicado o offboarding quando o ator também
    -- possui papel operacional de RH/Admin. O fallback só atua quando aquele
    -- setter recusou silenciosamente a transição, evitando histórico duplicado.
    IF v_status IS DISTINCT FROM 'desligamento_concluido' THEN
      UPDATE public.termination_requests
         SET status = 'desligamento_concluido', updated_at = now()
       WHERE id = p_entity_id;
      UPDATE public.collaborators
         SET active = false, status = 'inativo', updated_at = now()
       WHERE id = v_collaborator_id;

      IF v_profile_id IS NOT NULL AND v_profile_id IS DISTINCT FROM v_requester THEN
        UPDATE public.profiles SET active=false, updated_at=now() WHERE id=v_profile_id;
        UPDATE public.sectors SET responsible_user_id=NULL, updated_at=now()
         WHERE responsible_user_id=v_profile_id;
        UPDATE public.sectors SET substitute_user_id=NULL, updated_at=now()
         WHERE substitute_user_id=v_profile_id;
        DELETE FROM public.user_role_assignments WHERE user_id=v_profile_id;
      END IF;

      INSERT INTO public.status_history(
        module, entity_type, entity_id, from_status, to_status, changed_by
      ) VALUES (
        'desligamentos','termination_requests',p_entity_id,'aprovado',
        'desligamento_concluido',v_uid
      );
      INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details)
      VALUES (
        v_uid,'ENGINE_V2_OFFBOARDING_FINAL','termination_requests',p_entity_id::text,
        jsonb_build_object('collaborator_id',v_collaborator_id,'profile_id',v_profile_id)
      );
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  TO authenticated;

-- Preserva o contexto aprovado e acrescenta somente o estado operacional da
-- divergência. O ator vem do snapshot real da revisão financeira já executada.
ALTER FUNCTION public.get_entity_action_context(text, uuid)
  RENAME TO _get_entity_action_context_checkpoint_b;

REVOKE ALL ON FUNCTION public._get_entity_action_context_checkpoint_b(text, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_entity_action_context(
  p_module_key text,
  p_entity_id uuid
)
RETURNS public.entity_action_context
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ctx public.entity_action_context;
  v_uid uuid := auth.uid();
  v_module text := public._engine_module_norm(p_module_key);
  v_reviewer uuid;
  v_reviewer_name text;
  v_request_id uuid;
  v_flow_id uuid;
  v_flow_version text;
  v_step_order integer;
  v_step_kind text;
BEGIN
  SELECT * INTO ctx
    FROM public._get_entity_action_context_checkpoint_b(p_module_key, p_entity_id);

  IF ctx IS NULL
     OR v_module <> 'reembolso'
     OR ctx.current_status <> 'em_revisao' THEN
    RETURN ctx;
  END IF;

  SELECT f.assigned_to_user_id
    INTO v_reviewer
    FROM public.fuel_requests f
   WHERE f.id = p_entity_id AND f.type = 'reembolso';

  SELECT ar.id, ar.flow_id, af.version, ars.step_order, ars.step_kind
    INTO v_request_id, v_flow_id, v_flow_version, v_step_order, v_step_kind
    FROM public.approval_requests ar
    JOIN public.approval_modules am ON am.id = ar.module_id
    JOIN public.approval_flows af ON af.id = ar.flow_id
    JOIN public.approval_request_steps ars ON ars.approval_request_id = ar.id
   WHERE ar.reference_id = p_entity_id
     AND public._engine_module_norm(am.code) = 'reembolso'
     AND ars.step_code = 'revisao_financeira'
   ORDER BY ar.created_at DESC
   LIMIT 1;

  SELECT p.full_name INTO v_reviewer_name
    FROM public.profiles p WHERE p.id = v_reviewer;

  ctx.approval_request_id := v_request_id;
  ctx.flow_id := v_flow_id;
  ctx.flow_version := v_flow_version;
  ctx.current_step := 'Revisão da divergência';
  ctx.current_step_order := v_step_order;
  ctx.current_step_name := 'Revisão da divergência';
  ctx.current_step_code := 'revisao_financeira';
  ctx.current_step_kind := COALESCE(v_step_kind, 'review');
  ctx.current_approver_user_id := v_reviewer;
  ctx.current_approver_name := v_reviewer_name;
  ctx.next_step := NULL;
  ctx.next_step_order := NULL;
  ctx.next_step_name := NULL;
  ctx.next_step_code := NULL;
  ctx.is_current_actor := v_uid = v_reviewer OR public.is_master(v_uid);
  ctx.can_edit := false;
  ctx.total_steps := 3;
  ctx.sla_deadline := NULL;
  ctx.overdue := false;

  IF ctx.is_current_actor THEN
    ctx.allowed_actions := '["concluir_revisao"]'::jsonb;
    ctx.blocked_reasons := ARRAY[]::text[];
    ctx.waiting_label := NULL;
  ELSE
    ctx.allowed_actions := '[]'::jsonb;
    ctx.blocked_reasons := ARRAY['Aguardando resolução da divergência financeira.'];
    ctx.waiting_label := 'Aguardando ' || COALESCE(v_reviewer_name, 'responsável financeiro');
  END IF;

  RETURN ctx;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_action_context(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(text, uuid)
  TO authenticated;

-- Eventos operacionais posteriores ao encerramento da approval_request (como
-- divergência de Reembolso) precisam preservar o status explícito da entidade,
-- sem substituí-lo pelo status "completed" da request histórica.
CREATE OR REPLACE FUNCTION public.enrich_workflow_notification_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_entity_id uuid;
  v_module text;
  v_status text;
  v_step_code text;
BEGIN
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  BEGIN
    v_request_id := NULLIF(NEW.metadata->>'approval_request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_request_id := NULL;
  END;

  IF v_request_id IS NOT NULL THEN
    SELECT ar.reference_id, public._engine_module_norm(am.code),
           COALESCE(NEW.metadata->>'status', ar.status),
           COALESCE(NEW.metadata->>'step_code', ars.step_code)
      INTO v_entity_id, v_module, v_status, v_step_code
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
      LEFT JOIN public.approval_request_steps ars
        ON ars.approval_request_id = ar.id
       AND ars.step_order = COALESCE(
         NULLIF(NEW.metadata->>'step_order', '')::integer,
         ar.current_step_order
       )
     WHERE ar.id = v_request_id;
  ELSE
    BEGIN
      v_entity_id := NULLIF(NEW.metadata->>'entity_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_entity_id := NULL;
    END;
    v_module := public._engine_module_norm(
      COALESCE(NEW.metadata->>'module_key', NEW.metadata->>'entity_type')
    );
    v_status := NEW.metadata->>'status';
    v_step_code := NEW.metadata->>'step_code';
  END IF;

  IF v_entity_id IS NOT NULL AND v_module IS NOT NULL THEN
    NEW.metadata := NEW.metadata || jsonb_strip_nulls(jsonb_build_object(
      'module_key', v_module,
      'entity_id', v_entity_id,
      'approval_request_id', v_request_id,
      'step_code', v_step_code,
      'action', COALESCE(NEW.metadata->>'action', NEW.metadata->>'type'),
      'status', v_status,
      'link', public.workflow_entity_link(v_module, v_entity_id)
    ));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enrich_workflow_notification_metadata()
  FROM PUBLIC, anon, authenticated;
