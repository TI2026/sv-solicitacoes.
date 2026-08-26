-- Checkpoint B: consolidate database authority boundaries without changing
-- published migrations or the approved V2 templates.

-- ---------------------------------------------------------------------------
-- 1. Purchases: every workflow, financial and operational field is owned by
--    the canonical executor. Even Master must use execute_entity_action.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchases_guard_controlled_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER engine functions and trusted platform roles run as owner.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
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

REVOKE ALL ON FUNCTION public.purchases_guard_controlled_fields()
  FROM PUBLIC, anon, authenticated;

-- A workflow participant may read the entity only when the approval request
-- belongs to the exact (module, entity) pair. This prevents UUID collisions
-- between business tables from granting cross-module access.
DROP POLICY IF EXISTS purchases_select_approver ON public.purchases;
CREATE POLICY purchases_select_workflow_participant
ON public.purchases FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
     WHERE am.code = 'compras'
       AND ar.reference_id = purchases.id
       AND (
         ar.current_approver_user_id = auth.uid()
         OR public.user_participates_in_approval(ar.id, auth.uid())
       )
  )
);

CREATE POLICY fuel_requests_select_workflow_participant
ON public.fuel_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
     WHERE am.code = fuel_requests.type::text
       AND ar.reference_id = fuel_requests.id
       AND (
         ar.current_approver_user_id = auth.uid()
         OR public.user_participates_in_approval(ar.id, auth.uid())
       )
  )
);

CREATE POLICY admission_requests_select_workflow_participant
ON public.admission_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
     WHERE am.code = 'admissoes'
       AND ar.reference_id = admission_requests.id
       AND (
         ar.current_approver_user_id = auth.uid()
         OR public.user_participates_in_approval(ar.id, auth.uid())
       )
  )
);

CREATE POLICY termination_requests_select_workflow_participant
ON public.termination_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.approval_requests ar
      JOIN public.approval_modules am ON am.id = ar.module_id
     WHERE am.code = 'desligamentos'
       AND ar.reference_id = termination_requests.id
       AND (
         ar.current_approver_user_id = auth.uid()
         OR public.user_participates_in_approval(ar.id, auth.uid())
       )
  )
);

-- ---------------------------------------------------------------------------
-- 2. RBAC and V2 configuration: direct table writes are never authoritative.
--    The audited Master-only SECURITY DEFINER APIs remain the write surface.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Diretoria manages overrides" ON public.user_permission_overrides;
DROP POLICY IF EXISTS "Only diretoria can manage permissions" ON public.permissions;
DROP POLICY IF EXISTS "Only diretoria can manage role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "System manages effective perms" ON public.user_effective_permissions;
DROP POLICY IF EXISTS "Diretoria can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Diretoria manages approval_flows" ON public.approval_flows;
DROP POLICY IF EXISTS "Diretoria manages afs" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Admin can manage approval flow steps" ON public.approval_flow_steps;

-- Audit and status history are written by trusted triggers/executor functions,
-- never directly by a browser session.
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert status_history" ON public.status_history;

-- ---------------------------------------------------------------------------
-- 3. Function surface: retire legacy workflow/config entry points and remove
--    implicit PUBLIC execute from trigger/internal helpers.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_purchase_request(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_purchase_request(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_purchase_to_oc(uuid, text, text, numeric, text, text, date, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_payment(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_delivery(uuid, text, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_receipt(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_approval_flow_steps(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_last_master_removal()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_status_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_rebuild_permissions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_v2_template_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_master_role_escalation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_roles_master_flag()
  FROM PUBLIC, anon, authenticated;

-- Authenticated-only helpers are intentionally callable because they back RLS
-- and the signed-in session. Anonymous callers must not inherit PUBLIC execute.
REVOKE ALL ON FUNCTION public.current_has_role(public.app_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_has_role(public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_has_permission(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_id()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_id() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_roles(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_participates_in_approval(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_participates_in_approval(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_request(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_request(uuid, text) TO authenticated;

-- New functions created by subsequent migrations are closed by default and
-- must receive an explicit grant as part of their own contract.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
