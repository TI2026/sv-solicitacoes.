-- Compatibility bridge for the shared Git migration chain.
--
-- The historical local chain leaves start_approval_flow(text, uuid, uuid)
-- with input names p_module_key/p_entity_id. The later shared migration
-- 20260820122158 expects the remote predecessor state, where the same
-- signature already used p_module_code/p_reference_id.
--
-- On a clean local replay this removes only the incompatible intermediate
-- definition so 20260820122158 can create the expected function. If this
-- migration is ever applied out of order to an environment that already has
-- the final signature, the condition is false and the migration is a no-op.
DO $bridge$
DECLARE
  v_arg_names text[];
BEGIN
  SELECT p.proargnames
    INTO v_arg_names
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.start_approval_flow(text,uuid,uuid)');

  IF v_arg_names[1:3] = ARRAY[
    'p_module_key',
    'p_entity_id',
    'p_requester_user_id'
  ]::text[] THEN
    EXECUTE 'DROP FUNCTION public.start_approval_flow(text, uuid, uuid)';
  END IF;
END
$bridge$;
