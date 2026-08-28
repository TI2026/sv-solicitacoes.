-- MVP 1.0 final authority convergence.
-- Remove obsolete callable mutation surfaces; the canonical workflow API is
-- execute_entity_action(module, entity, action, payload).

REVOKE ALL ON FUNCTION public.soft_delete_request(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.advance_purchase_to_oc(
  uuid, text, text, numeric, text, text, date, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_purchase_request(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_delivery(
  uuid, text, date, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_payment(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_purchase_receipt(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Read helpers that accept an arbitrary identity/entity and have no frontend
-- consumer remain internal. Self-scoped/policy helpers keep their grants.
REVOKE ALL ON FUNCTION public.current_user_id()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_request_approval_status(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- Trigger functions are invoked by PostgreSQL, never by PostgREST callers.
REVOKE ALL ON FUNCTION public.check_single_active_flow_per_module()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vehicles_normalize()
  FROM PUBLIC, anon, authenticated;
