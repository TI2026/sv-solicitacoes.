


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."admission_status" AS ENUM (
    'rascunho',
    'aguardando_triagem',
    'em_triagem',
    'aguardando_documentos',
    'documentos_em_analise',
    'aguardando_exame',
    'exame_realizado',
    'aguardando_registro',
    'registros_concluidos',
    'concluido',
    'cancelado',
    'arquivado'
);


ALTER TYPE "public"."admission_status" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'diretoria',
    'administrativo',
    'colaborador',
    'rh',
    'supervisor',
    'financeiro',
    'compras',
    'master'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."candidate_status" AS ENUM (
    'novo',
    'em_triagem',
    'aprovado',
    'reprovado',
    'desistente'
);


ALTER TYPE "public"."candidate_status" OWNER TO "postgres";


CREATE TYPE "public"."doc_status" AS ENUM (
    'pending',
    'submitted',
    'approved',
    'rejected'
);


ALTER TYPE "public"."doc_status" OWNER TO "postgres";


CREATE TYPE "public"."exam_status" AS ENUM (
    'aguardando',
    'apto',
    'apto_com_restricao',
    'inapto'
);


ALTER TYPE "public"."exam_status" OWNER TO "postgres";


CREATE TYPE "public"."fuel_attachment_type" AS ENUM (
    'hodometro',
    'nota_fiscal'
);


ALTER TYPE "public"."fuel_attachment_type" OWNER TO "postgres";


CREATE TYPE "public"."fuel_status" AS ENUM (
    'rascunho',
    'enviado',
    'em_aprovacao',
    'retornado',
    'aguardando_fotos',
    'em_revisao_admin',
    'aprovado',
    'reprovado',
    'encerrado',
    'concluido',
    'ativa',
    'em_revisao',
    'aguardando_oc',
    'aguardando_pagamento',
    'pago'
);


ALTER TYPE "public"."fuel_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_channel" AS ENUM (
    'in_app',
    'email'
);


ALTER TYPE "public"."notification_channel" OWNER TO "postgres";


CREATE TYPE "public"."review_decision" AS ENUM (
    'approved',
    'rejected',
    'needs_revision'
);


ALTER TYPE "public"."review_decision" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_purge_test_data"("_scope" "text", "_confirm" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_master boolean;
  _result jsonb := '{}'::jsonb;
  _fuel_ids uuid[];
  _admission_ids uuid[];
  _candidate_ids uuid[];
  _approval_ids uuid[];
  _counts jsonb := '{}'::jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _uid AND r.is_master = TRUE
  ) INTO _is_master;

  IF NOT _is_master THEN
    RETURN jsonb_build_object('error', 'Apenas usuário Master pode executar limpeza de dados');
  END IF;

  IF _scope NOT IN ('SOLICITACOES', 'ADMISSOES', 'ALL_TEST') THEN
    RETURN jsonb_build_object('error', 'Escopo inválido. Use: SOLICITACOES, ADMISSOES ou ALL_TEST');
  END IF;

  IF _scope IN ('SOLICITACOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _fuel_ids FROM fuel_requests;
    IF _fuel_ids IS NULL THEN _fuel_ids := '{}'; END IF;
    SELECT array_agg(id) INTO _approval_ids FROM approval_requests WHERE reference_id = ANY(_fuel_ids);
    IF _approval_ids IS NULL THEN _approval_ids := '{}'; END IF;

    _counts := _counts || jsonb_build_object(
      'fuel_attachments', (SELECT count(*) FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids)),
      'fuel_reviews', (SELECT count(*) FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids)),
      'approval_history', (SELECT count(*) FROM approval_history WHERE approval_request_id = ANY(_approval_ids)),
      'approval_request_steps', (SELECT count(*) FROM approval_request_steps WHERE approval_request_id = ANY(_approval_ids)),
      'approval_requests', coalesce(array_length(_approval_ids, 1), 0),
      'fuel_requests', coalesce(array_length(_fuel_ids, 1), 0)
    );

    IF _confirm THEN
      DELETE FROM approval_history WHERE approval_request_id = ANY(_approval_ids);
      DELETE FROM approval_request_steps WHERE approval_request_id = ANY(_approval_ids);
      DELETE FROM approval_requests WHERE id = ANY(_approval_ids);
      DELETE FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM status_history WHERE module = 'fleet';
      DELETE FROM notifications WHERE metadata->>'entity_type' IN ('fuel_requests', 'approval_request');
      DELETE FROM fuel_requests WHERE id = ANY(_fuel_ids);
    END IF;
  END IF;

  IF _scope IN ('ADMISSOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _admission_ids FROM admission_requests;
    IF _admission_ids IS NULL THEN _admission_ids := '{}'; END IF;
    SELECT array_agg(id) INTO _candidate_ids FROM candidates WHERE admission_request_id = ANY(_admission_ids);
    IF _candidate_ids IS NULL THEN _candidate_ids := '{}'; END IF;

    IF _confirm THEN
      DELETE FROM document_reviews WHERE candidate_document_id IN (SELECT id FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids));
      DELETE FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM medical_exams WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM system_registrations WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM public_tokens WHERE candidate_id = ANY(_candidate_ids);
      DELETE FROM admission_files WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM admission_public_links WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM candidates WHERE admission_request_id = ANY(_admission_ids);
      DELETE FROM status_history WHERE module = 'admissions';
      DELETE FROM notifications WHERE metadata->>'entity_type' = 'admission_requests';
      DELETE FROM admission_requests WHERE id = ANY(_admission_ids);
    END IF;
  END IF;

  IF _confirm THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'purge_test_data', 'system', _scope,
      jsonb_build_object('scope', _scope, 'counts', _counts, 'confirmed', true, 'is_master', true));
  END IF;

  RETURN jsonb_build_object('preview', NOT _confirm, 'scope', _scope, 'counts', _counts);
END;
$$;


ALTER FUNCTION "public"."admin_purge_test_data"("_scope" "text", "_confirm" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admission_set_status"("_request_id" "uuid", "_to_status" "public"."admission_status", "_reason" "text" DEFAULT NULL::"text", "_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed_transitions jsonb := '{
    "rascunho": ["aguardando_triagem"],
    "aguardando_triagem": ["em_triagem"],
    "em_triagem": ["aguardando_documentos", "cancelado", "arquivado"],
    "aguardando_documentos": ["documentos_em_analise", "cancelado", "arquivado"],
    "documentos_em_analise": ["aguardando_exame", "aguardando_documentos", "cancelado", "arquivado"],
    "aguardando_exame": ["exame_realizado", "aguardando_registro", "cancelado", "arquivado"],
    "exame_realizado": ["aguardando_registro", "cancelado", "arquivado"],
    "aguardando_registro": ["registros_concluidos", "concluido", "cancelado", "arquivado"],
    "registros_concluidos": ["concluido", "cancelado", "arquivado"],
    "concluido": ["arquivado"],
    "cancelado": ["arquivado"],
    "arquivado": []
  }'::jsonb;
  _valid_targets jsonb;
