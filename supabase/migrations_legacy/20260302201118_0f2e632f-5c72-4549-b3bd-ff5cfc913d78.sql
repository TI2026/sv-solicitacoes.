
-- =============================================
-- STAGE 2+6: Helper functions, Storage, RPCs
-- =============================================

-- Helper: current_user_id()
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT auth.uid() $$;

-- Helper: current_has_role(role_key)
CREATE OR REPLACE FUNCTION public.current_has_role(_role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT public.has_role(auth.uid(), _role) $$;

-- =============================================
-- STORAGE BUCKETS (private)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('admissions', 'admissions', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('fleet', 'fleet', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admissions bucket
CREATE POLICY "Admins and RH can read admissions files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admissions' AND (
    public.current_has_role('diretoria') OR
    public.current_has_role('administrativo') OR
    public.current_has_role('rh')
  ));

CREATE POLICY "Admins and RH can upload admissions files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'admissions' AND (
    public.current_has_role('diretoria') OR
    public.current_has_role('administrativo') OR
    public.current_has_role('rh')
  ));

-- Storage RLS: fleet bucket
CREATE POLICY "Users can read own fleet files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fleet' AND (
    public.current_has_role('diretoria') OR
    public.current_has_role('administrativo') OR
    (storage.foldername(name))[2] IN (
      SELECT fr.id::text FROM public.fuel_requests fr WHERE fr.requester_user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can upload own fleet files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fleet' AND (
    public.current_has_role('diretoria') OR
    public.current_has_role('administrativo') OR
    (storage.foldername(name))[2] IN (
      SELECT fr.id::text FROM public.fuel_requests fr WHERE fr.requester_user_id = auth.uid()
    )
  ));

-- =============================================
-- RPC: fuel_set_status (transactional, validated)
-- =============================================
CREATE OR REPLACE FUNCTION public.fuel_set_status(
  _request_id uuid,
  _to_status fuel_status,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed_transitions jsonb := '{
    "rascunho": ["enviado"],
    "enviado": ["em_aprovacao"],
    "em_aprovacao": ["aprovado", "retornado", "reprovado"],
    "retornado": ["enviado"],
    "aprovado": ["aguardando_fotos"],
    "aguardando_fotos": ["em_revisao_admin"],
    "em_revisao_admin": ["encerrado", "retornado"],
    "reprovado": ["encerrado"]
  }'::jsonb;
  _valid_targets jsonb;
BEGIN
  -- Lock the row
  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  -- Check valid transition
  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  -- Permission checks
  IF _to_status IN ('enviado') THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode enviar');
    END IF;
  ELSIF _to_status IN ('em_aprovacao') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  ELSIF _to_status IN ('aprovado', 'retornado', 'reprovado') AND _req.status = 'em_aprovacao' THEN
    IF NOT has_role(_uid, 'diretoria') THEN
      RETURN jsonb_build_object('error', 'Apenas diretoria pode aprovar/reprovar');
    END IF;
  ELSIF _to_status = 'aguardando_fotos' THEN
    -- auto transition after approval
    NULL;
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status = 'encerrado' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para encerrar');
    END IF;
  END IF;

  -- Update status
  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  -- Write status_history
  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('fleet', 'fuel_requests', _request_id, _req.status::text, _to_status::text, _uid);

  -- Write audit_log
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'fuel_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason) || _metadata);

  -- Write review if decision
  IF _to_status IN ('aprovado', 'retornado', 'reprovado', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid,
      CASE
        WHEN _to_status = 'aprovado' THEN 'approved'::review_decision
        WHEN _to_status IN ('retornado') THEN 'needs_revision'::review_decision
        WHEN _to_status IN ('reprovado', 'encerrado') THEN 'rejected'::review_decision
        ELSE 'approved'::review_decision
      END,
      _reason);
  END IF;

  -- Create notification for requester
  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      'Solicitação atualizada',
      format('Sua solicitação foi movida para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'fuel_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;

-- =============================================
-- RPC: admission_set_status (transactional, validated)
-- =============================================
CREATE OR REPLACE FUNCTION public.admission_set_status(
  _request_id uuid,
  _to_status admission_status,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed_transitions jsonb := '{
    "rascunho": ["aguardando_triagem"],
    "aguardando_triagem": ["em_triagem"],
    "em_triagem": ["aguardando_documentos", "cancelado"],
    "aguardando_documentos": ["documentos_em_analise"],
    "documentos_em_analise": ["aguardando_documentos", "aguardando_exame", "cancelado"],
    "aguardando_exame": ["exame_realizado"],
    "exame_realizado": ["aguardando_registro", "cancelado"],
    "aguardando_registro": ["registros_concluidos"],
    "registros_concluidos": ["concluido"],
    "concluido": [],
    "cancelado": []
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

  -- Permission: only RH/Admin/Diretoria can manage admission status
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'rh')) THEN
    -- Exception: requester can submit (rascunho -> aguardando_triagem)
    IF NOT (_req.requester_user_id = _uid AND _req.status = 'rascunho' AND _to_status = 'aguardando_triagem') THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.admission_requests SET status = _to_status WHERE id = _request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('admissions', 'admission_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'admission_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason) || _metadata);

  -- Notify requester
  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      'Admissão atualizada',
      format('Processo de admissão movido para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'admission_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  -- Notify all RH users for relevant transitions
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

-- =============================================
-- RPC: generate_public_token (for candidate doc submission)
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_candidate_token(
  _candidate_id uuid,
  _days_valid int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _token text;
  _hash text;
BEGIN
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'rh')) THEN
    RETURN jsonb_build_object('error', 'Sem permissão');
  END IF;

  -- Generate a random token
  _token := encode(gen_random_bytes(32), 'hex');
  _hash := encode(digest(_token, 'sha256'), 'hex');

  -- Invalidate previous tokens
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

-- Need pgcrypto for digest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- Allow status_history INSERT for service role / triggers
-- =============================================
CREATE POLICY "System can insert status_history"
  ON public.status_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- Allow audit_logs INSERT broadly (RPC runs as SECURITY DEFINER)
-- Already have "Users can insert own audit logs" policy

-- =============================================
-- Additional RLS: Collaborator sees own fuel reviews
-- =============================================
-- (already exists from Stage 1 migration)

-- Grant execute on RPCs
GRANT EXECUTE ON FUNCTION public.fuel_set_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.admission_set_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_candidate_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_id TO authenticated;
