-- Migration para Phase 6: Desligamento (Desvínculos, inativação, EPI)

CREATE OR REPLACE FUNCTION public.termination_set_status(
  _request_id uuid,
  _to_status public.termination_status,
  _reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed_transitions jsonb := '{
    "rascunho":              ["em_aprovacao", "cancelado"],
    "em_aprovacao":          ["aprovado", "reprovado", "retornado", "cancelado"],
    "retornado":             ["em_aprovacao", "cancelado"],
    "aprovado":              ["desligamento_concluido", "cancelado"],
    "reprovado":             ["cancelado"],
    "desligamento_concluido":["cancelado"],
    "cancelado":             []
  }'::jsonb;
  _valid_targets jsonb;
  _collab RECORD;
BEGIN
  SELECT * INTO _req FROM public.termination_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  -- Verificação de permissão
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'rh')) THEN
    IF NOT (_req.requester_user_id = _uid AND _req.status = 'rascunho' AND _to_status = 'em_aprovacao') THEN
      RETURN jsonb_build_object('error', 'Sem permissão para esta operação');
    END IF;
  END IF;

  UPDATE public.termination_requests SET status = _to_status WHERE id = _request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('desligamentos', 'termination_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'termination_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason));

  -- Desvínculos (Sprint 15 Phase 6)
  IF _to_status = 'desligamento_concluido' THEN
    SELECT * INTO _collab FROM public.collaborators WHERE id = _req.collaborator_id;
    IF FOUND THEN
      -- Inativa colaborador e perfil
      UPDATE public.collaborators SET active = false WHERE id = _collab.id;
      IF _collab.user_id IS NOT NULL THEN
        UPDATE public.profiles SET active = false WHERE id = _collab.user_id;
        
        -- Limpa setor (responsável / substituto)
        UPDATE public.sectors SET manager_user_id = NULL WHERE manager_user_id = _collab.user_id;
        UPDATE public.sectors SET substitute_user_id = NULL WHERE substitute_user_id = _collab.user_id;
        
        -- Remove roles
        DELETE FROM public.user_role_assignments WHERE user_id = _collab.user_id;
      END IF;
    END IF;
  END IF;

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      CASE _to_status::text
        WHEN 'cancelado' THEN 'Desligamento cancelado'
        ELSE 'Desligamento atualizado'
      END,
      format('Processo de desligamento movido para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'termination_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;