BEGIN
  SELECT * INTO _req FROM public.admission_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  IF _to_status = 'arquivado' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Apenas Administração ou Diretoria podem arquivar');
    END IF;
  ELSIF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'rh')) THEN
    IF NOT (_req.requester_user_id = _uid AND _req.status = 'rascunho' AND _to_status = 'aguardando_triagem') THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.admission_requests SET status = _to_status WHERE id = _request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('admissions', 'admission_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, CASE WHEN _to_status = 'arquivado' THEN 'archive' ELSE 'status_change' END, 'admission_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason) || _metadata);

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      CASE WHEN _to_status = 'arquivado' THEN 'Vaga arquivada' ELSE 'Admissão atualizada' END,
      format('Processo de admissão movido para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'admission_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  IF _to_status IN ('aguardando_triagem', 'documentos_em_analise') THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT ur.user_id, 'Nova ação necessária',
      format('Processo de admissão requer atenção: %s', _to_status::text),
      jsonb_build_object('entity_type', 'admission_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_roles ur WHERE ur.role = 'rh' AND ur.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;


ALTER FUNCTION "public"."admission_set_status"("_request_id" "uuid", "_to_status" "public"."admission_status", "_reason" "text", "_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_purchase_request"("p_request_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _active RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.requester_user_id <> _uid
     AND NOT (has_role(_uid,'diretoria'::app_role)
              OR has_role(_uid,'administrativo'::app_role)
              OR has_role(_uid,'master'::app_role)) THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Sem permissão para cancelar');
  END IF;

  IF _req.status NOT IN ('rascunho','retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400',
      'message', format('Não é possível cancelar a partir do status "%s"', _req.status));
  END IF;

  -- Encerrar qualquer fluxo ativo remanescente
  FOR _active IN
    SELECT id, current_approver_user_id
      FROM public.approval_requests
      WHERE reference_id = p_request_id AND ended_at IS NULL
  LOOP
    UPDATE public.approval_requests
      SET status = 'canceled', ended_at = now()
      WHERE id = _active.id;

    INSERT INTO public.approval_history
      (approval_request_id, action, action_by, comments, old_status, new_status)
    VALUES
      (_active.id, 'cancel', _uid, p_reason, 'returned_to_requester', 'canceled');

    IF _active.current_approver_user_id IS NOT NULL
       AND _active.current_approver_user_id <> _uid THEN
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (_active.current_approver_user_id,
        'Solicitação cancelada',
        'O solicitante cancelou a solicitação de compra.',
        jsonb_build_object('entity_type','approval_request','entity_id',_active.id));
    END IF;
  END LOOP;

  UPDATE public.purchases
    SET status = 'cancelado',
        approval_request_id = NULL
    WHERE id = p_request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'cancel', 'purchases', p_request_id::text,
    jsonb_build_object('from', _req.status, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'status', 'cancelado');
END;
$$;


ALTER FUNCTION "public"."cancel_purchase_request"("p_request_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_has_role"("_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT public.has_role(auth.uid(), _role) $$;


ALTER FUNCTION "public"."current_has_role"("_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_has_permission"("p_module_code" "text", "p_action_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT public.has_permission(auth.uid(), p_module_code, p_action_code) $$;


ALTER FUNCTION "public"."current_user_has_permission"("p_module_code" "text", "p_action_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT auth.uid() $$;


ALTER FUNCTION "public"."current_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuel_set_status"("_request_id" "uuid", "_to_status" "public"."fuel_status", "_reason" "text" DEFAULT NULL::"text", "_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed jsonb;
  _valid_targets jsonb;
  _has_active_approval boolean := false;
  _sector_id uuid;
  _reviewer uuid;
  _pending_return RECORD;
BEGIN
  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Solicitação não encontrada'); END IF;

  IF _req.type = 'diaria' THEN
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_revisao"],
      "em_revisao":["em_aprovacao","retornado"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["aguardando_oc"],
      "aguardando_oc":["aguardando_pagamento"],
      "aguardando_pagamento":["pago"],
      "pago":["concluido"],
      "reprovado":["encerrado"],
      "ativa":["encerrado","em_revisao"]
    }'::jsonb;
  ELSIF _req.type = 'reembolso' THEN
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_aprovacao"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["concluido"],
      "reprovado":["encerrado"]
    }'::jsonb;
  ELSE
    _allowed := '{
      "rascunho":["enviado"],
      "enviado":["em_aprovacao"],
      "em_aprovacao":["aprovado","retornado","reprovado"],
      "retornado":["enviado"],
      "aprovado":["aguardando_fotos"],
      "aguardando_fotos":["em_revisao_admin"],
      "em_revisao_admin":["concluido","retornado"],
      "reprovado":["encerrado"]
    }'::jsonb;
  END IF;

  _valid_targets := _allowed -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  IF _to_status IN ('aprovado'::fuel_status, 'retornado'::fuel_status, 'reprovado'::fuel_status) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.approval_requests
      WHERE reference_id = _request_id AND ended_at IS NULL
    ) INTO _has_active_approval;

    IF _has_active_approval THEN
      RETURN jsonb_build_object('error',
        'Esta solicitação possui fluxo de aprovação ativo. Use o motor de aprovação para aprovar, recusar ou devolver.');
    END IF;

    RETURN jsonb_build_object('error',
      'Não é possível aprovar, recusar ou devolver diretamente. Inicie o fluxo de aprovação para esta solicitação.');
  END IF;

  -- Validação de permissões por transição
  IF _to_status IN ('enviado') THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode enviar');
    END IF;
  ELSIF _to_status IN ('em_aprovacao', 'em_revisao') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status = 'aguardando_pagamento' THEN
    -- Compras (além de admin/diretoria/master) pode registrar OC
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'compras')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para registrar OC');
    END IF;
  ELSIF _to_status = 'pago' THEN
    -- Financeiro (além de admin/diretoria/master) pode confirmar pagamento
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'financeiro')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para registrar pagamento');
    END IF;
  ELSIF _to_status IN ('aguardando_oc', 'concluido', 'encerrado') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      IF _req.requester_user_id != _uid THEN
        RETURN jsonb_build_object('error', 'Sem permissão para esta ação');
      END IF;
    END IF;
  ELSIF _to_status = 'ativa' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  IF _to_status = 'enviado' THEN
    SELECT sector_id INTO _sector_id FROM public.profiles WHERE id = _req.requester_user_id;
    IF _sector_id IS NOT NULL THEN
      SELECT responsible_user_id INTO _reviewer
        FROM public.sectors WHERE id = _sector_id AND active = true LIMIT 1;
      IF _reviewer IS NOT NULL THEN
        UPDATE public.fuel_requests
          SET assigned_to_user_id = _reviewer
          WHERE id = _request_id;
      END IF;
    END IF;

    SELECT id, current_step_order INTO _pending_return
      FROM public.approval_requests
      WHERE reference_id = _request_id
        AND ended_at IS NULL
        AND status = 'returned_to_requester'
      ORDER BY created_at DESC LIMIT 1;
    IF _pending_return.id IS NOT NULL THEN
      UPDATE public.approval_requests
        SET status = 'awaiting_step_' || _pending_return.current_step_order
        WHERE id = _pending_return.id;
      UPDATE public.fuel_requests
        SET status = 'em_aprovacao'::fuel_status
        WHERE id = _request_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _request_id, _to_status::text, 'em_aprovacao', _uid);
    END IF;
  END IF;

  IF _to_status = 'em_revisao' AND _metadata ? 'review_notes' THEN
    UPDATE public.fuel_requests SET reviewed_by = _uid, reviewed_at = now(), review_notes = _metadata->>'review_notes' WHERE id = _request_id;
  END IF;
  IF _to_status = 'aguardando_pagamento' AND (_metadata ? 'oc_number' OR _metadata ? 'oc_notes') THEN
    UPDATE public.fuel_requests SET oc_number = COALESCE(_metadata->>'oc_number', oc_number), oc_notes = COALESCE(_metadata->>'oc_notes', oc_notes), oc_uploaded_by = _uid, oc_uploaded_at = now() WHERE id = _request_id;
  END IF;
  IF _to_status = 'pago' THEN
    UPDATE public.fuel_requests SET paid_at = now(), paid_by = _uid, payment_notes = COALESCE(_metadata->>'payment_notes', payment_notes), payment_due_date = CASE WHEN _metadata ? 'payment_due_date' THEN (_metadata->>'payment_due_date')::date ELSE payment_due_date END WHERE id = _request_id;
  END IF;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES ('fleet', 'fuel_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'status_change', 'fuel_requests', _request_id::text,
      jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason, 'type', _req.type) || _metadata);

  IF _to_status IN ('concluido', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid, 'approved'::review_decision, _reason);
  END IF;

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id, 'Solicitação atualizada',
      format('Sua solicitação foi movida para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  -- Notificação de novas solicitações enviadas (apenas user_role_assignments — sem legado)
  IF _to_status = 'enviado' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Nova solicitação recebida',
      format('Nova solicitação de %s aguardando encaminhamento', _req.type),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE)
      AND ura.user_id != _uid;
  END IF;

  -- IMPORTANTE: bloco duplicado de notificação para 'em_aprovacao' REMOVIDO.
  -- O aprovador correto da etapa é notificado pelo start_approval_flow / process_approval_action.

  IF _to_status = 'em_revisao_admin' THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    SELECT DISTINCT ura.user_id,
      'Fotos enviadas para revisão',
      'Colaborador enviou hodômetro e nota fiscal para conferência',
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status)
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE (r.key IN ('diretoria','administrativo') OR r.is_master = TRUE)
      AND ura.user_id != _uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;


ALTER FUNCTION "public"."fuel_set_status"("_request_id" "uuid", "_to_status" "public"."fuel_status", "_reason" "text", "_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_metrics"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_fuel_total INT;
  v_fuel_pendentes INT;
  v_fuel_aprovados INT;
  v_fuel_valor_total NUMERIC;
  v_fuel_aguardando_oc INT;
  v_fuel_aguardando_pagamento INT;
  v_fuel_em_revisao_admin INT;
  v_fuel_by_status JSONB;
  v_fuel_by_type JSONB;

  v_adm_total INT;
  v_adm_em_andamento INT;
  v_adm_aguardando_registros INT;
  v_adm_active_cost NUMERIC;
  v_adm_by_status JSONB;

  v_result JSONB;
BEGIN
  -- 1. Agregações para fuel_requests
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('aprovado', 'reprovado', 'encerrado', 'concluido')),
    COUNT(id) FILTER (WHERE status IN ('encerrado', 'aprovado', 'concluido')),
    COALESCE(SUM(valor), 0),
    COUNT(id) FILTER (WHERE status = 'aguardando_oc'),
    COUNT(id) FILTER (WHERE status = 'aguardando_pagamento'),
    COUNT(id) FILTER (WHERE status = 'em_revisao_admin')
  INTO 
    v_fuel_total, v_fuel_pendentes, v_fuel_aprovados, v_fuel_valor_total, 
    v_fuel_aguardando_oc, v_fuel_aguardando_pagamento, v_fuel_em_revisao_admin
  FROM fuel_requests 
  WHERE deleted_at IS NULL;

  -- Agrupamento por status (fuel)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY status
  ) s;

  -- Agrupamento por tipo (fuel)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type', type, 'count', count)), '[]'::jsonb)
  INTO v_fuel_by_type
  FROM (
    SELECT COALESCE(type, 'abastecimento') as type, COUNT(id) as count 
    FROM fuel_requests 
    WHERE deleted_at IS NULL 
    GROUP BY COALESCE(type, 'abastecimento')
  ) t;

  -- 2. Agregações para admission_requests
  SELECT 
    COUNT(id),
    COUNT(id) FILTER (WHERE status NOT IN ('concluido', 'cancelado')),
    COUNT(id) FILTER (WHERE status = 'registros_concluidos'),
    COALESCE(SUM(salario_previsto) FILTER (WHERE status NOT IN ('concluido', 'cancelado')), 0)
  INTO 
    v_adm_total, v_adm_em_andamento, v_adm_aguardando_registros, v_adm_active_cost
  FROM admission_requests;

  -- Agrupamento por status (admission)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', count)), '[]'::jsonb)
  INTO v_adm_by_status
  FROM (
    SELECT status, COUNT(id) as count 
    FROM admission_requests 
    GROUP BY status
  ) sa;

  -- 3. Constrói o JSON final
  v_result := jsonb_build_object(
    'fuel', jsonb_build_object(
      'total', v_fuel_total,
      'pendentes', v_fuel_pendentes,
      'aprovados', v_fuel_aprovados,
      'valor_total', v_fuel_valor_total,
      'aguardando_oc', v_fuel_aguardando_oc,
      'aguardando_pagamento', v_fuel_aguardando_pagamento,
      'em_revisao_admin', v_fuel_em_revisao_admin,
      'by_status', v_fuel_by_status,
      'by_type', v_fuel_by_type
    ),
    'admission', jsonb_build_object(
      'total', v_adm_total,
      'em_andamento', v_adm_em_andamento,
      'aguardando_registros', v_adm_aguardando_registros,
      'active_cost', v_adm_active_cost,
      'by_status', v_adm_by_status
    )
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_roles"("_user_id" "uuid") RETURNS "public"."app_role"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_authorized boolean := FALSE;
  v_roles public.app_role[];
BEGIN
  -- Visibilidade: o próprio usuário, ou diretoria/master (legado ou novo modelo)
  IF v_caller_id = _user_id THEN
    v_is_authorized := TRUE;
  ELSE
    v_is_authorized := EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_caller_id AND role IN ('diretoria'::public.app_role, 'master'::public.app_role)
      UNION ALL
      SELECT 1
      FROM public.user_role_assignments ja
      JOIN public.roles r ON r.id = ja.role_id
      WHERE ja.user_id = v_caller_id
        AND (r.key IN ('diretoria','master') OR r.is_master = TRUE)
    );
  END IF;

  IF NOT v_is_authorized THEN
    RETURN ARRAY[]::public.app_role[];
  END IF;

  -- Combina, converte e deduplica as fontes de papéis
  SELECT COALESCE(array_agg(DISTINCT role_enum), ARRAY[]::public.app_role[])
  INTO v_roles
  FROM (
    -- 1) Fonte legada
    SELECT role AS role_enum
    FROM public.user_roles
    WHERE user_id = _user_id

    UNION

    -- 2) Modelo novo: converte key -> enum apenas para valores válidos
    SELECT r.key::public.app_role
    FROM public.user_role_assignments ja
    JOIN public.roles r ON r.id = ja.role_id
    WHERE ja.user_id = _user_id
      AND r.key IN ('master','diretoria','supervisor','financeiro','compras','administrativo','rh','colaborador')

    UNION

    -- 3) Flag is_master injeta automaticamente o papel 'master'
    SELECT 'master'::public.app_role
    FROM public.user_role_assignments ja
    JOIN public.roles r ON r.id = ja.role_id
    WHERE ja.user_id = _user_id AND r.is_master = TRUE
  ) AS combined_sources;

  RETURN v_roles;
END;
$$;


ALTER FUNCTION "public"."get_user_roles"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _user_count INT;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );

  -- Check if this is the first user
  SELECT count(*) INTO _user_count FROM public.profiles;

  IF _user_count = 1 THEN
    -- First user becomes diretoria (full admin)
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'diretoria');
  ELSE
    -- Default role: colaborador
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_module_code" "text", "p_action_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT uep.allowed
     FROM public.user_effective_permissions uep
     JOIN public.permission_modules pm ON pm.id = uep.module_id
     JOIN public.permission_actions pa ON pa.id = uep.action_id
     WHERE uep.user_id = p_user_id AND pm.code = p_module_code AND pa.code = p_action_code
     LIMIT 1),
    (SELECT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = p_user_id AND r.is_master)),
    false
  )
