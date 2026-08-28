-- Checkpoint A: private, reproducible storage contract for Fleet requests.
-- Canonical path: requests/{fuel_request_id}/{attachment_type}/{file_name}

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'fleet',
  'fleet',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

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

  SELECT fr.id, fr.type
    INTO v_request_id, v_module
    FROM public.fuel_requests fr
   WHERE fr.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_ctx
    FROM public.get_entity_action_context(v_module, v_request_id);
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

  SELECT fr.id, fr.type
    INTO v_request_id, v_module
    FROM public.fuel_requests fr
   WHERE fr.id::text = (storage.foldername(p_object_name))[2];
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_ctx
    FROM public.get_entity_action_context(v_module, v_request_id);
  RETURN v_ctx.requester_user_id = auth.uid()
     AND (
       v_ctx.can_edit IS TRUE
       OR v_ctx.allowed_actions ? 'enviar_comprovantes'
     );
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_storage_can_read(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_storage_can_write(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_storage_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_storage_can_write(text) TO authenticated;

DROP POLICY IF EXISTS "Fleet request files are visible through Action Context" ON storage.objects;
CREATE POLICY "Fleet request files are visible through Action Context"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fleet'
  AND public.fleet_storage_can_read(name)
);

DROP POLICY IF EXISTS "Fleet requester can upload files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can upload files when allowed"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fleet'
  AND public.fleet_storage_can_write(name)
);

DROP POLICY IF EXISTS "Fleet requester can update files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can update files when allowed"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'fleet'
  AND public.fleet_storage_can_write(name)
)
WITH CHECK (
  bucket_id = 'fleet'
  AND public.fleet_storage_can_write(name)
);

DROP POLICY IF EXISTS "Fleet requester can delete files when allowed" ON storage.objects;
CREATE POLICY "Fleet requester can delete files when allowed"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'fleet'
  AND public.fleet_storage_can_write(name)
);
