-- 1. Mark orphaned approval_requests as cancelled
UPDATE approval_requests
SET status = 'cancelled',
    ended_at = COALESCE(ended_at, now())
WHERE reference_id NOT IN (SELECT id FROM fuel_requests)
  AND module_id IN (SELECT id FROM approval_modules WHERE code IN ('abastecimento', 'reembolso', 'diaria'));

-- 2. Update admin_purge_test_data to also clean approval data
CREATE OR REPLACE FUNCTION public.admin_purge_test_data(_scope text, _confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb := '{}'::jsonb;
  _fuel_ids uuid[];
  _admission_ids uuid[];
  _candidate_ids uuid[];
  _approval_ids uuid[];
  _counts jsonb := '{}'::jsonb;
BEGIN
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Apenas Diretoria ou Administrativo podem executar limpeza de dados');
  END IF;

  IF _scope NOT IN ('SOLICITACOES', 'ADMISSOES', 'ALL_TEST') THEN
    RETURN jsonb_build_object('error', 'Escopo inválido. Use: SOLICITACOES, ADMISSOES ou ALL_TEST');
  END IF;

  IF _scope IN ('SOLICITACOES', 'ALL_TEST') THEN
    SELECT array_agg(id) INTO _fuel_ids FROM fuel_requests;
    IF _fuel_ids IS NULL THEN _fuel_ids := '{}'; END IF;

    -- Find approval_requests linked to these fuel_requests
    SELECT array_agg(id) INTO _approval_ids
    FROM approval_requests
    WHERE reference_id = ANY(_fuel_ids);
    IF _approval_ids IS NULL THEN _approval_ids := '{}'; END IF;

    _counts := _counts || jsonb_build_object(
      'fuel_attachments', (SELECT count(*) FROM fuel_attachments WHERE fuel_request_id = ANY(_fuel_ids)),
      'fuel_reviews', (SELECT count(*) FROM fuel_reviews WHERE fuel_request_id = ANY(_fuel_ids)),
      'approval_history', (SELECT count(*) FROM approval_history WHERE approval_request_id = ANY(_approval_ids)),
      'approval_request_steps', (SELECT count(*) FROM approval_request_steps WHERE approval_request_id = ANY(_approval_ids)),
      'approval_requests', coalesce(array_length(_approval_ids, 1), 0),
      'status_history_fleet', (SELECT count(*) FROM status_history WHERE module = 'fleet'),
      'notifications_fleet', (SELECT count(*) FROM notifications WHERE metadata->>'entity_type' IN ('fuel_requests', 'approval_request')),
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
    -- Also clean orphaned approval_requests (reference_id points to nothing)
    DELETE FROM approval_history WHERE approval_request_id IN (
      SELECT ar.id FROM approval_requests ar
      LEFT JOIN fuel_requests fr ON fr.id = ar.reference_id
      LEFT JOIN admission_requests admr ON admr.id = ar.reference_id
      WHERE fr.id IS NULL AND admr.id IS NULL
    );
    DELETE FROM approval_request_steps WHERE approval_request_id IN (
      SELECT ar.id FROM approval_requests ar
      LEFT JOIN fuel_requests fr ON fr.id = ar.reference_id
      LEFT JOIN admission_requests admr ON admr.id = ar.reference_id
      WHERE fr.id IS NULL AND admr.id IS NULL
    );
    DELETE FROM approval_requests WHERE id IN (
      SELECT ar.id FROM approval_requests ar
      LEFT JOIN fuel_requests fr ON fr.id = ar.reference_id
      LEFT JOIN admission_requests admr ON admr.id = ar.reference_id
      WHERE fr.id IS NULL AND admr.id IS NULL
    );

    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_uid, 'purge_test_data', 'system', _scope, jsonb_build_object('scope', _scope, 'counts', _counts, 'confirmed', true));
  END IF;

  RETURN jsonb_build_object(
    'preview', NOT _confirm,
    'scope', _scope,
    'counts', _counts
  );
END;
$function$;