$$;


ALTER FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_module_code" "text", "p_action_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _user_id
      AND (
        r.key::text = _role::text
        OR (r.is_master = TRUE AND _role = 'master'::app_role)
        OR (r.is_master = TRUE AND _role = 'diretoria'::app_role)
      )
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_master_removal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE _master_role_id uuid; _remaining integer;
BEGIN
  SELECT id INTO _master_role_id FROM public.roles WHERE is_master LIMIT 1;
  IF _master_role_id IS NULL THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' AND OLD.role_id = _master_role_id THEN
    SELECT count(*) INTO _remaining FROM public.user_role_assignments WHERE role_id = _master_role_id AND id != OLD.id;
    IF _remaining < 1 THEN RAISE EXCEPTION 'O sistema precisa ter pelo menos um usuário master.'; END IF;
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_last_master_removal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_approval_action"("p_approval_request_id" "uuid", "p_action" "text", "p_comments" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow RECORD;
  _next RECORD;
  _prev RECORD;
  _old text;
  _new text;
  _module_code text;
BEGIN
  IF p_action NOT IN ('approve','reject','return') THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Ação inválida');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM approval_requests WHERE id = p_approval_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Fluxo já encerrado');
  END IF;

  IF _req.current_approver_user_id != _uid THEN
    RETURN jsonb_build_object('code','AUTH-009','message','Você não é o aprovador da etapa atual');
  END IF;

  SELECT * INTO _flow FROM approval_flows WHERE id = _req.flow_id;
  _old := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments)='') THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da recusa');
    END IF;
    _new := 'rejected';
    UPDATE approval_request_steps SET status='rejected', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN
      RETURN jsonb_build_object('code','ENGINE-403','message','Este fluxo não permite devolução');
    END IF;
    IF p_comments IS NULL OR trim(p_comments)='' THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da devolução');
    END IF;

    IF COALESCE(_flow.return_mode,'requester') = 'previous_step' THEN
      SELECT * INTO _prev FROM approval_request_steps
        WHERE approval_request_id=p_approval_request_id AND step_order < _req.current_step_order
        ORDER BY step_order DESC LIMIT 1;
      IF _prev.id IS NOT NULL THEN
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_request_steps SET status='pending', action_at=NULL, comments=NULL
          WHERE id=_prev.id;
        _new := 'awaiting_step_'||_prev.step_order;
        UPDATE approval_requests
          SET current_step_order=_prev.step_order,
              current_approver_user_id=_prev.approver_user_id,
              status=_new
          WHERE id=p_approval_request_id;
        IF _flow.notify_next_approver THEN
          INSERT INTO notifications (user_id,title,message,metadata)
          VALUES (_prev.approver_user_id,'Solicitação devolvida para reanálise',
            COALESCE('Motivo: '||p_comments,'Devolvida'),
            jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
        END IF;
      ELSE
        _new := 'returned_to_requester';
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
      END IF;
    ELSE
      _new := 'returned_to_requester';
      UPDATE approval_request_steps SET status='pending', action_at=NULL
        WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
      UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
    END IF;

  ELSIF p_action = 'approve' THEN
    UPDATE approval_request_steps SET status='approved', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    SELECT * INTO _next FROM approval_request_steps
      WHERE approval_request_id=p_approval_request_id
        AND step_order > _req.current_step_order AND status='pending'
      ORDER BY step_order LIMIT 1;
    IF _next.id IS NOT NULL THEN
      _new := 'awaiting_step_'||_next.step_order;
      UPDATE approval_requests
        SET current_step_order=_next.step_order,
            current_approver_user_id=_next.approver_user_id,
            status=_new
        WHERE id=p_approval_request_id;
      IF _flow.notify_next_approver THEN
        INSERT INTO notifications (user_id,title,message,metadata)
        VALUES (_next.approver_user_id,'Nova aprovação pendente',
          'Solicitação aguardando sua aprovação',
          jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
      END IF;
    ELSE
      _new := 'approved';
      UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;
    END IF;
  END IF;

  -- Histórico sempre gravado
  INSERT INTO approval_history (approval_request_id,action,action_by,step_order,comments,old_status,new_status)
  VALUES (p_approval_request_id,p_action,_uid,_req.current_step_order,p_comments,_old,_new);

  INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details)
  VALUES (_uid,'approval_'||p_action,'approval_request',p_approval_request_id::text,
    jsonb_build_object('old_status',_old,'new_status',_new,'comments',p_comments));

  -- Notificação ao solicitante SEMPRE (independente de notify_next_approver)
  IF _req.requester_user_id != _uid THEN
    INSERT INTO notifications (user_id,title,message,metadata) VALUES (_req.requester_user_id,
      CASE p_action
        WHEN 'approve' THEN CASE WHEN _new='approved' THEN 'Solicitação aprovada' ELSE 'Etapa aprovada' END
        WHEN 'reject' THEN 'Solicitação recusada'
        WHEN 'return' THEN 'Solicitação devolvida para correção'
      END,
      CASE p_action
        WHEN 'approve' THEN 'Sua solicitação avançou no fluxo'
        WHEN 'reject' THEN COALESCE('Motivo: '||p_comments,'Recusada')
        WHEN 'return' THEN COALESCE('Motivo: '||p_comments||' — corrija e reenvie para retomar o fluxo','Devolvida para correção')
      END,
      jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id,'action',p_action,'comments',p_comments));
  END IF;

  SELECT am.code INTO _module_code FROM approval_modules am WHERE am.id = _req.module_id;

  IF _module_code IN ('abastecimento', 'reembolso', 'diaria') THEN
    IF _new = 'approved' THEN
      UPDATE fuel_requests SET status = 'aprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE fuel_requests SET status = 'reprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'reprovado', _uid);
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE fuel_requests SET status = 'retornado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'compras' THEN
    IF _new = 'approved' THEN
      UPDATE purchases SET status = 'aprovado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE purchases SET status = 'rejeitado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'rejeitado', _uid);
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE purchases SET status = 'retornado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'admissions' THEN
    IF _new = 'approved' THEN
      UPDATE admission_requests SET status = 'registros_concluidos'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'registros_concluidos', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE admission_requests SET status = 'cancelado'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'cancelado', _uid);
    ELSIF _new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return') THEN
      UPDATE admission_requests SET status = 'rascunho'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'rascunho', _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'status',_new);
END;
$$;


