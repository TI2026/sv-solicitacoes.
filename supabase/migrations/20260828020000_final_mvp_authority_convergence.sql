-- MVP 1.0 final authority convergence.
-- Remove obsolete callable mutation surfaces; the canonical workflow API is
-- execute_entity_action(module, entity, action, payload).

-- Some legacy Lovable environments no longer contain every retired helper.
-- Revoke only functions that still exist so the security convergence remains
-- replayable across both the consolidated baseline and the hosted schema.
DO $revoke_obsolete$
DECLARE
  v_signature text;
  v_function regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.soft_delete_request(uuid,text)',
    'public.advance_purchase_to_oc(uuid,text,text,numeric,text,text,date,text)',
    'public.cancel_purchase_request(uuid,text)',
    'public.confirm_purchase_delivery(uuid,text,date,text,text)',
    'public.confirm_purchase_payment(uuid,text)',
    'public.confirm_purchase_receipt(uuid,text)',
    'public.current_user_id()',
    'public.get_request_approval_status(uuid)',
    'public.has_permission(uuid,text,text)',
    'public.check_single_active_flow_per_module()',
    'public.set_updated_at()',
    'public.vehicles_normalize()'
  ] LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        v_function
      );
    END IF;
  END LOOP;
END;
$revoke_obsolete$;
