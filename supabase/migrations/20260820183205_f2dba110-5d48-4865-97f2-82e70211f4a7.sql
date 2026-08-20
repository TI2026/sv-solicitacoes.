
-- ============ 1. PURCHASES: bloqueio de campos controlados pelo motor ============
CREATE OR REPLACE FUNCTION public.purchases_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Motor (SECURITY DEFINER, owner) e service_role passam livremente.
  IF current_user IN ('postgres','supabase_admin','service_role','supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF public.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_value IS DISTINCT FROM OLD.approved_value
     OR NEW.purchase_number IS DISTINCT FROM OLD.purchase_number
     OR NEW.approval_request_id IS DISTINCT FROM OLD.approval_request_id
     OR NEW.requester_user_id IS DISTINCT FROM OLD.requester_user_id
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'PURCHASE_CONTROLLED_FIELD_DENIED: campos de workflow/financeiro só podem ser alterados pelo motor de aprovação';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_purchases_guard_controlled_fields ON public.purchases;
CREATE TRIGGER tr_purchases_guard_controlled_fields
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.purchases_guard_controlled_fields();

-- ============ 2. STORAGE: ADMISSIONS ============
DROP POLICY IF EXISTS "Admissions bucket requires authentication" ON storage.objects;

DROP POLICY IF EXISTS "Admins and RH can update admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can update admissions files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'admissions' AND (public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role) OR public.current_has_role('rh'::app_role) OR public.current_has_role('master'::app_role)))
WITH CHECK (bucket_id = 'admissions' AND (public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role) OR public.current_has_role('rh'::app_role) OR public.current_has_role('master'::app_role)));

DROP POLICY IF EXISTS "Admins and RH can delete admissions files" ON storage.objects;
CREATE POLICY "Admins and RH can delete admissions files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'admissions' AND (public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role) OR public.current_has_role('rh'::app_role) OR public.current_has_role('master'::app_role)));

-- ============ 3. STORAGE: PURCHASES (restringir a authenticated + UPDATE explícito) ============
DROP POLICY IF EXISTS "Users can read own purchase files" ON storage.objects;
CREATE POLICY "Users can read own purchase files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'purchase-attachments' AND (
    public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role)
    OR public.current_has_role('master'::app_role) OR public.current_has_role('financeiro'::app_role)
    OR public.current_has_role('compras'::app_role)
    OR ((storage.foldername(name))[2] IN (SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "Users can upload own purchase files" ON storage.objects;
CREATE POLICY "Users can upload own purchase files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'purchase-attachments' AND (
    public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role)
    OR public.current_has_role('master'::app_role) OR public.current_has_role('compras'::app_role)
    OR ((storage.foldername(name))[2] IN (SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "Users can delete own purchase files" ON storage.objects;
CREATE POLICY "Users can delete own purchase files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'purchase-attachments' AND (
    public.current_has_role('diretoria'::app_role) OR public.current_has_role('administrativo'::app_role)
    OR public.current_has_role('master'::app_role)
    OR ((storage.foldername(name))[2] IN (SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()))
  )
);

-- ============ 4. STORAGE: EPIS (UPDATE explícito) ============
DROP POLICY IF EXISTS "Admins RH update epis" ON storage.objects;
CREATE POLICY "Admins RH update epis"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'epis' AND (public.has_role(auth.uid(),'diretoria'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role) OR public.has_role(auth.uid(),'rh'::app_role) OR public.has_role(auth.uid(),'master'::app_role)))
WITH CHECK (bucket_id = 'epis' AND (public.has_role(auth.uid(),'diretoria'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role) OR public.has_role(auth.uid(),'rh'::app_role) OR public.has_role(auth.uid(),'master'::app_role)));

-- ============ 5. DOCUMENTS: remover leitura anônima ============
DROP POLICY IF EXISTS "Public can view documents" ON public.documents;
REVOKE SELECT ON public.documents FROM anon;

-- ============ 6. APPROVAL_REQUESTS / STEPS: consolidar RLS ============
DROP POLICY IF EXISTS "System manages approval_requests" ON public.approval_requests;
DROP POLICY IF EXISTS "View relevant approval_requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Participants can view approval_requests" ON public.approval_requests;
-- resta apenas: "Restricted view on approval_requests" (SELECT)

DROP POLICY IF EXISTS "System manages ars" ON public.approval_request_steps;
DROP POLICY IF EXISTS "View relevant ars" ON public.approval_request_steps;
DROP POLICY IF EXISTS "Requester can view own request steps" ON public.approval_request_steps;
DROP POLICY IF EXISTS "Step approvers can view sibling steps" ON public.approval_request_steps;

CREATE POLICY "Restricted view on approval_request_steps"
ON public.approval_request_steps FOR SELECT TO authenticated
USING (
  approver_user_id = auth.uid()
  OR public.user_participates_in_approval(approval_request_id, auth.uid())
  OR public.has_role(auth.uid(), 'master'::app_role)
);

REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.approval_request_steps FROM authenticated;

-- ============ 7. ROLE ESCALATION: somente Master concede/remove Master ============
CREATE OR REPLACE FUNCTION public.guard_master_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_involves_master boolean := false;
  v_target uuid;
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'user_roles' THEN
    v_involves_master := (TG_OP <> 'DELETE' AND NEW.role = 'master'::app_role)
                      OR (TG_OP <> 'INSERT' AND OLD.role = 'master'::app_role);
    v_target := COALESCE(NEW.user_id, OLD.user_id);
  ELSE -- user_role_assignments
    v_involves_master := EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = COALESCE(NEW.role_id, OLD.role_id)
        AND (r.is_master = true OR r.key = 'master')
    );
    v_target := COALESCE(NEW.user_id, OLD.user_id);
  END IF;

  IF v_involves_master AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'MASTER_ROLE_DENIED: somente um Master pode conceder ou remover o papel Master';
  END IF;

  IF v_involves_master THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'MASTER_ROLE_' || TG_OP, TG_TABLE_NAME, v_target::text,
            jsonb_build_object('op', TG_OP, 'target_user', v_target));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_master_user_roles ON public.user_roles;
CREATE TRIGGER tr_guard_master_user_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_master_role_escalation();

DROP TRIGGER IF EXISTS tr_guard_master_user_role_assignments ON public.user_role_assignments;
CREATE TRIGGER tr_guard_master_user_role_assignments
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_master_role_escalation();

-- roles.is_master só pode ser alterado por Master
CREATE OR REPLACE FUNCTION public.guard_roles_master_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.is_master = true)
     OR (TG_OP = 'UPDATE' AND NEW.is_master IS DISTINCT FROM OLD.is_master) THEN
    IF NOT public.is_master(auth.uid()) THEN
      RAISE EXCEPTION 'MASTER_ROLE_DENIED: somente um Master pode alterar a flag Master de um papel';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_roles_master_flag ON public.roles;
CREATE TRIGGER tr_guard_roles_master_flag
  BEFORE INSERT OR UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_roles_master_flag();

-- ============ 8. FUNCTION GRANTS: helpers internos deixam de ser API pública ============
REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.process_approval_action(uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.admission_set_status(uuid, admission_status, text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fuel_set_status(uuid, fuel_status, text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.termination_set_status(uuid, termination_status, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