ALTER FUNCTION "public"."process_approval_action"("p_approval_request_id" "uuid", "p_action" "text", "p_comments" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_user_permissions"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _role_id uuid;
  _role_ids uuid[] := '{}';
  _current_id uuid;
  _is_master boolean;
  _depth integer := 0;
BEGIN
  DELETE FROM public.user_effective_permissions WHERE user_id = p_user_id;

  SELECT ura.role_id INTO _role_id
  FROM public.user_role_assignments ura WHERE ura.user_id = p_user_id LIMIT 1;
  IF _role_id IS NULL THEN RETURN; END IF;

  SELECT is_master INTO _is_master FROM public.roles WHERE id = _role_id;
  IF _is_master THEN
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, pm.id, pa.id, true
    FROM public.permission_modules pm CROSS JOIN public.permission_actions pa
    WHERE pm.active AND pa.active
    ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = true;
    RETURN;
  END IF;

  _current_id := _role_id;
  WHILE _current_id IS NOT NULL AND _depth < 20 LOOP
    _role_ids := _role_ids || _current_id;
    SELECT parent_role_id INTO _current_id FROM public.roles WHERE id = _current_id;
    _depth := _depth + 1;
  END LOOP;

  _role_ids := ARRAY(SELECT unnest FROM unnest(_role_ids) WITH ORDINALITY ORDER BY ordinality DESC);

  FOR _current_id IN SELECT unnest(_role_ids) LOOP
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, rpm.module_id, rpm.action_id, rpm.allowed
    FROM public.role_permission_matrix rpm WHERE rpm.role_id = _current_id
    ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = EXCLUDED.allowed;
  END LOOP;

  INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
  SELECT p_user_id, upo.module_id, upo.action_id, upo.allowed
  FROM public.user_permission_overrides upo WHERE upo.user_id = p_user_id
  ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = EXCLUDED.allowed;
END;
$$;


ALTER FUNCTION "public"."rebuild_user_permissions"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_approval_flow_steps"("p_flow_id" "uuid", "p_steps" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _step jsonb; _idx int := 0; _uid uuid := auth.uid();
  _type text; _user uuid; _sector uuid; _role text;
BEGIN
  IF p_flow_id IS NULL THEN RETURN jsonb_build_object('error', 'flow_id obrigatório'); END IF;

  IF NOT (
    has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')
    OR EXISTS (SELECT 1 FROM public.user_role_assignments ura
               JOIN public.roles r ON r.id = ura.role_id
               WHERE ura.user_id = _uid AND r.is_master = TRUE)
  ) THEN
    RETURN jsonb_build_object('error', 'Sem permissão para editar fluxo de aprovação');
  END IF;

  -- Validação prévia
  IF p_steps IS NOT NULL AND jsonb_typeof(p_steps) = 'array' THEN
    FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
      _idx := _idx + 1;
      _type   := COALESCE(_step->>'approver_type', 'usuario_fixo');
      _user   := NULLIF(_step->>'approver_user_id','')::uuid;
      _sector := NULLIF(_step->>'fixed_sector_id','')::uuid;
      _role   := NULLIF(_step->>'approver_role_key','');

      IF _type NOT IN ('usuario_fixo','gestor_imediato','responsavel_do_setor_do_solicitante',
                       'responsavel_do_setor_especifico','cargo_perfil') THEN
        RETURN jsonb_build_object('error', format('Etapa %s: tipo de aprovador inválido (%s)', _idx, _type));
      END IF;
      IF _type='usuario_fixo' AND _user IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: usuário fixo é obrigatório', _idx)); END IF;
      IF _type='responsavel_do_setor_especifico' AND _sector IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: setor específico é obrigatório', _idx)); END IF;
      IF _type='cargo_perfil' AND _role IS NULL THEN
        RETURN jsonb_build_object('error', format('Etapa %s: cargo (role) é obrigatório', _idx)); END IF;
      IF _type='cargo_perfil' AND _role = 'colaborador' THEN
        RETURN jsonb_build_object('error', format('Etapa %s: cargo "colaborador" não pode ser aprovador', _idx)); END IF;
      IF _type='usuario_fixo' AND _user IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.profiles WHERE id = _user AND COALESCE(active,true)
      ) THEN
        RETURN jsonb_build_object('error', format('Etapa %s: usuário fixo está inativo', _idx)); END IF;
    END LOOP;
  ELSE
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  IF _idx < 1 THEN
    RETURN jsonb_build_object('error', 'Fluxo deve ter ao menos 1 etapa');
  END IF;

  DELETE FROM public.approval_flow_steps WHERE flow_id = p_flow_id;

  _idx := 0;
  FOR _step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    _idx := _idx + 1;
    INSERT INTO public.approval_flow_steps (
      flow_id, step_order, approver_type, approver_user_id,
      fixed_sector_id, approver_role_key, active
    ) VALUES (
      p_flow_id, _idx,
      COALESCE(_step->>'approver_type', 'usuario_fixo'),
      NULLIF(_step->>'approver_user_id', '')::uuid,
      NULLIF(_step->>'fixed_sector_id', '')::uuid,
      NULLIF(_step->>'approver_role_key', ''),
      true
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', _idx);
END;
$$;


ALTER FUNCTION "public"."replace_approval_flow_steps"("p_flow_id" "uuid", "p_steps" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_request"("_request_id" "uuid", "_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _is_master boolean;
  _allowed_statuses text[] := ARRAY['reprovado', 'encerrado'];
  _final_statuses text[] := ARRAY['concluido', 'pago'];
BEGIN
  -- Check master status
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _uid AND r.is_master
  ) INTO _is_master;

  -- Only admin/diretoria or master
  IF NOT (_is_master OR has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Apenas Diretoria, Administrativo ou Master podem excluir');
  END IF;

  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  IF _req.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Já foi excluída');
  END IF;

  -- Master can delete any non-concluded request
  IF _is_master THEN
    IF _req.status::text = ANY(_final_statuses) THEN
      RETURN jsonb_build_object('error', 'Não é possível excluir solicitações já concluídas/pagas');
    END IF;
    -- Master can delete, proceed
  ELSE
    -- For non-master admin/diretoria: only reprovado/encerrado (or any for diaria)
    IF _req.type IN ('abastecimento', 'reembolso') AND NOT (_req.status::text = ANY(_allowed_statuses)) THEN
      RETURN jsonb_build_object('error', format('Só é possível excluir solicitações com status: %s', array_to_string(_allowed_statuses, ', ')));
    END IF;
  END IF;

  -- Cancel any active approval flow
  UPDATE public.approval_requests
  SET status = 'cancelled', ended_at = now()
  WHERE reference_id = _request_id AND ended_at IS NULL;

  UPDATE public.fuel_requests
  SET deleted_at = now(), deleted_by = _uid
  WHERE id = _request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'soft_delete', 'fuel_requests', _request_id::text,
    jsonb_build_object('type', _req.type, 'status', _req.status, 'reason', _reason, 'is_master', _is_master));

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."soft_delete_request"("_request_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_approval_flow"("p_module_code" "text", "p_reference_id" "uuid", "p_requester_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
  _uid uuid := auth.uid();
  _resolved_count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado');
  END IF;
  IF _uid <> p_requester_user_id
     AND NOT (has_role(_uid,'diretoria'::app_role)
              OR has_role(_uid,'administrativo'::app_role)
              OR has_role(_uid,'master'::app_role)
              OR has_role(_uid,'rh'::app_role)) THEN
    RETURN jsonb_build_object('error', 'Não autorizado a iniciar fluxo em nome de outro usuário');
  END IF;

  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_reference_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('error', 'Já existe um fluxo de aprovação ativo para esta solicitação');
  END IF;

  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active LIMIT 1;
  IF _module_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado');
  END IF;

  SELECT * INTO _flow FROM public.approval_flows
    WHERE module_id = _module_id AND active
    ORDER BY updated_at DESC, created_at DESC LIMIT 1;
  IF _flow.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo');
  END IF;

  -- Guard defensivo: fluxo ativo precisa realmente pertencer ao módulo solicitado
  IF _flow.module_id IS DISTINCT FROM _module_id THEN
    RETURN jsonb_build_object('error', 'Fluxo ativo não pertence ao módulo solicitado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  -- Pré-validação: percorrer etapas e confirmar que ao menos uma resolve aprovador ativo
  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    CASE _step.approver_type
      WHEN 'specific_user' THEN
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
        END IF;
      ELSE
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      _resolved_count := _resolved_count + 1;
    END IF;
  END LOOP;

  IF _resolved_count = 0 THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovador resolvível para o solicitante');
  END IF;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (_module_id, _flow.id, p_reference_id, p_requester_user_id, 'pending_resolution')
  RETURNING id INTO _request_id;

  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    _resolved_sector_id := NULL;

    CASE _step.approver_type
      WHEN 'specific_user' THEN
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _step.sector_id;
        END IF;
      ELSE
        SELECT id INTO _resolved_user_id FROM public.profiles
          WHERE id = _step.approver_user_id AND COALESCE(active,true) LIMIT 1;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      INSERT INTO public.approval_request_steps (
        approval_request_id, flow_step_id, step_order, approver_user_id,
        is_required, status, timeout_hours
      ) VALUES (
        _request_id, _step.id, _step.step_order, _resolved_user_id,
        _step.is_required, 'pending', _step.timeout_hours
      );
      IF _first_approver IS NULL THEN
        _first_approver := _resolved_user_id;
        _first_order := _step.step_order;
      END IF;
    END IF;
  END LOOP;

  IF _first_approver IS NULL THEN
    DELETE FROM public.approval_requests WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'Nenhum aprovador válido encontrado');
  END IF;

  UPDATE public.approval_requests
    SET status = 'awaiting_step_' || _first_order,
        current_step_order = _first_order,
        current_approver_user_id = _first_approver
    WHERE id = _request_id;

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_first_approver, 'Nova aprovação pendente', 'Uma solicitação aguarda sua aprovação.',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$$;


ALTER FUNCTION "public"."start_approval_flow"("p_module_code" "text", "p_reference_id" "uuid", "p_requester_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_purchase_request"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow_res jsonb;
  _pending_return RECORD;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.requester_user_id <> _uid THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Apenas o solicitante pode enviar');
  END IF;

  IF _req.status NOT IN ('rascunho','retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400',
      'message', format('Transição inválida a partir do status "%s"', _req.status));
  END IF;

  -- Se existe fluxo devolvido ao solicitante, retomá-lo em vez de criar novo
  SELECT id, current_step_order, current_approver_user_id
    INTO _pending_return
    FROM public.approval_requests
    WHERE reference_id = p_request_id
      AND ended_at IS NULL
      AND status = 'returned_to_requester'
    ORDER BY created_at DESC LIMIT 1;

  IF _pending_return.id IS NOT NULL THEN
    UPDATE public.approval_requests
      SET status = 'awaiting_step_' || _pending_return.current_step_order
      WHERE id = _pending_return.id;

    UPDATE public.purchases
      SET status = 'em_aprovacao',
          approval_request_id = _pending_return.id
      WHERE id = p_request_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES (_uid, 'resubmit_after_return', 'purchases', p_request_id::text,
        jsonb_build_object('approval_request_id', _pending_return.id,
                           'resumed_step', _pending_return.current_step_order));

    IF _pending_return.current_approver_user_id IS NOT NULL
       AND _pending_return.current_approver_user_id <> _uid THEN
      INSERT INTO public.notifications (user_id, title, message, metadata)
      VALUES (_pending_return.current_approver_user_id,
        'Solicitação reenviada para sua aprovação',
        'Um solicitante corrigiu e reenviou uma solicitação de compra.',
        jsonb_build_object('entity_type','approval_request','entity_id',_pending_return.id));
    END IF;

    RETURN jsonb_build_object('success', true,
      'approval_request_id', _pending_return.id,
      'status', 'em_aprovacao',
      'resumed', true);
  END IF;

  -- Guard: não iniciar novo fluxo se já existir um ativo
  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_request_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('code','ENGINE-409','message','Já existe fluxo ativo');
  END IF;

  _flow_res := public.start_approval_flow('compras', p_request_id, _uid);

  IF _flow_res ? 'error' THEN
    RETURN jsonb_build_object('code','ENGINE-500','message', _flow_res->>'error');
  END IF;

  UPDATE public.purchases
    SET status = 'em_aprovacao',
        approval_request_id = (_flow_res->>'approval_request_id')::uuid
    WHERE id = p_request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'submit_for_approval', 'purchases', p_request_id::text,
    jsonb_build_object('approval_request_id', _flow_res->>'approval_request_id'));

  RETURN jsonb_build_object('success', true,
    'approval_request_id', _flow_res->>'approval_request_id',
    'status', 'em_aprovacao');
END;
$$;


ALTER FUNCTION "public"."submit_purchase_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _old_status text;
  _new_status text;
BEGIN
  _old_status := COALESCE(
    to_jsonb(OLD)->>'status',
    to_jsonb(OLD)->>'status_triagem'
  );
  _new_status := COALESCE(
    to_jsonb(NEW)->>'status',
    to_jsonb(NEW)->>'status_triagem'
  );
  IF _old_status IS DISTINCT FROM _new_status THEN
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (
      TG_ARGV[0],
      TG_TABLE_NAME,
      NEW.id,
      _old_status,
      _new_status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_rebuild_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_role_assignments' THEN
    PERFORM public.rebuild_user_permissions(COALESCE(NEW.user_id, OLD.user_id));
  ELSIF TG_TABLE_NAME = 'user_permission_overrides' THEN
    PERFORM public.rebuild_user_permissions(COALESCE(NEW.user_id, OLD.user_id));
  ELSIF TG_TABLE_NAME = 'role_permission_matrix' THEN
    PERFORM public.rebuild_user_permissions(ura.user_id)
    FROM public.user_role_assignments ura WHERE ura.role_id = COALESCE(NEW.role_id, OLD.role_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trigger_rebuild_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_participates_in_approval"("p_approval_request_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_request_steps
    WHERE approval_request_id = p_approval_request_id
      AND approver_user_id = p_user_id
  )
$$;


ALTER FUNCTION "public"."user_participates_in_approval"("p_approval_request_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vehicles_normalize"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.placa := upper(trim(NEW.placa));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."vehicles_normalize"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admission_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admission_request_id" "uuid" NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "file_type" "text" DEFAULT 'generic'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text",
    "uploaded_by" "text" NOT NULL,
    "link_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admission_files_link_type_check" CHECK (("link_type" = ANY (ARRAY['DOCUMENTS'::"text", 'SIGNATURE'::"text", 'EXAM'::"text"]))),
    CONSTRAINT "admission_files_uploaded_by_check" CHECK (("uploaded_by" = ANY (ARRAY['CANDIDATE'::"text", 'ADMIN'::"text"])))
);


ALTER TABLE "public"."admission_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admission_request_id" "uuid" NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "conducted_by" "uuid",
    "interview_mode" "text" DEFAULT 'presencial'::"text",
    "interview_address" "text",
    "interview_city" "text",
    "meeting_link" "text",
    "result" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admission_interviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_public_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admission_request_id" "uuid" NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "link_type" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "admin_uploaded_at" timestamp with time zone,
    "candidate_uploaded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "admission_public_links_link_type_check" CHECK (("link_type" = ANY (ARRAY['DOCUMENTS'::"text", 'SIGNATURE'::"text"])))
);


ALTER TABLE "public"."admission_public_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admission_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "local_contratacao" "text" DEFAULT ''::"text" NOT NULL,
    "centro_custo" "text" DEFAULT ''::"text" NOT NULL,
    "cargo_funcao" "text" DEFAULT ''::"text" NOT NULL,
    "tipo_contrato" "text" DEFAULT ''::"text" NOT NULL,
    "salario_previsto" numeric(12,2),
    "jornada" "text" DEFAULT ''::"text" NOT NULL,
    "data_prevista_inicio" "date",
    "gestor_responsavel" "text" DEFAULT ''::"text" NOT NULL,
    "motivo" "text" DEFAULT ''::"text" NOT NULL,
    "justificativa" "text",
    "contrato_publico_ref" "text",
    "status" "public"."admission_status" DEFAULT 'rascunho'::"public"."admission_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" "text" DEFAULT 'media'::"text" NOT NULL,
    "welcome_local_apresentacao" "text",
    "welcome_responsavel_nome" "text",
    "welcome_responsavel_contato" "text",
    "welcome_pdf_generated_at" timestamp with time zone,
    "shirt_size" "text",
    "pants_size" "text",
    "shoe_size" "text",
    "uniform_sizes" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."admission_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_flow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "flow_id" "uuid" NOT NULL,
    "step_order" integer NOT NULL,
    "approver_user_id" "uuid",
    "is_required" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approver_type" "text" DEFAULT 'usuario_fixo'::"text" NOT NULL,
    "fixed_sector_id" "uuid",
    "approver_role_key" "text",
    CONSTRAINT "approval_flow_steps_approver_type_check" CHECK (("approver_type" = ANY (ARRAY['usuario_fixo'::"text", 'gestor_imediato'::"text", 'responsavel_do_setor_do_solicitante'::"text", 'responsavel_do_setor_especifico'::"text", 'cargo_perfil'::"text"]))),
    CONSTRAINT "approval_flow_steps_required_fields_check" CHECK (((("approver_type" = 'usuario_fixo'::"text") AND ("approver_user_id" IS NOT NULL)) OR (("approver_type" = 'responsavel_do_setor_especifico'::"text") AND ("fixed_sector_id" IS NOT NULL)) OR (("approver_type" = 'cargo_perfil'::"text") AND ("approver_role_key" IS NOT NULL)) OR ("approver_type" = ANY (ARRAY['gestor_imediato'::"text", 'responsavel_do_setor_do_solicitante'::"text"]))))
);


ALTER TABLE "public"."approval_flow_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_flows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "approval_type" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "require_rejection_reason" boolean DEFAULT true NOT NULL,
    "allow_return_for_adjustment" boolean DEFAULT false NOT NULL,
    "notify_next_approver" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "return_mode" "text" DEFAULT 'requester'::"text",
    CONSTRAINT "approval_flows_approval_type_check" CHECK (("approval_type" = ANY (ARRAY['sequential'::"text", 'parallel'::"text"])))
);


ALTER TABLE "public"."approval_flows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "action_by" "uuid" NOT NULL,
    "step_order" integer,
    "comments" "text",
    "old_status" "text",
    "new_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_request_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_request_id" "uuid" NOT NULL,
    "flow_step_id" "uuid",
    "step_order" integer NOT NULL,
    "approver_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "action_at" timestamp with time zone,
    "comments" "text",
    "approver_rule" "text",
    "resolved_sector_id" "uuid",
    "resolved_from_user_id" "uuid",
    "approver_role_key" "text"
);

