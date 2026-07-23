
-- 1. Add clinic_name to medical_exams for free-text entry
ALTER TABLE public.medical_exams ADD COLUMN IF NOT EXISTS clinic_name text;

-- 2. Recreate track_status_change with safe jsonb access (idempotent)
CREATE OR REPLACE FUNCTION public.track_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- 3. Ensure triggers are properly attached (drop first to be idempotent)
DROP TRIGGER IF EXISTS trg_track_status_admission ON public.admission_requests;
CREATE TRIGGER trg_track_status_admission
  AFTER UPDATE ON public.admission_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.track_status_change('admissions');

DROP TRIGGER IF EXISTS trg_track_status_candidate ON public.candidates;
CREATE TRIGGER trg_track_status_candidate
  AFTER UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.track_status_change('admissions');

DROP TRIGGER IF EXISTS trg_track_status_fuel ON public.fuel_requests;
CREATE TRIGGER trg_track_status_fuel
  AFTER UPDATE ON public.fuel_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.track_status_change('fleet');

DROP TRIGGER IF EXISTS trg_track_status_exam ON public.medical_exams;
CREATE TRIGGER trg_track_status_exam
  AFTER UPDATE ON public.medical_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.track_status_change('admissions');

-- 4. Update admission_set_status: add aguardando_registro → concluido shortcut
CREATE OR REPLACE FUNCTION public.admission_set_status(_request_id uuid, _to_status admission_status, _reason text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    "aguardando_exame": ["exame_realizado", "cancelado", "arquivado"],
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

-- 5. Update generate_candidate_token to allow administrativo role
CREATE OR REPLACE FUNCTION public.generate_candidate_token(_candidate_id uuid, _days_valid integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _hash text;
BEGIN
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'rh') OR has_role(_uid, 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Sem permissão');
  END IF;

  _token := encode(gen_random_bytes(32), 'hex');
  _hash := encode(digest(_token, 'sha256'), 'hex');

  UPDATE public.public_tokens SET used_at = now()
  WHERE candidate_id = _candidate_id AND used_at IS NULL;

  INSERT INTO public.public_tokens (candidate_id, token_hash, expires_at)
  VALUES (_candidate_id, _hash, now() + (_days_valid || ' days')::interval);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'generate_token', 'candidates', _candidate_id::text,
    jsonb_build_object('expires_days', _days_valid));

  RETURN jsonb_build_object('success', true, 'token', _token, 'expires_in_days', _days_valid);
END;
$$;
