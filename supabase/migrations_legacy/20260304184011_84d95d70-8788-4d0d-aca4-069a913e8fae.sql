
-- Fix: track_status_change trigger uses OLD.status but candidates table has status_triagem
-- Use to_jsonb safe access to handle different column names

CREATE OR REPLACE FUNCTION public.track_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _old_status text;
  _new_status text;
BEGIN
  -- Safe access: try 'status' first, then 'status_triagem'
  _old_status := COALESCE(
    to_jsonb(OLD)->>'status',
    to_jsonb(OLD)->>'status_triagem'
  );
  _new_status := COALESCE(
    to_jsonb(NEW)->>'status',
    to_jsonb(NEW)->>'status_triagem'
  );

  IF _old_status IS DISTINCT FROM _new_status THEN
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (
      TG_ARGV[0],
      TG_TABLE_NAME,
      NEW.id,
      _old_status,
      _new_status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;