ALTER TABLE ONLY "public"."approval_request_steps" REPLICA IDENTITY FULL;


ALTER TABLE "public"."approval_request_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_id" "uuid" NOT NULL,
    "flow_id" "uuid" NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "current_step_order" integer,
    "current_approver_user_id" "uuid",
    "status" "text" DEFAULT 'pending_approval'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."approval_requests" REPLICA IDENTITY FULL;


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidate_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "file_path" "text",
    "uploaded_at" timestamp with time zone,
    "status" "public"."doc_status" DEFAULT 'pending'::"public"."doc_status" NOT NULL,
    "last_review_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."candidate_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admission_request_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "cpf" "text",
    "telefone" "text",
    "email" "text",
    "cidade" "text",
    "experiencia" "text",
    "indicacao_interna" boolean DEFAULT false NOT NULL,
    "curriculo_path" "text",
    "status_triagem" "public"."candidate_status" DEFAULT 'novo'::"public"."candidate_status" NOT NULL,
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "interview_at" timestamp with time zone,
    "interview_address" "text",
    "interview_city" "text",
    "interviewer_name" "text",
    "interview_notes" "text",
    "interview_approved" boolean,
    "interview_mode" "text" DEFAULT 'presencial'::"text",
    "meeting_link" "text",
    "interview_confirmed_at" timestamp with time zone,
    "interview_confirmed_by" "uuid",
    "shirt_size" "text",
    "pants_size" "text",
    "shoe_size" "text"
);


ALTER TABLE "public"."candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text",
    "telefone" "text",
    "endereco" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "cpf" "text",
    "sector_id" "uuid",
    "role_name" "text" DEFAULT ''::"text" NOT NULL,
    "worksite" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "admission_request_id" "uuid",
    "user_profile_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "telefone" "text",
    "rg" "text",
    "data_nascimento" "date",
    "endereco" "text",
    "observacoes" "text",
    "shirt_size" "text",
    "pants_size" "text",
    "shoe_size" "text",
    "uniform_sizes" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_document_id" "uuid" NOT NULL,
    "reviewer_user_id" "uuid" NOT NULL,
    "decision" "public"."doc_status" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "applies_condition" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dynamic_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module" "text" NOT NULL,
    "field_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dynamic_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epi_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collaborator_id" "uuid" NOT NULL,
    "epi_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "size" "text",
    "delivered_by_user_id" "uuid" NOT NULL,
    "delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sector_id" "uuid",
    "worksite" "text" DEFAULT ''::"text" NOT NULL,
    "reason" "text" DEFAULT 'primeira_entrega'::"text" NOT NULL,
    "current_status" "text" DEFAULT 'entregue'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "signature_employee_url" "text",
    "signature_responsible_url" "text",
    "document_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "epi_deliveries_current_status_check" CHECK (("current_status" = ANY (ARRAY['entregue'::"text", 'em_uso'::"text", 'devolvido'::"text", 'substituido'::"text", 'pendente_devolucao'::"text", 'perdido'::"text", 'baixado'::"text"]))),
    CONSTRAINT "epi_deliveries_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "epi_deliveries_reason_check" CHECK (("reason" = ANY (ARRAY['primeira_entrega'::"text", 'troca'::"text", 'reposicao'::"text", 'desgaste'::"text", 'perda'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."epi_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epi_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" DEFAULT ''::"text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'Outros'::"text" NOT NULL,
    "manufacturer" "text" DEFAULT ''::"text" NOT NULL,
    "ca_number" "text" DEFAULT ''::"text" NOT NULL,
    "ca_valid_until" "date",
    "useful_life_days" integer,
    "size_required" boolean DEFAULT false NOT NULL,
    "unit" "text" DEFAULT 'un'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."epi_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epi_kit_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sector_id" "uuid",
    "role_name" "text" DEFAULT ''::"text" NOT NULL,
    "epi_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "epi_kit_rules_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."epi_kit_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."epi_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_id" "uuid" NOT NULL,
    "movement_type" "text" DEFAULT 'delivery'::"text" NOT NULL,
    "moved_by_user_id" "uuid" NOT NULL,
    "moved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "condition" "text" DEFAULT ''::"text" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "attachment_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "epi_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['delivery'::"text", 'return'::"text", 'replacement'::"text", 'loss'::"text", 'disposal'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."epi_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fuel_request_id" "uuid" NOT NULL,
    "type" "public"."fuel_attachment_type" NOT NULL,
    "file_path" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fuel_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "data_abastecimento" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "public"."fuel_status" DEFAULT 'rascunho'::"public"."fuel_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'abastecimento'::"text" NOT NULL,
    "placa" "text",
    "km" "text",
    "motivo" "text",
    "categoria" "text",
    "payment_method" "text",
    "pix_key" "text",
    "bank_name" "text",
    "bank_agency" "text",
    "bank_account" "text",
    "daily_category" "text",
    "person_name" "text",
    "person_cpf" "text",
    "hours" numeric,
    "daily_value" numeric,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "pix_key_type" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_notes" "text",
    "oc_number" "text",
    "oc_notes" "text",
    "oc_uploaded_by" "uuid",
    "oc_uploaded_at" timestamp with time zone,
    "payment_due_date" "date",
    "paid_at" timestamp with time zone,
    "payment_notes" "text",
    "paid_by" "uuid",
    "assigned_to_user_id" "uuid"
);


ALTER TABLE "public"."fuel_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fuel_request_id" "uuid" NOT NULL,
    "reviewer_user_id" "uuid" NOT NULL,
    "decision" "public"."review_decision" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fuel_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medical_exams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "clinic_id" "uuid",
    "scheduled_at" timestamp with time zone,
    "status" "public"."exam_status" DEFAULT 'aguardando'::"public"."exam_status" NOT NULL,
    "restrictions" "text",
    "guide_pdf_path" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_name" "text"
);


ALTER TABLE "public"."medical_exams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel" "public"."notification_channel" DEFAULT 'in_app'::"public"."notification_channel" NOT NULL,
    "read_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permission_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permission_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permission_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permission_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "department" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sector_id" "uuid",
    "manager_user_id" "uuid",
    "notification_preferences" "jsonb" DEFAULT '{"push": false, "email": true}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."public_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_user_id" "uuid" NOT NULL,
    "supplier" "text",
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "justification" "text",
    "cost_center" "text",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "estimated_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "approved_value" numeric(12,2),
    "purchase_number" "text",
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "approval_request_id" "uuid",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchases_estimated_value_check" CHECK (("estimated_value" >= (0)::numeric)),
    CONSTRAINT "purchases_priority_check" CHECK (("priority" = ANY (ARRAY['baixa'::"text", 'normal'::"text", 'alta'::"text"])))
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "daily_limit" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."request_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permission_matrix" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "action_id" "uuid" NOT NULL,
    "allowed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permission_matrix" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "parent_role_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_master" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "responsible_user_id" "uuid",
    "substitute_user_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "folha_pagamento" boolean DEFAULT false NOT NULL,
    "esocial" boolean DEFAULT false NOT NULL,
    "ponto" boolean DEFAULT false NOT NULL,
    "sistema_interno" boolean DEFAULT false NOT NULL,
    "entrega_epi" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."system_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_effective_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "action_id" "uuid" NOT NULL,
    "allowed" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_effective_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_permission_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "action_id" "uuid" NOT NULL,
    "allowed" boolean NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_permission_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."user_role_assignments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."user_role_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "placa" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "km" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "observacoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "vehicles_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'inativo'::"text", 'manutencao'::"text"])))
);

ALTER TABLE ONLY "public"."vehicles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_admission_metrics" WITH ("security_invoker"='true') AS
 SELECT "count"(*) AS "total",
    "count"(*) FILTER (WHERE ("status" <> ALL (ARRAY['concluido'::"public"."admission_status", 'cancelado'::"public"."admission_status"]))) AS "pendentes",
    "count"(*) FILTER (WHERE ("status" = 'concluido'::"public"."admission_status")) AS "concluidos",
    "count"(*) FILTER (WHERE ("status" = 'cancelado'::"public"."admission_status")) AS "cancelados",
    COALESCE("sum"("salario_previsto"), (0)::numeric) AS "salario_total",
    "centro_custo",
    "status"
   FROM "public"."admission_requests"
  GROUP BY "centro_custo", "status";


