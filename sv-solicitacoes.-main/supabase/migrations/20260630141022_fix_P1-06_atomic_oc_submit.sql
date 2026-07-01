-- [P1-06] Correção: Atomicidade no registro de OC — IP-PLAN Onda 5
CREATE OR REPLACE FUNCTION public.register_oc_and_advance(
  _request_id uuid,
  _oc_number text,
  _oc_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res1 jsonb;
  _res2 jsonb;
BEGIN
  IF _oc_number IS NULL OR trim(_oc_number) = '' THEN
    RETURN jsonb_build_object('error', 'Número da OC é obrigatório');
  END IF;

  -- 1) Avança de aprovado para aguardando_oc
  _res1 := public.fuel_set_status(_request_id, 'aguardando_oc'::fuel_status, NULL, '{}'::jsonb);
  IF _res1 ? 'error' THEN
    RETURN _res1;
  END IF;

  -- 2) Registra OC e avança para aguardando_pagamento
  _res2 := public.fuel_set_status(_request_id, 'aguardando_pagamento'::fuel_status, NULL, 
    jsonb_build_object(
      'oc_number', trim(_oc_number), 
      'oc_notes', CASE WHEN _oc_notes IS NOT NULL AND trim(_oc_notes) != '' THEN trim(_oc_notes) ELSE NULL END
    )
  );
  IF _res2 ? 'error' THEN
    RETURN _res2;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'aguardando_pagamento');
END;
$$;

-- === ROLLBACK ===
-- DROP FUNCTION IF EXISTS public.register_oc_and_advance(uuid, text, text);
