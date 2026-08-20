-- ============================================================
-- SPRINT 15: Desligamentos — schema + contrato de status
-- (adaptado ao schema real: collaborators.user_profile_id)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.termination_type AS ENUM (
    'pedido_demissao','demissao_sem_justa_causa','demissao_por_justa_causa',
    'acordo','termino_contrato','experiencia','aposentadoria','falecimento','outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.termination_status AS ENUM (
    'rascunho','em_aprovacao','aprovado','reprovado','retornado',
    'desligamento_concluido','cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.termination_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id       uuid NOT NULL REFERENCES public.collaborators(id),
  requester_user_id     uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  tipo_desligamento     public.termination_type NOT NULL,
  motivo                text NOT NULL,
  data_prevista         date NOT NULL,
  ultimo_dia_trabalhado date,
  gestor_imediato       text,
  matricula             text,
  observacoes           text,
  status                public.termination_status NOT NULL DEFAULT 'rascunho',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.termination_requests TO authenticated;
GRANT ALL ON public.termination_requests TO service_role;

ALTER TABLE public.termination_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RH manages termination_requests" ON public.termination_requests;
CREATE POLICY "RH manages termination_requests" ON public.termination_requests
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role)
  );

DROP POLICY IF EXISTS "Requester can view own termination_requests" ON public.termination_requests;
CREATE POLICY "Requester can view own termination_requests" ON public.termination_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_termination_requests_collaborator ON public.termination_requests(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_termination_requests_status ON public.termination_requests(status);
CREATE INDEX IF NOT EXISTS idx_termination_requests_requester ON public.termination_requests(requester_user_id);

DROP TRIGGER IF EXISTS set_termination_requests_updated_at ON public.termination_requests;
CREATE TRIGGER set_termination_requests_updated_at
  BEFORE UPDATE ON public.termination_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.approval_modules (code, name)
VALUES ('desligamentos', 'Desligamentos')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- Contrato oficial de transição de status
-- ------------------------------------------------------------
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
  _req     RECORD;
  _collab  RECORD;
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
  SELECT * INTO _req FROM public.termination_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT (_valid_targets ? _to_status::text) THEN
    RETURN jsonb_build_object('error',
      format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  IF _req.status::text = 'desligamento_concluido' AND _to_status::text = 'cancelado' THEN
    RETURN jsonb_build_object('error', 'Não é possível cancelar um desligamento já concluído');
  END IF;

  IF NOT (
    has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'rh')
  ) THEN
    IF NOT (
      _req.requester_user_id = _uid
      AND _req.status::text = 'rascunho'
      AND _to_status::text = 'em_aprovacao'
    ) THEN
      RETURN jsonb_build_object('error', 'Sem permissão para esta operação');
    END IF;
  END IF;

  UPDATE public.termination_requests
  SET status = _to_status, updated_at = now()
  WHERE id = _request_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.status_history
    WHERE module = 'desligamentos'
      AND entity_type = 'termination_requests'
      AND entity_id = _request_id
      AND from_status = _req.status::text
      AND to_status   = _to_status::text
      AND changed_by  = _uid
      AND created_at >= now() - interval '5 seconds'
  ) THEN
    INSERT INTO public.status_history
      (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES
      ('desligamentos', 'termination_requests', _request_id,
       _req.status::text, _to_status::text, _uid);
  END IF;

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

  IF _to_status::text = 'desligamento_concluido' THEN
    SELECT * INTO _collab FROM public.collaborators WHERE id = _req.collaborator_id;

    IF FOUND THEN
      UPDATE public.collaborators
      SET active = false, status = 'inativo', updated_at = now()
      WHERE id = _collab.id;

      _profile_id := _collab.user_profile_id;

      IF _profile_id IS NOT NULL THEN
        IF _profile_id != _req.requester_user_id THEN
          UPDATE public.profiles SET active = false, updated_at = now() WHERE id = _profile_id;
        END IF;

        UPDATE public.sectors SET responsible_user_id = NULL, updated_at = now()
          WHERE responsible_user_id = _profile_id;
        UPDATE public.sectors SET substitute_user_id = NULL, updated_at = now()
          WHERE substitute_user_id = _profile_id;

        IF EXISTS (
          SELECT 1 FROM public.user_role_assignments ura
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

        DELETE FROM public.user_role_assignments WHERE user_id = _profile_id;
      END IF;
    END IF;
  END IF;

  IF _req.requester_user_id IS NOT NULL AND _req.requester_user_id != _uid THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id   = _req.requester_user_id
        AND metadata->>'entity_id' = _request_id::text
        AND metadata->>'status'    = _to_status::text
        AND created_at >= now() - interval '5 seconds'
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, metadata)
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
        jsonb_build_object('entity_type','termination_requests','entity_id',_request_id,'status',_to_status)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.termination_set_status(uuid, public.termination_status, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.termination_set_status(uuid, public.termination_status, text) TO authenticated;