ALTER VIEW "public"."vw_admission_metrics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_admissions_list_items" WITH ("security_invoker"='true') AS
 SELECT "ar"."id",
    "ar"."cargo_funcao",
    "ar"."centro_custo",
    "ar"."local_contratacao",
    "ar"."status",
    "ar"."priority",
    "ar"."salario_previsto",
    "ar"."data_prevista_inicio",
    "ar"."created_at",
    "ar"."requester_user_id",
    "ar"."tipo_contrato",
    "ar"."jornada",
    "ar"."gestor_responsavel",
    "ar"."motivo",
    "p"."full_name" AS "solicitante_nome",
    "c_primary"."nome" AS "candidato_nome",
    "c_primary"."id" AS "candidato_id",
    COALESCE("c_stats"."total_candidatos", 0) AS "total_candidatos",
        CASE
            WHEN ("c_primary"."id" IS NULL) THEN 'sem_candidato'::"text"
            WHEN ("doc_stats"."total_docs" = 0) THEN 'pendente'::"text"
            WHEN ("doc_stats"."approved_docs" = "doc_stats"."total_docs") THEN 'completo'::"text"
            WHEN ("doc_stats"."submitted_or_approved" > 0) THEN 'parcial'::"text"
            ELSE 'pendente'::"text"
        END AS "documentos_status"
   FROM (((("public"."admission_requests" "ar"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "ar"."requester_user_id")))
     LEFT JOIN LATERAL ( SELECT "c"."id",
            "c"."nome"
           FROM "public"."candidates" "c"
          WHERE (("c"."admission_request_id" = "ar"."id") AND ("c"."status_triagem" <> ALL (ARRAY['reprovado'::"public"."candidate_status", 'desistente'::"public"."candidate_status"])))
          ORDER BY
                CASE
                    WHEN ("c"."status_triagem" = 'aprovado'::"public"."candidate_status") THEN 0
                    ELSE 1
                END, "c"."created_at" DESC
         LIMIT 1) "c_primary" ON (true))
     LEFT JOIN LATERAL ( SELECT ("count"(*))::integer AS "total_candidatos"
           FROM "public"."candidates" "c2"
          WHERE ("c2"."admission_request_id" = "ar"."id")) "c_stats" ON (true))
     LEFT JOIN LATERAL ( SELECT ("count"(*))::integer AS "total_docs",
            ("count"(*) FILTER (WHERE ("cd"."status" = 'approved'::"public"."doc_status")))::integer AS "approved_docs",
            ("count"(*) FILTER (WHERE ("cd"."status" = ANY (ARRAY['submitted'::"public"."doc_status", 'approved'::"public"."doc_status"]))))::integer AS "submitted_or_approved"
           FROM "public"."candidate_documents" "cd"
          WHERE ("cd"."candidate_id" = "c_primary"."id")) "doc_stats" ON (true));


ALTER VIEW "public"."vw_admissions_list_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_fuel_metrics" WITH ("security_invoker"='on') AS
 SELECT "type",
    "status",
    "count"(*) AS "total",
    "count"(*) FILTER (WHERE ("status" <> ALL (ARRAY['concluido'::"public"."fuel_status", 'encerrado'::"public"."fuel_status", 'reprovado'::"public"."fuel_status"]))) AS "pendentes",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['aprovado'::"public"."fuel_status", 'concluido'::"public"."fuel_status", 'encerrado'::"public"."fuel_status"]))) AS "aprovados",
    "count"(*) FILTER (WHERE ("status" = 'reprovado'::"public"."fuel_status")) AS "reprovados",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['concluido'::"public"."fuel_status", 'encerrado'::"public"."fuel_status"]))) AS "encerrados",
    COALESCE("sum"("valor"), (0)::numeric) AS "valor_total"
   FROM "public"."fuel_requests"
  GROUP BY "type", "status";


ALTER VIEW "public"."vw_fuel_metrics" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admission_files"
    ADD CONSTRAINT "admission_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_interviews"
    ADD CONSTRAINT "admission_interviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_public_links"
    ADD CONSTRAINT "admission_public_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admission_public_links"
    ADD CONSTRAINT "admission_public_links_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."admission_requests"
    ADD CONSTRAINT "admission_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_flow_steps"
    ADD CONSTRAINT "approval_flow_steps_flow_id_step_order_key" UNIQUE ("flow_id", "step_order");



ALTER TABLE ONLY "public"."approval_flow_steps"
    ADD CONSTRAINT "approval_flow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_flows"
    ADD CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_modules"
    ADD CONSTRAINT "approval_modules_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."approval_modules"
    ADD CONSTRAINT "approval_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_request_steps"
    ADD CONSTRAINT "approval_request_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidate_documents"
    ADD CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidates"
    ADD CONSTRAINT "candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaborators"
    ADD CONSTRAINT "collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_reviews"
    ADD CONSTRAINT "document_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dynamic_categories"
    ADD CONSTRAINT "dynamic_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epi_deliveries"
    ADD CONSTRAINT "epi_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epi_items"
    ADD CONSTRAINT "epi_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epi_kit_rules"
    ADD CONSTRAINT "epi_kit_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."epi_movements"
    ADD CONSTRAINT "epi_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_attachments"
    ADD CONSTRAINT "fuel_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_requests"
    ADD CONSTRAINT "fuel_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_reviews"
    ADD CONSTRAINT "fuel_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medical_exams"
    ADD CONSTRAINT "medical_exams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permission_actions"
    ADD CONSTRAINT "permission_actions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permission_actions"
    ADD CONSTRAINT "permission_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permission_modules"
    ADD CONSTRAINT "permission_modules_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permission_modules"
    ADD CONSTRAINT "permission_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_tokens"
    ADD CONSTRAINT "public_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_limits"
    ADD CONSTRAINT "request_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_limits"
    ADD CONSTRAINT "request_limits_role_request_type_key" UNIQUE ("role", "request_type");



