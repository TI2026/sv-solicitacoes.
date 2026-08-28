-- Release Fix / Freeze Gate: autoridade estrita do ator, override explícito
-- e evidência bancária obrigatória para pagamento.

ALTER FUNCTION public.get_entity_action_context(text, uuid)
  RENAME TO _get_entity_action_context_release_freeze_predecessor;
REVOKE ALL ON FUNCTION public._get_entity_action_context_release_freeze_predecessor(text, uuid)
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
  v_request public.approval_requests%ROWTYPE;
  v_completion_action text;
  v_actions text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO ctx
    FROM public._get_entity_action_context_release_freeze_predecessor(
      p_module_key, p_entity_id
    );
  IF ctx IS NULL THEN RETURN NULL; END IF;

  SELECT ar.* INTO v_request
    FROM public.approval_requests ar
   WHERE ar.id = ctx.approval_request_id;

  IF FOUND AND v_request.current_step_order IS NOT NULL THEN
    SELECT COALESCE(ars.completion_action, 'aprovar')
      INTO v_completion_action
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id
       AND ars.step_order = v_request.current_step_order;
  END IF;

  SELECT COALESCE(array_agg(value), ARRAY[]::text[])
    INTO v_actions
    FROM jsonb_array_elements_text(COALESCE(ctx.allowed_actions, '[]'::jsonb));

  -- Cancelamento comum pertence exclusivamente ao solicitante. Ser Master não
  -- transforma cancelamento em override administrativo.
  IF v_uid IS DISTINCT FROM ctx.requester_user_id THEN
    v_actions := array_remove(v_actions, 'cancelar');
  END IF;

  IF 'pagar' = ANY(v_actions)
     AND NOT COALESCE((
       v_request.status = 'awaiting_step'
       AND v_request.current_approver_user_id = v_uid
     ), false)
     AND NOT public.has_role(v_uid, 'financeiro'::public.app_role) THEN
    v_actions := array_remove(v_actions, 'pagar');
  END IF;

  IF FOUND AND v_request.status = 'awaiting_step'
     AND v_uid IS DISTINCT FROM v_request.current_approver_user_id THEN
    v_actions := array_remove(v_actions, 'aprovar');
    v_actions := array_remove(v_actions, 'devolver');
    v_actions := array_remove(v_actions, 'rejeitar');
    IF v_completion_action IS NOT NULL THEN
      v_actions := array_remove(v_actions, v_completion_action);
    END IF;
    ctx.is_current_actor := false;

    IF public.is_master(v_uid) THEN
      v_actions := array_append(v_actions, 'master_override');
      ctx.blocked_reasons := array_append(
        COALESCE(ctx.blocked_reasons, ARRAY[]::text[]),
        'Ação comum reservada ao responsável atual; override Master exige operação e motivo explícitos.'
      );
    END IF;
  END IF;

  -- Divergência de Reembolso não é etapa para atuação implícita do Master.
  IF ctx.module_key = 'reembolso'
     AND ctx.current_status = 'em_revisao'
     AND v_uid IS DISTINCT FROM ctx.current_approver_user_id THEN
    v_actions := array_remove(v_actions, 'concluir_revisao');
    ctx.is_current_actor := false;
  END IF;

  SELECT COALESCE(array_agg(d.action ORDER BY d.position), ARRAY[]::text[])
    INTO v_actions
    FROM (
      SELECT action, min(position) AS position
        FROM unnest(v_actions) WITH ORDINALITY u(action, position)
       GROUP BY action
    ) d;

  ctx.allowed_actions := to_jsonb(v_actions);
  RETURN ctx;
END;
$$;

