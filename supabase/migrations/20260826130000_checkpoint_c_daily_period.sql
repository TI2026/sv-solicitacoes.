-- Checkpoint C: authoritative one-day/multi-day allowance contract.
-- Existing columns are reused as follows:
--   data_abastecimento = start date
--   daily_value        = rate per day
--   valor              = backend-calculated total

ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS daily_end_date date,
  ADD COLUMN IF NOT EXISTS daily_days integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.fuel_requests'::regclass
       AND conname = 'fuel_requests_daily_days_positive'
  ) THEN
    ALTER TABLE public.fuel_requests
      ADD CONSTRAINT fuel_requests_daily_days_positive
      CHECK (daily_days IS NULL OR daily_days >= 1) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fuel_request_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := lower(COALESCE(NEW.type, ''));
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
     AND NEW.pix_key_type IS NOT DISTINCT FROM OLD.pix_key_type
     AND NEW.bank_name IS NOT DISTINCT FROM OLD.bank_name
     AND NEW.bank_agency IS NOT DISTINCT FROM OLD.bank_agency
     AND NEW.bank_account IS NOT DISTINCT FROM OLD.bank_account
     AND NEW.daily_category IS NOT DISTINCT FROM OLD.daily_category
     AND NEW.person_name IS NOT DISTINCT FROM OLD.person_name
     AND NEW.person_cpf IS NOT DISTINCT FROM OLD.person_cpf
     AND NEW.hours IS NOT DISTINCT FROM OLD.hours
     AND NEW.daily_value IS NOT DISTINCT FROM OLD.daily_value
     AND NEW.daily_end_date IS NOT DISTINCT FROM OLD.daily_end_date
     AND NEW.daily_days IS NOT DISTINCT FROM OLD.daily_days
  THEN
    RETURN NEW;
  END IF;

  IF v_type NOT IN ('abastecimento','diaria','reembolso') THEN
    RAISE EXCEPTION 'REQUEST_TYPE_INVALID';
  END IF;

  IF v_type = 'diaria' THEN
    IF NEW.data_abastecimento < current_date THEN
      RAISE EXCEPTION 'DAILY_DATE_MUST_BE_TODAY_OR_FUTURE';
    END IF;
    IF NEW.daily_end_date IS NULL THEN
      RAISE EXCEPTION 'DAILY_END_DATE_REQUIRED';
    END IF;
    IF NEW.daily_end_date < NEW.data_abastecimento THEN
      RAISE EXCEPTION 'DAILY_END_BEFORE_START';
    END IF;

    NEW.daily_days := (NEW.daily_end_date - NEW.data_abastecimento) + 1;

    IF NULLIF(trim(NEW.daily_category), '') IS NULL
       OR NULLIF(trim(NEW.person_name), '') IS NULL
       OR NULLIF(trim(NEW.motivo), '') IS NULL
       OR COALESCE(NEW.daily_value, 0) <= 0 THEN
      RAISE EXCEPTION 'DAILY_REQUIRED_FIELDS_MISSING';
    END IF;
    IF NEW.hours IS NOT NULL AND (NEW.hours <= 0 OR NEW.hours > 24) THEN
      RAISE EXCEPTION 'DAILY_HOURS_INVALID';
    END IF;

    NEW.valor := round((NEW.daily_days::numeric * NEW.daily_value), 2);
    IF NEW.valor <= 0 OR NEW.valor > 50000 THEN
      RAISE EXCEPTION 'REQUEST_VALUE_INVALID';
    END IF;

    IF NEW.payment_method = 'pix' AND NULLIF(trim(NEW.pix_key), '') IS NULL THEN
      RAISE EXCEPTION 'DAILY_PIX_REQUIRED';
    ELSIF NEW.payment_method = 'banco'
          AND (NULLIF(trim(NEW.bank_name), '') IS NULL
               OR NULLIF(trim(NEW.bank_agency), '') IS NULL
               OR NULLIF(trim(NEW.bank_account), '') IS NULL) THEN
      RAISE EXCEPTION 'DAILY_BANK_DATA_REQUIRED';
    ELSIF COALESCE(NEW.payment_method, '') NOT IN ('pix','banco') THEN
      RAISE EXCEPTION 'DAILY_PAYMENT_METHOD_INVALID';
    END IF;
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
      ELSIF COALESCE(NEW.payment_method, '') NOT IN ('pix','banco') THEN
        RAISE EXCEPTION 'REIMBURSEMENT_PAYMENT_METHOD_INVALID';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_fuel_request_business_rules()
  FROM PUBLIC, anon, authenticated;

-- Starting a workflow revalidates the stored draft. This closes the gap where
-- a legacy/service-created draft could otherwise bypass browser-time checks.
CREATE OR REPLACE FUNCTION public.guard_daily_approval_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text;
  v_daily public.fuel_requests%ROWTYPE;
BEGIN
  SELECT code INTO v_module
    FROM public.approval_modules
   WHERE id = NEW.module_id;

  IF v_module <> 'diaria' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_daily
    FROM public.fuel_requests
   WHERE id = NEW.reference_id
     AND type = 'diaria';

  IF NOT FOUND
     OR v_daily.data_abastecimento < current_date
     OR v_daily.daily_end_date IS NULL
     OR v_daily.daily_end_date < v_daily.data_abastecimento
     OR v_daily.daily_days IS DISTINCT FROM ((v_daily.daily_end_date - v_daily.data_abastecimento) + 1)
     OR COALESCE(v_daily.daily_value, 0) <= 0
     OR v_daily.valor IS DISTINCT FROM round((v_daily.daily_days::numeric * v_daily.daily_value), 2)
     OR v_daily.valor <= 0 OR v_daily.valor > 50000
     OR NULLIF(trim(v_daily.daily_category), '') IS NULL
     OR NULLIF(trim(v_daily.person_name), '') IS NULL
     OR NULLIF(trim(v_daily.motivo), '') IS NULL
     OR (v_daily.hours IS NOT NULL AND (v_daily.hours <= 0 OR v_daily.hours > 24))
     OR COALESCE(v_daily.payment_method, '') NOT IN ('pix','banco')
     OR (v_daily.payment_method = 'pix' AND NULLIF(trim(v_daily.pix_key), '') IS NULL)
     OR (v_daily.payment_method = 'banco' AND (
          NULLIF(trim(v_daily.bank_name), '') IS NULL
          OR NULLIF(trim(v_daily.bank_agency), '') IS NULL
          OR NULLIF(trim(v_daily.bank_account), '') IS NULL
        ))
  THEN
    RAISE EXCEPTION 'DAILY_SUBMISSION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_daily_approval_submission ON public.approval_requests;
CREATE TRIGGER tr_guard_daily_approval_submission
BEFORE INSERT ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_daily_approval_submission();

REVOKE ALL ON FUNCTION public.guard_daily_approval_submission()
  FROM PUBLIC, anon, authenticated;