ALTER TABLE ONLY "public"."role_permission_matrix"
    ADD CONSTRAINT "role_permission_matrix_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permission_matrix"
    ADD CONSTRAINT "role_permission_matrix_role_id_module_id_action_id_key" UNIQUE ("role_id", "module_id", "action_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_history"
    ADD CONSTRAINT "status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_registrations"
    ADD CONSTRAINT "system_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_effective_permissions"
    ADD CONSTRAINT "user_effective_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_effective_permissions"
    ADD CONSTRAINT "user_effective_permissions_user_id_module_id_action_id_key" UNIQUE ("user_id", "module_id", "action_id");



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_user_id_module_id_action_id_key" UNIQUE ("user_id", "module_id", "action_id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_role_id_key" UNIQUE ("user_id", "role_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_placa_key" UNIQUE ("placa");



CREATE INDEX "idx_admission_interviews_admission" ON "public"."admission_interviews" USING "btree" ("admission_request_id");



CREATE INDEX "idx_admission_interviews_candidate" ON "public"."admission_interviews" USING "btree" ("candidate_id");



CREATE INDEX "idx_admission_requests_created" ON "public"."admission_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admission_requests_requester" ON "public"."admission_requests" USING "btree" ("requester_user_id");



CREATE INDEX "idx_admission_requests_status" ON "public"."admission_requests" USING "btree" ("status");



CREATE INDEX "idx_admission_requests_status_created" ON "public"."admission_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_apl_candidate_type" ON "public"."admission_public_links" USING "btree" ("admission_request_id", "candidate_id", "link_type");



CREATE UNIQUE INDEX "idx_apl_token_hash" ON "public"."admission_public_links" USING "btree" ("token_hash");



CREATE INDEX "idx_candidate_documents_candidate" ON "public"."candidate_documents" USING "btree" ("candidate_id");



CREATE INDEX "idx_candidate_documents_candidate_status" ON "public"."candidate_documents" USING "btree" ("candidate_id", "status");



CREATE INDEX "idx_candidates_admission" ON "public"."candidates" USING "btree" ("admission_request_id");



CREATE INDEX "idx_candidates_admission_status" ON "public"."candidates" USING "btree" ("admission_request_id", "status_triagem");



CREATE INDEX "idx_candidates_cpf" ON "public"."candidates" USING "btree" ("cpf") WHERE ("cpf" IS NOT NULL);



CREATE UNIQUE INDEX "idx_candidates_cpf_unique" ON "public"."candidates" USING "btree" ("cpf") WHERE (("cpf" IS NOT NULL) AND ("cpf" <> ''::"text"));



CREATE INDEX "idx_collaborators_active" ON "public"."collaborators" USING "btree" ("active");



CREATE INDEX "idx_collaborators_sector" ON "public"."collaborators" USING "btree" ("sector_id");



CREATE INDEX "idx_dynamic_categories_lookup" ON "public"."dynamic_categories" USING "btree" ("module", "field_key", "is_active");



CREATE UNIQUE INDEX "idx_dynamic_categories_unique" ON "public"."dynamic_categories" USING "btree" ("module", "field_key", "label") WHERE ("is_active" = true);



CREATE INDEX "idx_epi_deliveries_collaborator" ON "public"."epi_deliveries" USING "btree" ("collaborator_id");



CREATE INDEX "idx_epi_deliveries_item" ON "public"."epi_deliveries" USING "btree" ("epi_item_id");



CREATE INDEX "idx_epi_deliveries_status" ON "public"."epi_deliveries" USING "btree" ("current_status");



CREATE INDEX "idx_epi_items_active" ON "public"."epi_items" USING "btree" ("active");



CREATE INDEX "idx_epi_items_category" ON "public"."epi_items" USING "btree" ("category");



CREATE INDEX "idx_epi_kit_rules_item" ON "public"."epi_kit_rules" USING "btree" ("epi_item_id");



CREATE INDEX "idx_epi_kit_rules_sector" ON "public"."epi_kit_rules" USING "btree" ("sector_id");



CREATE INDEX "idx_epi_movements_delivery" ON "public"."epi_movements" USING "btree" ("delivery_id");



CREATE INDEX "idx_fuel_attachments_request" ON "public"."fuel_attachments" USING "btree" ("fuel_request_id");



CREATE INDEX "idx_fuel_requests_assigned_to" ON "public"."fuel_requests" USING "btree" ("assigned_to_user_id") WHERE ("assigned_to_user_id" IS NOT NULL);



CREATE INDEX "idx_fuel_requests_created" ON "public"."fuel_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_fuel_requests_not_deleted" ON "public"."fuel_requests" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_fuel_requests_requester" ON "public"."fuel_requests" USING "btree" ("requester_user_id");



CREATE INDEX "idx_fuel_requests_status" ON "public"."fuel_requests" USING "btree" ("status");



CREATE INDEX "idx_fuel_requests_type" ON "public"."fuel_requests" USING "btree" ("type");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_profiles_active" ON "public"."profiles" USING "btree" ("active") WHERE ("active" = true);



CREATE INDEX "idx_public_tokens_hash" ON "public"."public_tokens" USING "btree" ("token_hash");



CREATE INDEX "idx_purchases_approval" ON "public"."purchases" USING "btree" ("approval_request_id");



CREATE INDEX "idx_purchases_created_at" ON "public"."purchases" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_purchases_requester" ON "public"."purchases" USING "btree" ("requester_user_id");



CREATE INDEX "idx_purchases_status" ON "public"."purchases" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_roles_key_unique" ON "public"."roles" USING "btree" ("key");



CREATE INDEX "idx_status_history_created" ON "public"."status_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_status_history_entity" ON "public"."status_history" USING "btree" ("module", "entity_type", "entity_id");



CREATE INDEX "idx_status_history_entity_created" ON "public"."status_history" USING "btree" ("entity_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "set_admission_requests_updated_at" BEFORE UPDATE ON "public"."admission_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_candidates_updated_at" BEFORE UPDATE ON "public"."candidates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_collaborators_updated_at" BEFORE UPDATE ON "public"."collaborators" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_epi_deliveries_updated_at" BEFORE UPDATE ON "public"."epi_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_epi_items_updated_at" BEFORE UPDATE ON "public"."epi_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_fuel_requests_updated_at" BEFORE UPDATE ON "public"."fuel_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_medical_exams_updated_at" BEFORE UPDATE ON "public"."medical_exams" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "track_admission_status" AFTER UPDATE ON "public"."admission_requests" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('admissions');



CREATE OR REPLACE TRIGGER "track_candidate_status" AFTER UPDATE ON "public"."candidates" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('admissions');



CREATE OR REPLACE TRIGGER "trg_approval_flows_updated" BEFORE UPDATE ON "public"."approval_flows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_last_master" BEFORE DELETE ON "public"."user_role_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_master_removal"();



CREATE OR REPLACE TRIGGER "trg_purchases_status_change" AFTER UPDATE ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('compras');



CREATE OR REPLACE TRIGGER "trg_purchases_updated_at" BEFORE UPDATE ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rebuild_perms_matrix" AFTER INSERT OR DELETE OR UPDATE ON "public"."role_permission_matrix" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_rebuild_permissions"();



CREATE OR REPLACE TRIGGER "trg_rebuild_perms_override" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_permission_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_rebuild_permissions"();



CREATE OR REPLACE TRIGGER "trg_rebuild_perms_ura" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_role_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_rebuild_permissions"();



CREATE OR REPLACE TRIGGER "trg_track_status_admission" AFTER UPDATE ON "public"."admission_requests" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('admissions');



CREATE OR REPLACE TRIGGER "trg_track_status_candidate" AFTER UPDATE ON "public"."candidates" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('admissions');



CREATE OR REPLACE TRIGGER "trg_track_status_exam" AFTER UPDATE ON "public"."medical_exams" FOR EACH ROW EXECUTE FUNCTION "public"."track_status_change"('admissions');



CREATE OR REPLACE TRIGGER "update_request_limits_updated_at" BEFORE UPDATE ON "public"."request_limits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vehicles_normalize_trg" BEFORE INSERT OR UPDATE ON "public"."vehicles" FOR EACH ROW EXECUTE FUNCTION "public"."vehicles_normalize"();



ALTER TABLE ONLY "public"."admission_files"
    ADD CONSTRAINT "admission_files_admission_request_id_fkey" FOREIGN KEY ("admission_request_id") REFERENCES "public"."admission_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_files"
    ADD CONSTRAINT "admission_files_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_interviews"
    ADD CONSTRAINT "admission_interviews_admission_request_id_fkey" FOREIGN KEY ("admission_request_id") REFERENCES "public"."admission_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_interviews"
    ADD CONSTRAINT "admission_interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_interviews"
    ADD CONSTRAINT "admission_interviews_conducted_by_fkey" FOREIGN KEY ("conducted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."admission_public_links"
    ADD CONSTRAINT "admission_public_links_admission_request_id_fkey" FOREIGN KEY ("admission_request_id") REFERENCES "public"."admission_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_public_links"
    ADD CONSTRAINT "admission_public_links_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admission_requests"
    ADD CONSTRAINT "admission_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_flow_steps"
    ADD CONSTRAINT "approval_flow_steps_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_flow_steps"
    ADD CONSTRAINT "approval_flow_steps_fixed_sector_id_fkey" FOREIGN KEY ("fixed_sector_id") REFERENCES "public"."sectors"("id");



ALTER TABLE ONLY "public"."approval_flow_steps"
    ADD CONSTRAINT "approval_flow_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "public"."approval_flows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_flows"
    ADD CONSTRAINT "approval_flows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_flows"
    ADD CONSTRAINT "approval_flows_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."approval_modules"("id");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_action_by_fkey" FOREIGN KEY ("action_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_request_steps"
    ADD CONSTRAINT "approval_request_steps_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_request_steps"
    ADD CONSTRAINT "approval_request_steps_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_request_steps"
    ADD CONSTRAINT "approval_request_steps_flow_step_id_fkey" FOREIGN KEY ("flow_step_id") REFERENCES "public"."approval_flow_steps"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_current_approver_user_id_fkey" FOREIGN KEY ("current_approver_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "public"."approval_flows"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."approval_modules"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."candidate_documents"
    ADD CONSTRAINT "candidate_documents_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidate_documents"
    ADD CONSTRAINT "candidate_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidates"
    ADD CONSTRAINT "candidates_admission_request_id_fkey" FOREIGN KEY ("admission_request_id") REFERENCES "public"."admission_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaborators"
    ADD CONSTRAINT "collaborators_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id");



ALTER TABLE ONLY "public"."document_reviews"
    ADD CONSTRAINT "document_reviews_candidate_document_id_fkey" FOREIGN KEY ("candidate_document_id") REFERENCES "public"."candidate_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_reviews"
    ADD CONSTRAINT "document_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dynamic_categories"
    ADD CONSTRAINT "dynamic_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."epi_deliveries"
    ADD CONSTRAINT "epi_deliveries_collaborator_id_fkey" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id");



ALTER TABLE ONLY "public"."epi_deliveries"
    ADD CONSTRAINT "epi_deliveries_delivered_by_user_id_fkey" FOREIGN KEY ("delivered_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."epi_deliveries"
    ADD CONSTRAINT "epi_deliveries_epi_item_id_fkey" FOREIGN KEY ("epi_item_id") REFERENCES "public"."epi_items"("id");



ALTER TABLE ONLY "public"."epi_deliveries"
    ADD CONSTRAINT "epi_deliveries_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id");



ALTER TABLE ONLY "public"."epi_kit_rules"
    ADD CONSTRAINT "epi_kit_rules_epi_item_id_fkey" FOREIGN KEY ("epi_item_id") REFERENCES "public"."epi_items"("id");



ALTER TABLE ONLY "public"."epi_kit_rules"
    ADD CONSTRAINT "epi_kit_rules_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id");



ALTER TABLE ONLY "public"."epi_movements"
    ADD CONSTRAINT "epi_movements_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "public"."epi_deliveries"("id");



ALTER TABLE ONLY "public"."epi_movements"
    ADD CONSTRAINT "epi_movements_moved_by_user_id_fkey" FOREIGN KEY ("moved_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."fuel_attachments"
    ADD CONSTRAINT "fuel_attachments_fuel_request_id_fkey" FOREIGN KEY ("fuel_request_id") REFERENCES "public"."fuel_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fuel_requests"
    ADD CONSTRAINT "fuel_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fuel_requests"
    ADD CONSTRAINT "fuel_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."fuel_reviews"
    ADD CONSTRAINT "fuel_reviews_fuel_request_id_fkey" FOREIGN KEY ("fuel_request_id") REFERENCES "public"."fuel_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fuel_reviews"
    ADD CONSTRAINT "fuel_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."medical_exams"
    ADD CONSTRAINT "medical_exams_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medical_exams"
    ADD CONSTRAINT "medical_exams_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id");



ALTER TABLE ONLY "public"."public_tokens"
    ADD CONSTRAINT "public_tokens_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."role_permission_matrix"
    ADD CONSTRAINT "role_permission_matrix_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."permission_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_matrix"
    ADD CONSTRAINT "role_permission_matrix_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."permission_modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_matrix"
    ADD CONSTRAINT "role_permission_matrix_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."sectors"
    ADD CONSTRAINT "sectors_substitute_user_id_fkey" FOREIGN KEY ("substitute_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."status_history"
    ADD CONSTRAINT "status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_registrations"
    ADD CONSTRAINT "system_registrations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_effective_permissions"
    ADD CONSTRAINT "user_effective_permissions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."permission_actions"("id");



ALTER TABLE ONLY "public"."user_effective_permissions"
    ADD CONSTRAINT "user_effective_permissions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."permission_modules"("id");



ALTER TABLE ONLY "public"."user_effective_permissions"
    ADD CONSTRAINT "user_effective_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."permission_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."permission_modules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permission_overrides"
    ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins RH manage collaborators" ON "public"."collaborators" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins RH manage epi_deliveries" ON "public"."epi_deliveries" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins RH manage epi_items" ON "public"."epi_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins RH manage epi_kit_rules" ON "public"."epi_kit_rules" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins RH manage epi_movements" ON "public"."epi_movements" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH can manage candidates" ON "public"."candidates" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH can view all admissions" ON "public"."admission_requests" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage admission_files" ON "public"."admission_files" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage admission_interviews" ON "public"."admission_interviews" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage admission_public_links" ON "public"."admission_public_links" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage candidate_documents" ON "public"."candidate_documents" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage clinics" ON "public"."clinics" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage document_reviews" ON "public"."document_reviews" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage medical_exams" ON "public"."medical_exams" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage system_registrations" ON "public"."system_registrations" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins and RH manage tokens" ON "public"."public_tokens" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins can manage fuel reviews" ON "public"."fuel_reviews" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can update any profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can update fuel requests" ON "public"."fuel_requests" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can view all attachments" ON "public"."fuel_attachments" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can view all fuel requests" ON "public"."fuel_requests" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can view all status history" ON "public"."status_history" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins can view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Admins manage documents" ON "public"."documents" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Admins manage request_limits" ON "public"."request_limits" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "Anyone authenticated can view categories" ON "public"."dynamic_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view clinics" ON "public"."clinics" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view documents" ON "public"."documents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view request_limits" ON "public"."request_limits" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view role_permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone authenticated can view sectors" ON "public"."sectors" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view approval_flows" ON "public"."approval_flows" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view approval_modules" ON "public"."approval_modules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view permission_actions" ON "public"."permission_actions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view permission_modules" ON "public"."permission_modules" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view rpm" ON "public"."role_permission_matrix" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated can insert fuel requests" ON "public"."fuel_requests" FOR INSERT TO "authenticated" WITH CHECK (("requester_user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated can insert own notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Authenticated view approval flow steps" ON "public"."approval_flow_steps" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Diretoria can manage roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages afs" ON "public"."approval_flow_steps" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages approval_flows" ON "public"."approval_flows" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages approval_modules" ON "public"."approval_modules" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages categories" ON "public"."dynamic_categories" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages overrides" ON "public"."user_permission_overrides" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages permission_actions" ON "public"."permission_actions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages permission_modules" ON "public"."permission_modules" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages rpm" ON "public"."role_permission_matrix" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages sectors" ON "public"."sectors" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Diretoria manages ura" ON "public"."user_role_assignments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Only diretoria can manage permissions" ON "public"."permissions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Only diretoria can manage role_permissions" ON "public"."role_permissions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Only diretoria can manage roles" ON "public"."roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Participants can view approval_requests" ON "public"."approval_requests" FOR SELECT TO "authenticated" USING ("public"."user_participates_in_approval"("id", "auth"."uid"()));



CREATE POLICY "Public can view documents" ON "public"."documents" FOR SELECT TO "anon" USING (true);



CREATE POLICY "RH and admins can insert admissions" ON "public"."admission_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "RH and admins can update admissions" ON "public"."admission_requests" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "RH can view admission status history" ON "public"."status_history" FOR SELECT USING ((("module" = 'admissions'::"text") AND "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "Requester can insert own admission" ON "public"."admission_requests" FOR INSERT WITH CHECK (("requester_user_id" = "auth"."uid"()));



CREATE POLICY "Requester can manage own attachments" ON "public"."fuel_attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fuel_requests" "fr"
  WHERE (("fr"."id" = "fuel_attachments"."fuel_request_id") AND ("fr"."requester_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."fuel_requests" "fr"
  WHERE (("fr"."id" = "fuel_attachments"."fuel_request_id") AND ("fr"."requester_user_id" = "auth"."uid"())))));



CREATE POLICY "Requester can update own draft fuel requests" ON "public"."fuel_requests" FOR UPDATE TO "authenticated" USING ((("requester_user_id" = "auth"."uid"()) AND ("status" = 'rascunho'::"public"."fuel_status"))) WITH CHECK (("requester_user_id" = "auth"."uid"()));



CREATE POLICY "Requester can view own admissions" ON "public"."admission_requests" FOR SELECT TO "authenticated" USING (("requester_user_id" = "auth"."uid"()));



CREATE POLICY "Requester can view own fuel requests" ON "public"."fuel_requests" FOR SELECT TO "authenticated" USING (("requester_user_id" = "auth"."uid"()));



CREATE POLICY "Requester can view own request steps" ON "public"."approval_request_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."approval_requests" "ar"
  WHERE (("ar"."id" = "approval_request_steps"."approval_request_id") AND ("ar"."requester_user_id" = "auth"."uid"())))));



CREATE POLICY "Requester can view reviews of own requests" ON "public"."fuel_reviews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fuel_requests" "fr"
  WHERE (("fr"."id" = "fuel_reviews"."fuel_request_id") AND ("fr"."requester_user_id" = "auth"."uid"())))));



