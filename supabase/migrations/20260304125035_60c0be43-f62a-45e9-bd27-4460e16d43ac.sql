
-- Add type and extra columns to fuel_requests
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'abastecimento',
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS km text,
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_agency text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS daily_category text,
  ADD COLUMN IF NOT EXISTS person_name text,
  ADD COLUMN IF NOT EXISTS person_cpf text,
  ADD COLUMN IF NOT EXISTS hours numeric,
  ADD COLUMN IF NOT EXISTS daily_value numeric;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fuel_requests_type ON public.fuel_requests(type);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_status ON public.fuel_requests(status);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_created ON public.fuel_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_requester ON public.fuel_requests(requester_user_id);

-- Updated RPC with new state machine supporting all 3 types
CREATE OR REPLACE FUNCTION public.fuel_set_status(
  _request_id uuid,
  _to_status fuel_status,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed jsonb;
  _valid_targets jsonb;
BEGIN
  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  -- Type-specific state machines
  IF _req.type = 'diaria' THEN
    _allowed := '{"ativa":["encerrada"],"rascunho":["ativa"]}'::jsonb;
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
  ELSIF _to_status = 'em_revisao_admin' THEN
    IF _req.requester_user_id != _uid THEN
      RETURN jsonb_build_object('error', 'Apenas o solicitante pode submeter fotos');
    END IF;
  ELSIF _to_status IN ('concluido', 'encerrado') THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      IF _req.requester_user_id != _uid THEN
        RETURN jsonb_build_object('error', 'Sem permissão para concluir');
      END IF;
    END IF;
  ELSIF _to_status = 'ativa' THEN
    IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
      RETURN jsonb_build_object('error', 'Sem permissão');
    END IF;
  END IF;

  UPDATE public.fuel_requests SET status = _to_status WHERE id = _request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('fleet', 'fuel_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'fuel_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason, 'type', _req.type) || _metadata);

  IF _to_status IN ('aprovado', 'retornado', 'reprovado', 'concluido', 'encerrado') THEN
    INSERT INTO public.fuel_reviews (fuel_request_id, reviewer_user_id, decision, reason)
    VALUES (_request_id, _uid,
      CASE
        WHEN _to_status IN ('aprovado', 'concluido') THEN 'approved'::review_decision
        WHEN _to_status = 'retornado' THEN 'needs_revision'::review_decision
        ELSE 'rejected'::review_decision
      END,
      _reason);
  END IF;

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

-- Refresh vw_fuel_metrics to include type
DROP VIEW IF EXISTS public.vw_fuel_metrics;
CREATE VIEW public.vw_fuel_metrics WITH (security_invoker = on) AS
SELECT
  type,
  status,
  count(*) AS total,
  count(*) FILTER (WHERE status NOT IN ('concluido','encerrado','reprovado')) AS pendentes,
  count(*) FILTER (WHERE status IN ('aprovado','concluido','encerrado')) AS aprovados,
  count(*) FILTER (WHERE status = 'reprovado') AS reprovados,
  count(*) FILTER (WHERE status IN ('concluido','encerrado')) AS encerrados,
  COALESCE(sum(valor), 0) AS valor_total
FROM public.fuel_requests
GROUP BY type, status;
