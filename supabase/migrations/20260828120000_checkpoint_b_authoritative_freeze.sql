-- Checkpoint B: close the remaining direct-write surfaces.
-- Incremental only. V2 activation and business data are intentionally untouched.

-- Workflow notifications are persisted by trusted backend code only.
DROP POLICY IF EXISTS "Authenticated can insert own notifications"
ON public.notifications;
REVOKE INSERT ON TABLE public.notifications FROM authenticated;

-- Purchase approver visibility must be scoped by module + reference.
DROP POLICY IF EXISTS purchases_select_approver ON public.purchases;
CREATE POLICY purchases_select_approver
ON public.purchases FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.approval_request_steps ars
    JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
    JOIN public.approval_modules am ON am.id = ar.module_id
    WHERE ar.reference_id = purchases.id
      AND am.code = 'compras'
      AND ars.approver_user_id = auth.uid()
  )
);

-- Draft creation is still direct CRUD, but system-controlled fields are never
-- accepted from an authenticated client. The workflow owner can mutate them
-- through SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.purchases_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL
       OR NEW.requester_user_id IS DISTINCT FROM auth.uid()
       OR NEW.status IS DISTINCT FROM 'rascunho'
       OR NEW.approved_value IS NOT NULL
       OR NEW.purchase_number IS NOT NULL
       OR NEW.approval_request_id IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.purchase_notes IS NOT NULL
       OR NEW.delivery_address IS NOT NULL
       OR NEW.delivery_date IS NOT NULL
       OR NEW.tracking_code IS NOT NULL
       OR NEW.confirmed_at IS NOT NULL
       OR NEW.confirmed_by IS NOT NULL
    THEN
      RAISE EXCEPTION 'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_value IS DISTINCT FROM OLD.approved_value
     OR NEW.purchase_number IS DISTINCT FROM OLD.purchase_number
     OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.purchase_notes IS DISTINCT FROM OLD.purchase_notes
     OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
     OR NEW.delivery_date IS DISTINCT FROM OLD.delivery_date
     OR NEW.tracking_code IS DISTINCT FROM OLD.tracking_code
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
  THEN
    RAISE EXCEPTION 'PURCHASE_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_purchases_guard_controlled_fields ON public.purchases;
CREATE TRIGGER tr_purchases_guard_controlled_fields
BEFORE INSERT OR UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.purchases_guard_controlled_fields();

CREATE OR REPLACE FUNCTION public.fuel_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL
       OR NEW.requester_user_id IS DISTINCT FROM auth.uid()
       OR NEW.status::text IS DISTINCT FROM 'rascunho'
       OR NEW.assigned_to_user_id IS NOT NULL
       OR NEW.reviewed_by IS NOT NULL
       OR NEW.reviewed_at IS NOT NULL
       OR NEW.review_notes IS NOT NULL
       OR NEW.oc_number IS NOT NULL
       OR NEW.oc_notes IS NOT NULL
       OR NEW.oc_uploaded_by IS NOT NULL
       OR NEW.oc_uploaded_at IS NOT NULL
       OR NEW.payment_due_date IS NOT NULL
       OR NEW.paid_at IS NOT NULL
       OR NEW.paid_by IS NOT NULL
       OR NEW.payment_notes IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.deleted_by IS NOT NULL
    THEN
      RAISE EXCEPTION 'FUEL_CONTROLLED_FIELD_DENIED: use execute_entity_action';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.oc_number IS DISTINCT FROM OLD.oc_number
     OR NEW.oc_notes IS DISTINCT FROM OLD.oc_notes
     OR NEW.oc_uploaded_by IS DISTINCT FROM OLD.oc_uploaded_by
     OR NEW.oc_uploaded_at IS DISTINCT FROM OLD.oc_uploaded_at
     OR NEW.payment_due_date IS DISTINCT FROM OLD.payment_due_date
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.payment_notes IS DISTINCT FROM OLD.payment_notes
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  THEN
    RAISE EXCEPTION 'FUEL_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fuel_requests_guard_controlled_fields ON public.fuel_requests;
CREATE TRIGGER tr_fuel_requests_guard_controlled_fields
BEFORE INSERT OR UPDATE ON public.fuel_requests
FOR EACH ROW EXECUTE FUNCTION public.fuel_requests_guard_controlled_fields();

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

DROP TRIGGER IF EXISTS tr_termination_requests_guard_controlled_fields
ON public.termination_requests;
CREATE TRIGGER tr_termination_requests_guard_controlled_fields
BEFORE INSERT OR UPDATE ON public.termination_requests
FOR EACH ROW EXECUTE FUNCTION public.termination_requests_guard_controlled_fields();

REVOKE ALL ON FUNCTION public.purchases_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_requests_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admission_requests_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.termination_requests_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
