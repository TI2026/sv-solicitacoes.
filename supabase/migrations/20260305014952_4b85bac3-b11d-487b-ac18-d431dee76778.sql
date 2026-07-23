
-- RPC: admin_purge_test_data with preview/confirm modes
CREATE OR REPLACE FUNCTION public.admin_purge_test_data(
  _scope text,
  _confirm boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb := '{}'::jsonb;
  _fuel_ids uuid[];
  _admission_ids uuid[];
  _candidate_ids uuid[];
  _counts jsonb := '{}'::jsonb;
BEGIN
  -- Only diretoria can purge
  IF NOT has_role(_uid, 'diretoria') THEN
    RETURN jsonb_build_object('error', 'Apenas Diretoria pode executar limpeza de dados');
  END IF;

  IF _scope NOT IN ('SOLICITACOES', 'ADMISSOES', 'ALL_TEST') THEN
    RETURN jsonb_build_object('error', 'Escopo inválido. Use: SOLICITACOES, ADMISSOES ou ALL_TEST');
  END IF;

  -- ===== SOLICITAÇÕES =====
  IF _scope IN ('SOLICITACOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _fuel_ids FROM fuel_requests;
    IF _fuel_ids IS NULL THEN _fuel_ids := '{}'; END IF;

    _counts := _counts || jsonb_build_object(
      'fuel_attachments', (SELECT count(*) FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids)),
      'fuel_reviews', (SELECT count(*) FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids)),
      'status_history_fleet', (SELECT count(*) FROM status_history WHERE module = 'fleet'),
      'notifications_fleet', (SELECT count(*) FROM notifications WHERE metadata->>'entity_type' = 'fuel_requests'),
      'fuel_requests', coalesce(array_length(_fuel_ids, 1), 0)
    );

    IF _confirm THEN
      DELETE FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids);
      DELETE FROM status_history WHERE module = 'fleet';
      DELETE FROM notifications WHERE metadata->>'entity_type' = 'fuel_requests';
      DELETE FROM fuel_requests WHERE id = ANY(_fuel_ids);
    END IF;
  END IF;

  -- ===== ADMISSÕES =====
  IF _scope IN ('ADMISSOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _admission_ids FROM admission_requests;
    IF _admission_ids IS NULL THEN _admission_ids := '{}'; END IF;

    SELECT array_agg(id) INTO _candidate_ids FROM candidates WHERE admission_request_id = ANY(_admission_ids);
    IF _candidate_ids IS NULL THEN _candidate_ids := '{}'; END IF;

    _counts := _counts || jsonb_build_object(
      'document_reviews', (SELECT count(*) FROM document_reviews WHERE candidate_document_id IN (SELECT id FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids))),
      'candidate_documents', (SELECT count(*) FROM candidate_documents WHERE candidate_id = ANY(_candidate_ids)),
      'medical_exams', (SELECT count(*) FROM medical_exams WHERE candidate_id = ANY(_candidate_ids)),
      'system_registrations', (SELECT count(*) FROM system_registrations WHERE candidate_id = ANY(_candidate_ids)),
      'public_tokens', (SELECT count(*) FROM public_tokens WHERE candidate_id = ANY(_candidate_ids)),
      'admission_files', (SELECT count(*) FROM admission_files WHERE admission_request_id = ANY(_admission_ids)),
      'admission_public_links', (SELECT count(*) FROM admission_public_links WHERE admission_request_id = ANY(_admission_ids)),
      'candidates', coalesce(array_length(_candidate_ids, 1), 0),
      'status_history_admissions', (SELECT count(*) FROM status_history WHERE module = 'admissions'),
      'notifications_admissions', (SELECT count(*) FROM notifications WHERE metadata->>'entity_type' = 'admission_requests'),
      'admission_requests', coalesce(array_length(_admission_ids, 1), 0)
    );

    IF _confirm THEN
      -- Delete in correct dependency order
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

  -- Audit log
  IF _confirm THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'purge_test_data', 'system', _scope, jsonb_build_object('scope', _scope, 'counts', _counts, 'confirmed', true));
  END IF;

  RETURN jsonb_build_object(
    'preview', NOT _confirm,
    'scope', _scope,
    'counts', _counts
  );
END;
$$;
