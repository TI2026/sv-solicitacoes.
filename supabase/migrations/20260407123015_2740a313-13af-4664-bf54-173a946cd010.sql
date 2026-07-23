
CREATE OR REPLACE FUNCTION public.soft_delete_request(_request_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _is_master boolean;
  _allowed_statuses text[] := ARRAY['reprovado', 'encerrado'];
  _final_statuses text[] := ARRAY['concluido', 'pago'];
BEGIN
  -- Check master status
  SELECT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _uid AND r.is_master
  ) INTO _is_master;

  -- Only admin/diretoria or master
  IF NOT (_is_master OR has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Apenas Diretoria, Administrativo ou Master podem excluir');
  END IF;

  SELECT * INTO _req FROM public.fuel_requests WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  IF _req.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Já foi excluída');
  END IF;

  -- Master can delete any non-concluded request
  IF _is_master THEN
    IF _req.status::text = ANY(_final_statuses) THEN
      RETURN jsonb_build_object('error', 'Não é possível excluir solicitações já concluídas/pagas');
    END IF;
    -- Master can delete, proceed
  ELSE
    -- For non-master admin/diretoria: only reprovado/encerrado (or any for diaria)
    IF _req.type IN ('abastecimento', 'reembolso') AND NOT (_req.status::text = ANY(_allowed_statuses)) THEN
      RETURN jsonb_build_object('error', format('Só é possível excluir solicitações com status: %s', array_to_string(_allowed_statuses, ', ')));
    END IF;
  END IF;

  -- Cancel any active approval flow
  UPDATE public.approval_requests
  SET status = 'cancelled', ended_at = now()
  WHERE reference_id = _request_id AND ended_at IS NULL;

  UPDATE public.fuel_requests
  SET deleted_at = now(), deleted_by = _uid
  WHERE id = _request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'soft_delete', 'fuel_requests', _request_id::text,
    jsonb_build_object('type', _req.type, 'status', _req.status, 'reason', _reason, 'is_master', _is_master));

  RETURN jsonb_build_object('success', true);
END;
$function$;
