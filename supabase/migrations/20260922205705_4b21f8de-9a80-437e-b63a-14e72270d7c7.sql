ALTER TYPE public.fuel_attachment_type ADD VALUE IF NOT EXISTS 'comprovante_pagamento';

CREATE OR REPLACE FUNCTION public.fleet_attachment_can_write(p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_type text;
  v_ctx public.entity_action_context;
BEGIN
  SELECT type INTO v_type FROM public.fuel_requests WHERE id = p_request_id;
  IF NOT FOUND OR auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_ctx
    FROM public.get_entity_action_context(v_type, p_request_id);
  -- Solicitante enviando comprovantes do próprio processo
  IF v_ctx.requester_user_id = auth.uid()
     AND (v_ctx.can_edit IS TRUE OR v_ctx.allowed_actions ? 'enviar_comprovantes') THEN
    RETURN true;
  END IF;
  -- Ator financeiro da etapa atual anexando o comprovante de pagamento
  RETURN v_ctx.is_current_actor IS TRUE AND v_ctx.allowed_actions ? 'pagar';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_storage_can_write(p_object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
  v_request_id uuid;
BEGIN
  IF (storage.foldername(p_object_name))[1] IS DISTINCT FROM 'requests' THEN
    RETURN false;
  END IF;

  SELECT fr.id INTO v_request_id
    FROM public.fuel_requests fr
   WHERE fr.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN public.fleet_attachment_can_write(v_request_id);
END;
$function$;