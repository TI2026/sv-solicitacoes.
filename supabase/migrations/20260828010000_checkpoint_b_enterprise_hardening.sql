-- CHECKPOINT B — enterprise authorization, integrity and storage hardening.
-- Incremental only: published migrations remain immutable and V2 stays inactive.

-- ---------------------------------------------------------------------------
-- 1. Effective table privileges: RLS never protects TRUNCATE.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.approval_modules,
  public.approval_flows,
  public.approval_flow_steps,
  public.approval_requests,
  public.approval_request_steps,
  public.roles,
  public.user_roles,
  public.user_role_assignments,
  public.role_permission_matrix,
  public.permission_modules,
  public.permission_actions,
  public.user_permission_overrides,
  public.user_effective_permissions
FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Effective RPC grants: public endpoints are explicit; trigger and legacy
--    workflow helpers are not callable from the API.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.replace_approval_flow_steps(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_purchase_request(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_rebuild_permissions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchases_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_v2_template_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_master_role_escalation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_roles_master_flag()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_last_master_removal()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_status_change()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.current_has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_has_role(public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_has_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;
REVOKE ALL ON FUNCTION public.user_participates_in_approval(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_participates_in_approval(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Action Context predicates shared by entity, attachment and Storage RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_action_context_can_read(
  p_module text,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx public.entity_action_context;
BEGIN
  IF auth.uid() IS NULL OR p_entity_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_ctx
    FROM public.get_entity_action_context(p_module, p_entity_id);
  RETURN v_ctx.entity_id = p_entity_id;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_attachment_can_write(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text;
  v_ctx public.entity_action_context;
BEGIN
  SELECT type INTO v_type FROM public.fuel_requests WHERE id = p_request_id;
  IF NOT FOUND OR auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_ctx
    FROM public.get_entity_action_context(v_type, p_request_id);
  RETURN v_ctx.requester_user_id = auth.uid()
     AND (v_ctx.can_edit IS TRUE OR v_ctx.allowed_actions ? 'enviar_comprovantes');
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_attachment_can_write(p_purchase_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx public.entity_action_context;
BEGIN
  IF auth.uid() IS NULL OR p_purchase_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_ctx
    FROM public.get_entity_action_context('compras', p_purchase_id);
  RETURN v_ctx.requester_user_id = auth.uid() AND v_ctx.can_edit IS TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.entity_action_context_can_read(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_attachment_can_write(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_attachment_can_write(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_action_context_can_read(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_attachment_can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_attachment_can_write(uuid) TO authenticated;

-- Entity visibility follows RBAC + workflow participation through Action Context.
DROP POLICY IF EXISTS "Admins can view all fuel requests" ON public.fuel_requests;
DROP POLICY IF EXISTS "Requester can view own fuel requests" ON public.fuel_requests;
DROP POLICY IF EXISTS "Checkpoint B Action Context views fuel requests" ON public.fuel_requests;
CREATE POLICY "Checkpoint B Action Context views fuel requests"
ON public.fuel_requests FOR SELECT TO authenticated
USING (public.entity_action_context_can_read(type, id));

DROP POLICY IF EXISTS "Workflow participants view admissions" ON public.admission_requests;
CREATE POLICY "Workflow participants view admissions"
ON public.admission_requests FOR SELECT TO authenticated
USING (public.entity_action_context_can_read('admissoes', id));

DROP POLICY IF EXISTS "Workflow participants view terminations" ON public.termination_requests;
CREATE POLICY "Workflow participants view terminations"
ON public.termination_requests FOR SELECT TO authenticated
USING (public.entity_action_context_can_read('desligamentos', id));

-- Raw privileged updates are not workflow APIs.
DROP POLICY IF EXISTS "Admins can update fuel requests" ON public.fuel_requests;
DROP POLICY IF EXISTS "Requester can update own draft fuel requests" ON public.fuel_requests;
CREATE POLICY "Requester edits own mutable fuel request"
ON public.fuel_requests FOR UPDATE TO authenticated
USING (
  requester_user_id = auth.uid()
  AND status::text IN ('rascunho', 'retornado')
)
WITH CHECK (
  requester_user_id = auth.uid()
  AND status::text IN ('rascunho', 'retornado')
);

DROP POLICY IF EXISTS purchases_update_own_draft ON public.purchases;
CREATE POLICY purchases_update_own_mutable
ON public.purchases FOR UPDATE TO authenticated
USING (
  requester_user_id = auth.uid()
  AND status IN ('rascunho', 'retornado')
)
WITH CHECK (
  requester_user_id = auth.uid()
  AND status IN ('rascunho', 'retornado')
);

-- ---------------------------------------------------------------------------
-- 4. Controlled fields: direct SQL/API cannot impersonate workflow side effects.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchases_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
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

CREATE OR REPLACE FUNCTION public.fuel_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
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
     OR NEW.daily_quantity IS DISTINCT FROM OLD.daily_quantity
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
  THEN
    RAISE EXCEPTION 'FUEL_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admission_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id THEN
    RAISE EXCEPTION 'ADMISSION_CONTROLLED_FIELD_DENIED: use execute_entity_action';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.termination_requests_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
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

DROP TRIGGER IF EXISTS tr_admission_requests_guard_controlled_fields ON public.admission_requests;
CREATE TRIGGER tr_admission_requests_guard_controlled_fields
BEFORE UPDATE ON public.admission_requests
FOR EACH ROW EXECUTE FUNCTION public.admission_requests_guard_controlled_fields();

DROP TRIGGER IF EXISTS tr_termination_requests_guard_controlled_fields ON public.termination_requests;
CREATE TRIGGER tr_termination_requests_guard_controlled_fields
BEFORE UPDATE ON public.termination_requests
FOR EACH ROW EXECUTE FUNCTION public.termination_requests_guard_controlled_fields();

REVOKE ALL ON FUNCTION public.purchases_guard_controlled_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_requests_guard_controlled_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admission_requests_guard_controlled_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.termination_requests_guard_controlled_fields() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Attachment metadata obeys the same state gate as private Storage.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Requester can manage own attachments" ON public.fuel_attachments;
DROP POLICY IF EXISTS "Admins can view all attachments" ON public.fuel_attachments;

CREATE POLICY "Action Context reads fuel attachments"
ON public.fuel_attachments FOR SELECT TO authenticated
USING (public.entity_action_context_can_read(
  (SELECT fr.type FROM public.fuel_requests fr WHERE fr.id = fuel_request_id),
  fuel_request_id
));

CREATE POLICY "Action Context inserts fuel attachments"
ON public.fuel_attachments FOR INSERT TO authenticated
WITH CHECK (public.fleet_attachment_can_write(fuel_request_id));

CREATE POLICY "Action Context updates fuel attachments"
ON public.fuel_attachments FOR UPDATE TO authenticated
USING (public.fleet_attachment_can_write(fuel_request_id))
WITH CHECK (public.fleet_attachment_can_write(fuel_request_id));

CREATE POLICY "Action Context deletes fuel attachments"
ON public.fuel_attachments FOR DELETE TO authenticated
USING (public.fleet_attachment_can_write(fuel_request_id));

-- ---------------------------------------------------------------------------
-- 6. Purchase Storage: private, bounded and authorized by Action Context.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','application/pdf']::text[]
WHERE id = 'purchase-attachments';

CREATE OR REPLACE FUNCTION public.purchase_storage_can_read(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE v_purchase_id uuid;
BEGIN
  IF (storage.foldername(p_object_name))[1] IS DISTINCT FROM 'requests' THEN RETURN false; END IF;
  SELECT p.id INTO v_purchase_id
  FROM public.purchases p
  WHERE p.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.entity_action_context_can_read('compras', v_purchase_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_storage_can_write(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE v_purchase_id uuid;
BEGIN
  IF (storage.foldername(p_object_name))[1] IS DISTINCT FROM 'requests' THEN RETURN false; END IF;
  SELECT p.id INTO v_purchase_id
  FROM public.purchases p
  WHERE p.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.purchase_attachment_can_write(v_purchase_id);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_storage_can_read(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_storage_can_write(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_storage_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_storage_can_write(text) TO authenticated;

DROP POLICY IF EXISTS "Users can read own purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Action Context reads purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Action Context inserts purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Action Context updates purchase files" ON storage.objects;
DROP POLICY IF EXISTS "Action Context deletes purchase files" ON storage.objects;

CREATE POLICY "Action Context reads purchase files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'purchase-attachments' AND public.purchase_storage_can_read(name));

CREATE POLICY "Action Context inserts purchase files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'purchase-attachments' AND public.purchase_storage_can_write(name));

CREATE POLICY "Action Context updates purchase files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'purchase-attachments' AND public.purchase_storage_can_write(name))
WITH CHECK (bucket_id = 'purchase-attachments' AND public.purchase_storage_can_write(name));

CREATE POLICY "Action Context deletes purchase files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'purchase-attachments' AND public.purchase_storage_can_write(name));

-- ---------------------------------------------------------------------------
-- 7. Audit integrity: client telemetry stays usable but cannot impersonate
--    authoritative workflow/security events. Request-limit changes are audited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_audit_log_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_action text := lower(trim(NEW.action));
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUDIT_AUTH_REQUIRED'; END IF;
  NEW.user_id := auth.uid();
  IF v_action LIKE 'approval_%'
     OR v_action LIKE 'master_%'
     OR v_action LIKE 'role_%'
     OR v_action LIKE 'engine_%'
     OR v_action IN (
       'submit_for_approval','resubmit_after_return','soft_delete','cancel',
       'generate_oc','confirm_payment','confirm_delivery','confirm_receipt',
       'payment','offboarding','send','approve','return','reject'
     ) THEN
    RAISE EXCEPTION 'AUDIT_AUTHORITATIVE_EVENT_DENIED';
  END IF;
  NEW.details := COALESCE(NEW.details, '{}'::jsonb)
    || jsonb_build_object('audit_source', 'client_telemetry');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_audit_log_client_insert ON public.audit_logs;
CREATE TRIGGER tr_guard_audit_log_client_insert
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_audit_log_client_insert();

CREATE OR REPLACE FUNCTION public.audit_request_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'REQUEST_LIMIT_' || TG_OP, 'request_limits',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_request_limit_change ON public.request_limits;
CREATE TRIGGER tr_audit_request_limit_change
AFTER INSERT OR UPDATE OR DELETE ON public.request_limits
FOR EACH ROW EXECUTE FUNCTION public.audit_request_limit_change();

REVOKE ALL ON FUNCTION public.guard_audit_log_client_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_request_limit_change() FROM PUBLIC, anon, authenticated;
