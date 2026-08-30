
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS daily_start_date date,
  ADD COLUMN IF NOT EXISTS daily_end_date date,
  ADD COLUMN IF NOT EXISTS daily_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS daily_end_time time without time zone,
  ADD COLUMN IF NOT EXISTS daily_quantity integer,
  ADD COLUMN IF NOT EXISTS daily_destination text;

COMMENT ON COLUMN public.fuel_requests.daily_value IS
  'Frozen unit rate for a Diária. `valor` stores daily_quantity * daily_value.';
COMMENT ON COLUMN public.fuel_requests.daily_quantity IS
  'Inclusive calendar-day count, recalculated by the database.';

CREATE OR REPLACE FUNCTION public.workflow_entity_link(p_module text, p_entity_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public._engine_module_norm(p_module)
    WHEN 'compras' THEN '/purchases/' || p_entity_id::text
    WHEN 'admissoes' THEN '/admissions/' || p_entity_id::text
    WHEN 'desligamentos' THEN '/desligamentos/' || p_entity_id::text
    WHEN 'diaria' THEN '/diarias/' || p_entity_id::text
    WHEN 'reembolso' THEN '/reembolsos/' || p_entity_id::text
    WHEN 'abastecimento' THEN '/abastecimento/' || p_entity_id::text
    ELSE '/pendencias'
  END
$$;

ALTER TABLE public.fuel_requests
  DROP CONSTRAINT IF EXISTS fuel_daily_period_order_ck;
ALTER TABLE public.fuel_requests
  ADD CONSTRAINT fuel_daily_period_order_ck CHECK (
    type <> 'diaria'
    OR daily_start_date IS NULL
    OR daily_end_date IS NULL
    OR daily_start_date <= daily_end_date
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_fuel_request_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := lower(COALESCE(NEW.type, ''));
  v_start_date date;
  v_end_date date;
  v_quantity integer;
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.type IS NOT DISTINCT FROM OLD.type
     AND NEW.valor IS NOT DISTINCT FROM OLD.valor
     AND NEW.data_abastecimento IS NOT DISTINCT FROM OLD.data_abastecimento
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.placa IS NOT DISTINCT FROM OLD.placa
     AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
     AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
     AND NEW.payment_method IS NOT DISTINCT FROM OLD.payment_method
     AND NEW.pix_key IS NOT DISTINCT FROM OLD.pix_key
     AND NEW.bank_name IS NOT DISTINCT FROM OLD.bank_name
     AND NEW.bank_agency IS NOT DISTINCT FROM OLD.bank_agency
     AND NEW.bank_account IS NOT DISTINCT FROM OLD.bank_account
     AND NEW.daily_category IS NOT DISTINCT FROM OLD.daily_category
     AND NEW.person_name IS NOT DISTINCT FROM OLD.person_name
     AND NEW.daily_value IS NOT DISTINCT FROM OLD.daily_value
     AND NEW.daily_start_date IS NOT DISTINCT FROM OLD.daily_start_date
     AND NEW.daily_end_date IS NOT DISTINCT FROM OLD.daily_end_date
     AND NEW.daily_start_time IS NOT DISTINCT FROM OLD.daily_start_time
     AND NEW.daily_end_time IS NOT DISTINCT FROM OLD.daily_end_time
     AND NEW.daily_destination IS NOT DISTINCT FROM OLD.daily_destination
  THEN
    RETURN NEW;
  END IF;

  IF v_type NOT IN ('abastecimento','diaria','reembolso') THEN
    RAISE EXCEPTION 'REQUEST_TYPE_INVALID';
  END IF;

  IF v_type = 'diaria' THEN
    v_start_date := COALESCE(NEW.daily_start_date, NEW.data_abastecimento);
    v_end_date := COALESCE(NEW.daily_end_date, v_start_date);

    IF v_start_date IS NULL OR v_end_date IS NULL THEN
      RAISE EXCEPTION 'DAILY_PERIOD_REQUIRED';
    END IF;
    IF v_start_date > v_end_date THEN
      RAISE EXCEPTION 'DAILY_PERIOD_INVALID';
    END IF;
    IF v_start_date < current_date THEN
      RAISE EXCEPTION 'DAILY_DATE_MUST_BE_TODAY_OR_FUTURE';
    END IF;
    IF NEW.daily_start_time IS NULL OR NEW.daily_end_time IS NULL THEN
      RAISE EXCEPTION 'DAILY_TIME_REQUIRED';
    END IF;
    IF (v_end_date + NEW.daily_end_time) <= (v_start_date + NEW.daily_start_time) THEN
      RAISE EXCEPTION 'DAILY_END_MUST_BE_AFTER_START';
    END IF;
    IF NULLIF(trim(NEW.daily_category), '') IS NULL
       OR NULLIF(trim(NEW.person_name), '') IS NULL
       OR NULLIF(trim(NEW.daily_destination), '') IS NULL
       OR NULLIF(trim(NEW.notes), '') IS NULL THEN
      RAISE EXCEPTION 'DAILY_REQUIRED_FIELDS_MISSING';
    END IF;
    IF NEW.daily_value IS NULL OR NEW.daily_value <= 0 THEN
      RAISE EXCEPTION 'DAILY_RATE_INVALID';
    END IF;

    v_quantity := (v_end_date - v_start_date) + 1;
    NEW.daily_start_date := v_start_date;
    NEW.daily_end_date := v_end_date;
    NEW.data_abastecimento := v_start_date;
    NEW.daily_quantity := v_quantity;
    NEW.valor := round(v_quantity * NEW.daily_value, 2);
  ELSE
    IF NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 50000 THEN
      RAISE EXCEPTION 'REQUEST_VALUE_INVALID';
    END IF;

    IF v_type = 'abastecimento' THEN
      IF NEW.data_abastecimento < current_date THEN
        RAISE EXCEPTION 'FUEL_DATE_MUST_BE_TODAY_OR_FUTURE';
      END IF;
      IF NULLIF(trim(NEW.placa), '') IS NULL OR NULLIF(trim(NEW.motivo), '') IS NULL THEN
        RAISE EXCEPTION 'FUEL_REQUIRED_FIELDS_MISSING';
      END IF;
    ELSE
      IF NEW.data_abastecimento > current_date THEN
        RAISE EXCEPTION 'REIMBURSEMENT_FUTURE_DATE_DENIED';
      END IF;
      IF NULLIF(trim(NEW.categoria), '') IS NULL OR NULLIF(trim(NEW.notes), '') IS NULL THEN
        RAISE EXCEPTION 'REIMBURSEMENT_REQUIRED_FIELDS_MISSING';
      END IF;
      IF NEW.payment_method = 'pix' AND NULLIF(trim(NEW.pix_key), '') IS NULL THEN
        RAISE EXCEPTION 'REIMBURSEMENT_PIX_REQUIRED';
      ELSIF NEW.payment_method = 'banco'
            AND (NULLIF(trim(NEW.bank_name), '') IS NULL
                 OR NULLIF(trim(NEW.bank_agency), '') IS NULL
                 OR NULLIF(trim(NEW.bank_account), '') IS NULL) THEN
        RAISE EXCEPTION 'REIMBURSEMENT_BANK_DATA_REQUIRED';
      ELSIF NEW.payment_method NOT IN ('pix','banco') THEN
        RAISE EXCEPTION 'REIMBURSEMENT_PAYMENT_METHOD_INVALID';
      END IF;
    END IF;
  END IF;

  IF NEW.valor IS NULL OR NEW.valor <= 0 OR NEW.valor > 50000 THEN
    RAISE EXCEPTION 'REQUEST_VALUE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = '_execute_entity_action_checkpoint6_previous'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
             RENAME TO _execute_entity_action_checkpoint6_previous';
  END IF;
END
$do$;

REVOKE ALL ON FUNCTION public._execute_entity_action_checkpoint6_previous(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.execute_entity_action(
  p_module_key text,
  p_entity_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_module text := public._engine_module_norm(p_module_key);
  v_action text := lower(trim(p_action));
  v_request public.fuel_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;

  v_action := CASE v_action WHEN 'submit' THEN 'enviar' ELSE v_action END;

  IF v_module IN ('abastecimento','diaria','reembolso')
     AND v_action IN ('enviar','enviar_comprovantes') THEN
    SELECT * INTO v_request
      FROM public.fuel_requests
     WHERE id = p_entity_id
       AND type = v_module
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
    IF NOT public._engine_can_view(
      v_module, p_entity_id, v_request.requester_user_id, v_uid
    ) THEN
      RETURN jsonb_build_object('code','404','message','Registro não encontrado');
    END IF;
  END IF;

  IF v_module = 'diaria' AND v_action = 'enviar' THEN
    IF v_request.daily_start_date IS NULL
       OR v_request.daily_end_date IS NULL
       OR v_request.daily_start_time IS NULL
       OR v_request.daily_end_time IS NULL
       OR v_request.daily_quantity IS NULL
       OR v_request.daily_quantity <> (v_request.daily_end_date - v_request.daily_start_date) + 1
       OR v_request.valor <> round(v_request.daily_quantity * v_request.daily_value, 2)
       OR NULLIF(trim(v_request.daily_destination), '') IS NULL
       OR NULLIF(trim(v_request.notes), '') IS NULL THEN
      RETURN jsonb_build_object('code','422','message','Período ou valores da Diária inválidos');
    END IF;
  END IF;

  IF v_module = 'reembolso' AND v_action = 'enviar'
     AND NOT EXISTS (
       SELECT 1 FROM public.fuel_attachments fa
        WHERE fa.fuel_request_id = p_entity_id
          AND fa.type = 'nota_fiscal'
     ) THEN
    RETURN jsonb_build_object('code','422','message','Anexe o comprovante da despesa antes de enviar');
  END IF;

  IF v_module = 'abastecimento' AND v_action = 'enviar_comprovantes'
     AND NOT (
       EXISTS (SELECT 1 FROM public.fuel_attachments fa
                WHERE fa.fuel_request_id=p_entity_id AND fa.type='nota_fiscal')
       AND EXISTS (SELECT 1 FROM public.fuel_attachments fa
                    WHERE fa.fuel_request_id=p_entity_id AND fa.type='hodometro')
     ) THEN
    RETURN jsonb_build_object('code','422','message','Anexe a nota fiscal e o hodômetro');
  END IF;

  IF v_module = 'diaria' AND v_action = 'enviar_comprovantes'
     AND NOT EXISTS (
       SELECT 1 FROM public.fuel_attachments fa
        WHERE fa.fuel_request_id = p_entity_id
     ) THEN
    RETURN jsonb_build_object('code','422','message','Anexe ao menos um comprovante da execução');
  END IF;

  RETURN public._execute_entity_action_checkpoint6_previous(
    v_module, p_entity_id, v_action, COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_entity_action(text, uuid, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_daily_request_draft(
  p_entity_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_daily_rate numeric,
  p_service_type text,
  p_destination text,
  p_person_name text,
  p_person_cpf text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx public.entity_action_context;
  v_requester uuid;
  v_quantity integer;
  v_total numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('code','401','message','Não autenticado');
  END IF;

  SELECT requester_user_id INTO v_requester
    FROM public.fuel_requests
   WHERE id = p_entity_id AND type = 'diaria'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('code','404','message','Diária não encontrada');
  END IF;

  SELECT * INTO v_ctx
    FROM public.get_entity_action_context('diaria', p_entity_id);
  IF v_ctx IS NULL OR NOT v_ctx.can_edit OR v_requester IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('code','403','message','Diária não pode ser editada neste estágio');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RETURN jsonb_build_object('code','422','message','Período da Diária inválido');
  END IF;
  IF p_start_date < current_date THEN
    RETURN jsonb_build_object('code','422','message','A data inicial deve ser hoje ou futura');
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL
     OR (p_end_date + p_end_time) <= (p_start_date + p_start_time) THEN
    RETURN jsonb_build_object('code','422','message','O término deve ser posterior ao início');
  END IF;
  IF p_daily_rate IS NULL OR p_daily_rate <= 0
     OR NULLIF(trim(p_service_type),'') IS NULL
     OR NULLIF(trim(p_destination),'') IS NULL
     OR NULLIF(trim(p_person_name),'') IS NULL
     OR NULLIF(trim(p_notes),'') IS NULL THEN
    RETURN jsonb_build_object('code','422','message','Preencha os campos obrigatórios da Diária');
  END IF;

  v_quantity := (p_end_date - p_start_date) + 1;
  v_total := round(v_quantity * p_daily_rate, 2);
  IF v_total > 50000 THEN
    RETURN jsonb_build_object('code','422','message','Valor total excede o limite permitido');
  END IF;

  UPDATE public.fuel_requests
     SET daily_start_date = p_start_date,
         daily_end_date = p_end_date,
         daily_start_time = p_start_time,
         daily_end_time = p_end_time,
         daily_quantity = v_quantity,
         daily_value = p_daily_rate,
         valor = v_total,
         data_abastecimento = p_start_date,
         daily_category = trim(p_service_type),
         daily_destination = trim(p_destination),
         person_name = trim(p_person_name),
         person_cpf = NULLIF(regexp_replace(COALESCE(p_person_cpf,''), '\D', '', 'g'),''),
         notes = trim(p_notes),
         updated_at = now()
   WHERE id = p_entity_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid, 'DAILY_DRAFT_UPDATED', 'diaria', p_entity_id::text,
    jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'daily_quantity', v_quantity,
      'daily_rate', p_daily_rate,
      'total_amount', v_total,
      'destination', trim(p_destination),
      'service_type', trim(p_service_type)
    )
  );

  RETURN jsonb_build_object(
    'code','200','message','Rascunho atualizado',
    'data',jsonb_build_object(
      'id',p_entity_id,'daily_quantity',v_quantity,'total_amount',v_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_daily_request_draft(
  uuid,date,date,time without time zone,time without time zone,numeric,text,text,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_daily_request_draft(
  uuid,date,date,time without time zone,time without time zone,numeric,text,text,text,text,text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_storage_can_read(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_request_id uuid;
  v_module text;
  v_ctx public.entity_action_context;
BEGIN
  IF (storage.foldername(p_object_name))[1] IS DISTINCT FROM 'requests' THEN
    RETURN false;
  END IF;
  SELECT fr.id, fr.type INTO v_request_id, v_module
    FROM public.fuel_requests fr
   WHERE fr.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_ctx FROM public.get_entity_action_context(v_module, v_request_id);
  RETURN v_ctx.entity_id = v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_storage_can_write(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_request_id uuid;
  v_module text;
  v_ctx public.entity_action_context;
BEGIN
  IF (storage.foldername(p_object_name))[1] IS DISTINCT FROM 'requests' THEN
    RETURN false;
  END IF;
  SELECT fr.id, fr.type INTO v_request_id, v_module
    FROM public.fuel_requests fr
   WHERE fr.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_ctx FROM public.get_entity_action_context(v_module, v_request_id);
  RETURN v_ctx.requester_user_id = auth.uid()
     AND (v_ctx.can_edit IS TRUE OR v_ctx.allowed_actions ? 'enviar_comprovantes');
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_storage_can_read(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_storage_can_write(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_storage_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_storage_can_write(text) TO authenticated;

DROP POLICY IF EXISTS "Users can read own fleet files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own fleet files" ON storage.objects;
DROP POLICY IF EXISTS "Fleet request files are visible through Action Context" ON storage.objects;
CREATE POLICY "Fleet request files are visible through Action Context"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fleet' AND public.fleet_storage_can_read(name));

DROP POLICY IF EXISTS "Fleet requester can upload files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can upload files when allowed"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fleet' AND public.fleet_storage_can_write(name));

DROP POLICY IF EXISTS "Fleet requester can update files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can update files when allowed"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'fleet' AND public.fleet_storage_can_write(name))
WITH CHECK (bucket_id = 'fleet' AND public.fleet_storage_can_write(name));

DROP POLICY IF EXISTS "Fleet requester can delete files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can delete files when allowed"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'fleet' AND public.fleet_storage_can_write(name));

DROP POLICY IF EXISTS "Authenticated can insert own notifications" ON public.notifications;
REVOKE INSERT ON TABLE public.notifications FROM authenticated;

CREATE OR REPLACE FUNCTION public.admission_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text IS DISTINCT FROM 'rascunho' THEN
      RAISE EXCEPTION 'ADMISSION_CONTROLLED_FIELD_DENIED: use execute_entity_action';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id THEN
    RAISE EXCEPTION 'ADMISSION_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_admission_requests_guard_controlled_fields ON public.admission_requests;
CREATE TRIGGER tr_admission_requests_guard_controlled_fields
BEFORE INSERT OR UPDATE ON public.admission_requests
FOR EACH ROW EXECUTE FUNCTION public.admission_requests_guard_controlled_fields();

CREATE OR REPLACE FUNCTION public.termination_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text IS DISTINCT FROM 'rascunho' THEN
      RAISE EXCEPTION 'TERMINATION_CONTROLLED_FIELD_DENIED: use execute_entity_action';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.collaborator_id IS DISTINCT FROM OLD.collaborator_id THEN
    RAISE EXCEPTION 'TERMINATION_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_termination_requests_guard_controlled_fields ON public.termination_requests;
CREATE TRIGGER tr_termination_requests_guard_controlled_fields
BEFORE INSERT OR UPDATE ON public.termination_requests
FOR EACH ROW EXECUTE FUNCTION public.termination_requests_guard_controlled_fields();

REVOKE ALL ON FUNCTION public.admission_requests_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.termination_requests_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