REVOKE ALL ON FUNCTION public.get_entity_action_context(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_entity_action_context(text, uuid)
  TO authenticated;

ALTER FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  RENAME TO _execute_entity_action_release_freeze_predecessor;
REVOKE ALL ON FUNCTION public._execute_entity_action_release_freeze_predecessor(text, uuid, text, jsonb)
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
  v_request public.approval_requests%ROWTYPE;
  v_completion_action text;
  v_proof_path text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;

  v_action := CASE v_action
    WHEN 'approve' THEN 'aprovar'
    WHEN 'reject' THEN 'rejeitar'
    WHEN 'return' THEN 'devolver'
    WHEN 'submit' THEN 'enviar'
    WHEN 'cancel' THEN 'cancelar'
    ELSE v_action
  END;

  SELECT e.requester_user_id INTO v_requester
    FROM public._engine_entity_read(v_module, p_entity_id, false) e;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;
  IF NOT public._engine_can_view(v_module, p_entity_id, v_requester, v_uid) THEN
    RETURN jsonb_build_object('code','404','message','Registro não encontrado');
  END IF;

  SELECT ar.* INTO v_request
    FROM public.approval_requests ar
    JOIN public.approval_modules am ON am.id = ar.module_id
   WHERE ar.reference_id = p_entity_id
     AND public._engine_module_norm(am.code) = v_module
     AND ar.ended_at IS NULL
   ORDER BY ar.created_at DESC
   LIMIT 1;

  IF FOUND AND v_request.current_step_order IS NOT NULL THEN
    SELECT COALESCE(ars.completion_action, 'aprovar')
      INTO v_completion_action
      FROM public.approval_request_steps ars
     WHERE ars.approval_request_id = v_request.id
       AND ars.step_order = v_request.current_step_order;
  END IF;

  IF v_action = 'cancelar' AND v_uid IS DISTINCT FROM v_requester THEN
    RETURN jsonb_build_object('code','403','message','Apenas o solicitante pode cancelar enquanto a operação for reversível');
  END IF;

  IF v_action = 'master_override' THEN
    IF NOT public.is_master(v_uid) THEN
      RETURN jsonb_build_object('code','403','message','Operação exclusiva de Master');
    END IF;
    IF v_request.id IS NULL OR v_request.status <> 'awaiting_step' THEN
      RETURN jsonb_build_object('code','409','message','Não existe etapa ativa para override');
    END IF;
    IF v_uid IS NOT DISTINCT FROM v_request.current_approver_user_id THEN
      RETURN jsonb_build_object('code','409','message','O responsável atual deve usar a ação comum da etapa');
    END IF;
    IF v_notes IS NULL OR length(v_notes) < 10 THEN
      RETURN jsonb_build_object('code','422','message','Override Master exige motivo com no mínimo 10 caracteres');
    END IF;

    v_result := public._execute_entity_action_release_freeze_predecessor(
      v_module, p_entity_id, COALESCE(v_completion_action, 'aprovar'), p_payload
    );
    IF COALESCE((v_result->>'code')::integer, 500) BETWEEN 200 AND 299 THEN
      INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details)
      VALUES (
        v_uid,'ENGINE_V2_MASTER_OVERRIDE_EXPLICIT',v_module,p_entity_id::text,
        jsonb_build_object(
          'master_override',true,'reason',v_notes,'approval_request_id',v_request.id,
          'replaced_actor',v_request.current_approver_user_id,
          'completion_action',COALESCE(v_completion_action,'aprovar')
        )
      );
    END IF;
    RETURN v_result;
  END IF;

  IF v_request.id IS NOT NULL
     AND v_request.status = 'awaiting_step'
     AND v_action IN ('aprovar','devolver','rejeitar',COALESCE(v_completion_action,'aprovar'))
     AND v_uid IS DISTINCT FROM v_request.current_approver_user_id THEN
    RETURN jsonb_build_object('code','403','message','Ação reservada ao responsável atual da etapa');
  END IF;

  IF v_action = 'pagar' THEN
    IF v_request.id IS NULL AND NOT public.has_role(v_uid, 'financeiro'::public.app_role) THEN
      RETURN jsonb_build_object('code','403','message','Pagamento exige responsável atual ou permissão Financeiro');
    END IF;

    IF v_module = 'compras' THEN
      SELECT a->>'path' INTO v_proof_path
        FROM public.purchases p
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.attachments,'[]'::jsonb)) a
       WHERE p.id = p_entity_id
         AND a->>'kind' = 'comprovante_pagamento'
         AND NULLIF(a->>'path','') IS NOT NULL
       ORDER BY a->>'uploaded_at' DESC
       LIMIT 1;
    ELSIF v_module IN ('abastecimento','diaria','reembolso') THEN
      SELECT fa.file_path INTO v_proof_path
        FROM public.fuel_attachments fa
       WHERE fa.fuel_request_id = p_entity_id
         AND fa.type = 'comprovante_pagamento'::public.fuel_attachment_type
       ORDER BY fa.uploaded_at DESC
       LIMIT 1;
    END IF;

    IF v_proof_path IS NULL THEN
      RETURN jsonb_build_object('code','422','message','Anexe o comprovante bancário do pagamento antes de confirmar');
    END IF;
  END IF;

  v_result := public._execute_entity_action_release_freeze_predecessor(
    v_module, p_entity_id, v_action, p_payload
  );

  IF v_action = 'pagar'
     AND COALESCE((v_result->>'code')::integer, 500) BETWEEN 200 AND 299 THEN
    INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details)
    VALUES (
      v_uid,'ENGINE_V2_PAYMENT_PROOF',v_module,p_entity_id::text,
      jsonb_build_object(
        'payment_proof_path',v_proof_path,
        'approval_request_id',v_request.id,
        'paid_by',v_uid,
        'paid_at',now()
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.register_purchase_payment_proof(
  p_purchase_id uuid,
  p_path text,
  p_file_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request_id uuid;
  v_can_pay boolean := false;
  v_attachment jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;
  IF p_path !~ ('^requests/' || p_purchase_id::text || '/comprovante_pagamento/[A-Za-z0-9._-]+$') THEN
    RETURN jsonb_build_object('code','422','message','Caminho de comprovante inválido');
  END IF;

  SELECT (ctx.allowed_actions ? 'pagar'), ctx.approval_request_id
    INTO v_can_pay, v_request_id
    FROM public.get_entity_action_context('compras',p_purchase_id) ctx;
  IF NOT COALESCE(v_can_pay,false) THEN
    RETURN jsonb_build_object('code','403','message','Apenas o responsável atual pelo pagamento pode registrar a evidência');
  END IF;

  v_attachment := jsonb_build_object(
    'id',gen_random_uuid(),'name',left(COALESCE(NULLIF(trim(p_file_name),''),'comprovante'),100),
    'path',p_path,'kind','comprovante_pagamento','uploaded_at',now(),'uploaded_by',v_uid
  );
  UPDATE public.purchases
     SET attachments=COALESCE(attachments,'[]'::jsonb) || jsonb_build_array(v_attachment),
         updated_at=now()
   WHERE id=p_purchase_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details)
  VALUES (v_uid,'PAYMENT_PROOF_REGISTERED','compras',p_purchase_id::text,
          jsonb_build_object('path',p_path,'approval_request_id',v_request_id));
  RETURN jsonb_build_object('code','200','message','Comprovante registrado','data',v_attachment);
END;
$$;

REVOKE ALL ON FUNCTION public.register_purchase_payment_proof(uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_purchase_payment_proof(uuid,text,text)
  TO authenticated;

-- Metadata e Storage permanecem privados; o ator financeiro atual pode gravar
-- somente o tipo canônico de comprovante para a entidade de sua etapa.
DROP POLICY IF EXISTS fuel_attachments_payment_actor_insert ON public.fuel_attachments;
CREATE POLICY fuel_attachments_payment_actor_insert
ON public.fuel_attachments FOR INSERT TO authenticated
WITH CHECK (
  type = 'comprovante_pagamento'::public.fuel_attachment_type
  AND EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
      JOIN public.approval_request_steps ars
        ON ars.approval_request_id=ar.id
       AND ars.step_order=ar.current_step_order
     WHERE ar.reference_id = fuel_request_id
       AND public._engine_module_norm(am.code) IN ('abastecimento','diaria','reembolso')
       AND ar.ended_at IS NULL
       AND ar.status = 'awaiting_step'
       AND ar.current_approver_user_id = auth.uid()
       AND COALESCE(ars.completion_action,'aprovar')='pagar'
  )
);

DROP POLICY IF EXISTS fleet_storage_participant_select ON storage.objects;
CREATE POLICY fleet_storage_participant_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fleet'
  AND (storage.foldername(name))[1] = 'requests'
  AND (storage.foldername(name))[2] IN (
    SELECT fr.id::text FROM public.fuel_requests fr
  )
);

DROP POLICY IF EXISTS fleet_storage_participant_insert ON storage.objects;
CREATE POLICY fleet_storage_participant_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fleet'
  AND (storage.foldername(name))[1] = 'requests'
  AND (storage.foldername(name))[2] IN (
    SELECT fr.id::text FROM public.fuel_requests fr
  )
);

-- Permissão efetiva, independente do atalho de cargo isMaster, para a aba
-- financeira do Dashboard. Nenhum usuário é atribuído por esta migration.
INSERT INTO public.permission_modules(code,name,active)
VALUES ('dashboard','Dashboard',true)
ON CONFLICT (code) DO UPDATE SET active=true;

INSERT INTO public.permission_actions(code,name,active)
VALUES ('view_financials','Visualizar indicadores financeiros',true)
ON CONFLICT (code) DO UPDATE SET active=true;

INSERT INTO public.role_permission_matrix(role_id,module_id,action_id,allowed)
SELECT r.id,pm.id,pa.id,true
  FROM public.roles r
  JOIN public.permission_modules pm ON pm.code='dashboard'
  JOIN public.permission_actions pa ON pa.code='view_financials'
 WHERE r.key IN ('financeiro','master')
ON CONFLICT (role_id,module_id,action_id) DO UPDATE SET allowed=true;

DO $$
DECLARE v_user uuid;
BEGIN
  FOR v_user IN
    SELECT DISTINCT ura.user_id
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id=ura.role_id
     WHERE r.key IN ('financeiro','master')
  LOOP
    PERFORM public.rebuild_user_permissions(v_user);
  END LOOP;
END;
$$;
