-- ============================================================
-- SPRINT 15: Migration 005 - Termination Contract Fix
-- Corrige termination_set_status para usar o campo real
-- collaborators.user_profile_id (e NÃO user_id, que não existe).
-- Auditados: _collab.*, _req.*, todos os campos de RECORD.
-- ============================================================

CREATE OR REPLACE FUNCTION public.termination_set_status(
  _request_id uuid,
  _to_status public.termination_status,
  _reason text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  _req     RECORD;   -- campos: id, collaborator_id, requester_user_id, status, tipo_desligamento, ...
  _collab  RECORD;   -- campos: id, full_name, user_profile_id, sector_id, active, status, ...
  _uid     uuid := auth.uid();
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
  _profile_id    uuid;
BEGIN
  -- -------------------------------------------------------
  -- 1. Busca e bloqueia o registro
  -- -------------------------------------------------------
  SELECT * INTO _req
  FROM public.termination_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  -- -------------------------------------------------------
  -- 2. Valida transição
  -- -------------------------------------------------------
  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT (_valid_targets ? _to_status::text) THEN
    RETURN jsonb_build_object(
      'error',
      format('Transição de %s para %s não permitida', _req.status, _to_status)
    );
  END IF;

  -- -------------------------------------------------------
  -- 3. Bloqueia cancelamento de desligamento concluído
  -- -------------------------------------------------------
  IF _req.status::text = 'desligamento_concluido' AND _to_status::text = 'cancelado' THEN
    RETURN jsonb_build_object('error', 'Não é possível cancelar um desligamento já concluído');
  END IF;

  -- -------------------------------------------------------
  -- 4. Verifica permissão
  -- -------------------------------------------------------
  IF NOT (
    has_role(_uid, 'diretoria') OR
    has_role(_uid, 'administrativo') OR
    has_role(_uid, 'rh')
  ) THEN
    IF NOT (
      _req.requester_user_id = _uid
      AND _req.status::text = 'rascunho'
      AND _to_status::text = 'em_aprovacao'
    ) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para esta operação');
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- 5. Atualiza status
  -- -------------------------------------------------------
  UPDATE public.termination_requests
  SET status = _to_status, updated_at = now()
  WHERE id = _request_id;

  -- -------------------------------------------------------
  -- 6. Histórico (sem duplicação: verifica se já existe)
  -- -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.status_history
    WHERE module = 'desligamentos'
      AND entity_type = 'termination_requests'
      AND entity_id = _request_id
      AND from_status = _req.status::text
      AND to_status   = _to_status::text
      AND changed_by  = _uid
      -- janela de 5 segundos para idempotência
      AND created_at >= now() - interval '5 seconds'
  ) THEN
    INSERT INTO public.status_history
      (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES
      ('desligamentos', 'termination_requests', _request_id,
       _req.status::text, _to_status::text, _uid);
  END IF;

  -- -------------------------------------------------------
  -- 7. Auditoria (sem duplicação)
  -- -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE user_id     = _uid
      AND action      = 'status_change'
      AND entity_type = 'termination_requests'
      AND entity_id   = _request_id::text
      AND details->>'to' = _to_status::text
      AND created_at >= now() - interval '5 seconds'
  ) THEN
    INSERT INTO public.audit_logs
      (user_id, action, entity_type, entity_id, details)
    VALUES
      (_uid, 'status_change', 'termination_requests', _request_id::text,
       jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason));
  END IF;

  -- -------------------------------------------------------
  -- 8. Desvínculos ao concluir (usa campo real: user_profile_id)
  -- -------------------------------------------------------
  IF _to_status::text = 'desligamento_concluido' THEN
    -- Busca colaborador pelo contrato real
    SELECT * INTO _collab
    FROM public.collaborators
    WHERE id = _req.collaborator_id;

    IF FOUND THEN
      -- Inativa colaborador
      UPDATE public.collaborators
      SET active = false, status = 'inativo', updated_at = now()
      WHERE id = _collab.id;

      -- Campo real: user_profile_id (e NÃO user_id)
      _profile_id := _collab.user_profile_id;

      IF _profile_id IS NOT NULL THEN
        -- Inativa o perfil vinculado (nunca o solicitante)
        -- Só inativa se o profile NÃO for o do solicitante
        IF _profile_id != _req.requester_user_id THEN
          UPDATE public.profiles
          SET active = false, updated_at = now()
          WHERE id = _profile_id;
        END IF;

        -- Limpa vínculos de setor (responsável / substituto)
        UPDATE public.sectors
        SET responsible_user_id = NULL, updated_at = now()
        WHERE responsible_user_id = _profile_id;

        UPDATE public.sectors
        SET substitute_user_id = NULL, updated_at = now()
        WHERE substitute_user_id = _profile_id;

        -- Protege o último Master
        IF EXISTS (
          SELECT 1
          FROM public.user_role_assignments ura
          JOIN public.roles r ON r.id = ura.role_id
          WHERE ura.user_id = _profile_id AND r.key = 'master'
        ) THEN
          IF (
            SELECT count(DISTINCT ura2.user_id)
            FROM public.user_role_assignments ura2
            JOIN public.roles r2 ON r2.id = ura2.role_id
            JOIN public.profiles p2 ON p2.id = ura2.user_id
            WHERE r2.key = 'master'
              AND COALESCE(p2.active, true) = true
              AND ura2.user_id != _profile_id
          ) = 0 THEN
            RAISE EXCEPTION 'Não é possível desligar o último Master do sistema.';
          END IF;
        END IF;

        -- Remove roles do colaborador desligado
        DELETE FROM public.user_role_assignments
        WHERE user_id = _profile_id;
      END IF;
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- 9. Notificação ao solicitante (sem duplicação)
  -- -------------------------------------------------------
  IF _req.requester_user_id IS NOT NULL AND _req.requester_user_id != _uid THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id   = _req.requester_user_id
        AND metadata->>'entity_id' = _request_id::text
        AND metadata->>'status'    = _to_status::text
        AND created_at >= now() - interval '5 seconds'
    ) THEN
      INSERT INTO public.notifications
        (user_id, title, message, metadata)
      VALUES (
        _req.requester_user_id,
        CASE _to_status::text
          WHEN 'cancelado'              THEN 'Desligamento cancelado'
          WHEN 'desligamento_concluido' THEN 'Desligamento concluído'
          WHEN 'aprovado'               THEN 'Desligamento aprovado'
          WHEN 'reprovado'              THEN 'Desligamento reprovado'
          WHEN 'retornado'              THEN 'Desligamento retornado para ajustes'
          ELSE 'Desligamento atualizado'
        END,
        format('Processo de desligamento movido para: %s', _to_status::text),
        jsonb_build_object(
          'entity_type', 'termination_requests',
          'entity_id',   _request_id,
          'status',      _to_status
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$function$;
