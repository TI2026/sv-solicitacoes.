
-- Add soft delete columns to fuel_requests
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_fuel_requests_not_deleted ON public.fuel_requests (status) WHERE deleted_at IS NULL;

-- RPC for soft delete
CREATE OR REPLACE FUNCTION public.soft_delete_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _allowed_statuses text[] := ARRAY['reprovado', 'encerrado'];
BEGIN
  -- Only admin/diretoria
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Apenas Diretoria ou Administrativo podem excluir');
  END IF;

  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  IF _req.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Já foi excluída');
  END IF;

  -- For abastecimento/reembolso: only reprovado/encerrado
  -- For diaria: any status (admin/diretoria can delete)
  IF _req.type IN ('abastecimento', 'reembolso') AND NOT (_req.status::text = ANY(_allowed_statuses)) THEN
    RETURN jsonb_build_object('error', format('Só é possível excluir solicitações com status: %s', array_to_string(_allowed_statuses, ', ')));
  END IF;

  UPDATE public.fuel_requests
  SET deleted_at = now(), deleted_by = _uid
  WHERE id = _request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'soft_delete', 'fuel_requests', _request_id::text,
    jsonb_build_object('type', _req.type, 'status', _req.status, 'reason', _reason));

  RETURN jsonb_build_object('success', true);
END;
$$;
