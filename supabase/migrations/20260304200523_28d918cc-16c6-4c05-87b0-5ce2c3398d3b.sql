
CREATE OR REPLACE FUNCTION public.admission_set_status(_request_id uuid, _to_status admission_status, _reason text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