CREATE POLICY "Step approvers can view sibling steps" ON "public"."approval_request_steps" FOR SELECT TO "authenticated" USING ("public"."user_participates_in_approval"("approval_request_id", "auth"."uid"()));



CREATE POLICY "System can insert status_history" ON "public"."status_history" FOR INSERT TO "authenticated" WITH CHECK (("changed_by" = "auth"."uid"()));



CREATE POLICY "System inserts ah" ON "public"."approval_history" FOR INSERT TO "authenticated" WITH CHECK ((("action_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "System manages approval_requests" ON "public"."approval_requests" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "System manages ars" ON "public"."approval_request_steps" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "System manages effective perms" ON "public"."user_effective_permissions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own audit logs" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")));



CREATE POLICY "Users can view own status changes" ON "public"."status_history" FOR SELECT TO "authenticated" USING (("changed_by" = "auth"."uid"()));



CREATE POLICY "Users can view profiles (self or staff)" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'master'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'supervisor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'compras'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'financeiro'::"public"."app_role")));



CREATE POLICY "View own effective perms" ON "public"."user_effective_permissions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")));



CREATE POLICY "View own overrides" ON "public"."user_permission_overrides" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role")));



CREATE POLICY "View own role assignments or admin" ON "public"."user_role_assignments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'master'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'rh'::"public"."app_role")));



CREATE POLICY "View relevant ah" ON "public"."approval_history" FOR SELECT TO "authenticated" USING ((("action_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "View relevant approval_requests" ON "public"."approval_requests" FOR SELECT TO "authenticated" USING ((("requester_user_id" = "auth"."uid"()) OR ("current_approver_user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



CREATE POLICY "View relevant ars" ON "public"."approval_request_steps" FOR SELECT TO "authenticated" USING ((("approver_user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role")));



ALTER TABLE "public"."admission_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_interviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_public_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admission_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_flow_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_flows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_request_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidate_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dynamic_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."epi_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."epi_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."epi_kit_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."epi_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fuel_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fuel_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fuel_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medical_exams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchases_insert_self" ON "public"."purchases" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "requester_user_id") AND ("status" = 'rascunho'::"text") AND ("approval_request_id" IS NULL)));



CREATE POLICY "purchases_select_approver" ON "public"."purchases" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."approval_request_steps" "ars"
     JOIN "public"."approval_requests" "ar" ON (("ar"."id" = "ars"."approval_request_id")))
  WHERE (("ar"."reference_id" = "purchases"."id") AND ("ars"."approver_user_id" = "auth"."uid"()))))));



CREATE POLICY "purchases_select_own" ON "public"."purchases" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "requester_user_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "purchases_select_privileged" ON "public"."purchases" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'financeiro'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'compras'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'supervisor'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'master'::"public"."app_role"))));



CREATE POLICY "purchases_update_own_draft" ON "public"."purchases" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "requester_user_id") AND ("status" = ANY (ARRAY['rascunho'::"text", 'retornado'::"text"])))) WITH CHECK (("auth"."uid"() = "requester_user_id"));



CREATE POLICY "purchases_update_privileged" ON "public"."purchases" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'administrativo'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'compras'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'financeiro'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'master'::"public"."app_role")));



ALTER TABLE "public"."request_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permission_matrix" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_effective_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_permission_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_role_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicles_delete_admin" ON "public"."vehicles" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."is_master" = true))))));



CREATE POLICY "vehicles_insert_admin" ON "public"."vehicles" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."is_master" = true))))));



CREATE POLICY "vehicles_select_authenticated" ON "public"."vehicles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "vehicles_update_admin" ON "public"."vehicles" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."is_master" = true)))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'diretoria'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."user_role_assignments" "ura"
     JOIN "public"."roles" "r" ON (("r"."id" = "ura"."role_id")))
  WHERE (("ura"."user_id" = "auth"."uid"()) AND ("r"."is_master" = true))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_purge_test_data"("_scope" "text", "_confirm" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admission_set_status"("_request_id" "uuid", "_to_status" "public"."admission_status", "_reason" "text", "_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admission_set_status"("_request_id" "uuid", "_to_status" "public"."admission_status", "_reason" "text", "_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_purchase_request"("p_request_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_purchase_request"("p_request_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_purchase_request"("p_request_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_has_role"("_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_has_role"("_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_has_permission"("p_module_code" "text", "p_action_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_has_permission"("p_module_code" "text", "p_action_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fuel_set_status"("_request_id" "uuid", "_to_status" "public"."fuel_status", "_reason" "text", "_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuel_set_status"("_request_id" "uuid", "_to_status" "public"."fuel_status", "_reason" "text", "_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_roles"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_roles"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_module_code" "text", "p_action_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_module_code" "text", "p_action_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_last_master_removal"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_last_master_removal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_last_master_removal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_approval_action"("p_approval_request_id" "uuid", "p_action" "text", "p_comments" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_approval_action"("p_approval_request_id" "uuid", "p_action" "text", "p_comments" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rebuild_user_permissions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_approval_flow_steps"("p_flow_id" "uuid", "p_steps" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_approval_flow_steps"("p_flow_id" "uuid", "p_steps" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."soft_delete_request"("_request_id" "uuid", "_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_request"("_request_id" "uuid", "_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_approval_flow"("p_module_code" "text", "p_reference_id" "uuid", "p_requester_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_approval_flow"("p_module_code" "text", "p_reference_id" "uuid", "p_requester_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_purchase_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_purchase_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_purchase_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."track_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_rebuild_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_rebuild_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_rebuild_permissions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_participates_in_approval"("p_approval_request_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_participates_in_approval"("p_approval_request_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."vehicles_normalize"() TO "anon";
GRANT ALL ON FUNCTION "public"."vehicles_normalize"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicles_normalize"() TO "service_role";



GRANT ALL ON TABLE "public"."admission_files" TO "anon";
GRANT ALL ON TABLE "public"."admission_files" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_files" TO "service_role";



GRANT ALL ON TABLE "public"."admission_interviews" TO "anon";
GRANT ALL ON TABLE "public"."admission_interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_interviews" TO "service_role";



GRANT ALL ON TABLE "public"."admission_public_links" TO "anon";
GRANT ALL ON TABLE "public"."admission_public_links" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_public_links" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admission_requests" TO "anon";
GRANT ALL ON TABLE "public"."admission_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_requests" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_flow_steps" TO "anon";
GRANT ALL ON TABLE "public"."approval_flow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_flow_steps" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_flows" TO "anon";
GRANT ALL ON TABLE "public"."approval_flows" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_flows" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_history" TO "anon";
GRANT ALL ON TABLE "public"."approval_history" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_history" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_modules" TO "anon";
GRANT ALL ON TABLE "public"."approval_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_modules" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_request_steps" TO "anon";
GRANT ALL ON TABLE "public"."approval_request_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_request_steps" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."candidate_documents" TO "anon";
GRANT ALL ON TABLE "public"."candidate_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."candidate_documents" TO "service_role";



GRANT ALL ON TABLE "public"."candidates" TO "anon";
GRANT ALL ON TABLE "public"."candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."candidates" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."collaborators" TO "anon";
GRANT ALL ON TABLE "public"."collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."document_reviews" TO "anon";
GRANT ALL ON TABLE "public"."document_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."document_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."dynamic_categories" TO "anon";
GRANT ALL ON TABLE "public"."dynamic_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."dynamic_categories" TO "service_role";



GRANT ALL ON TABLE "public"."epi_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."epi_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."epi_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."epi_items" TO "anon";
GRANT ALL ON TABLE "public"."epi_items" TO "authenticated";
GRANT ALL ON TABLE "public"."epi_items" TO "service_role";



GRANT ALL ON TABLE "public"."epi_kit_rules" TO "anon";
GRANT ALL ON TABLE "public"."epi_kit_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."epi_kit_rules" TO "service_role";



GRANT ALL ON TABLE "public"."epi_movements" TO "anon";
GRANT ALL ON TABLE "public"."epi_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."epi_movements" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_attachments" TO "anon";
GRANT ALL ON TABLE "public"."fuel_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_attachments" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."fuel_requests" TO "anon";
GRANT ALL ON TABLE "public"."fuel_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_requests" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_reviews" TO "anon";
GRANT ALL ON TABLE "public"."fuel_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."medical_exams" TO "anon";
GRANT ALL ON TABLE "public"."medical_exams" TO "authenticated";
GRANT ALL ON TABLE "public"."medical_exams" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."permission_actions" TO "anon";
GRANT ALL ON TABLE "public"."permission_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_actions" TO "service_role";



GRANT ALL ON TABLE "public"."permission_modules" TO "anon";
GRANT ALL ON TABLE "public"."permission_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_modules" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."public_tokens" TO "anon";
GRANT ALL ON TABLE "public"."public_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."public_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."request_limits" TO "anon";
GRANT ALL ON TABLE "public"."request_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."request_limits" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."role_permission_matrix" TO "anon";
GRANT ALL ON TABLE "public"."role_permission_matrix" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permission_matrix" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sectors" TO "anon";
GRANT ALL ON TABLE "public"."sectors" TO "authenticated";
GRANT ALL ON TABLE "public"."sectors" TO "service_role";



GRANT ALL ON TABLE "public"."status_history" TO "anon";
GRANT ALL ON TABLE "public"."status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."status_history" TO "service_role";



GRANT ALL ON TABLE "public"."system_registrations" TO "anon";
GRANT ALL ON TABLE "public"."system_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."system_registrations" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_effective_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_effective_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_effective_permissions" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_permission_overrides" TO "anon";
GRANT ALL ON TABLE "public"."user_permission_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permission_overrides" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_role_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



GRANT ALL ON TABLE "public"."vw_admission_metrics" TO "anon";
GRANT ALL ON TABLE "public"."vw_admission_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_admission_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."vw_admissions_list_items" TO "anon";
GRANT ALL ON TABLE "public"."vw_admissions_list_items" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_admissions_list_items" TO "service_role";



GRANT ALL ON TABLE "public"."vw_fuel_metrics" TO "anon";
GRANT ALL ON TABLE "public"."vw_fuel_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_fuel_metrics" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







