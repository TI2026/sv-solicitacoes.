-- Remote release predecessor for the consolidated local migration chain.
-- This migration intentionally does not reconcile historical migration rows.
-- It only establishes the minimum effective schema required by the MVP release.

-- Fail before DDL when existing business data cannot be migrated safely by the
-- later notification uniqueness and V2 snapshot migrations.
DO $$
DECLARE
  v_count bigint;
BEGIN
  IF to_regprocedure('public.start_approval_flow(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_MISSING_START_FLOW_3ARG',
      DETAIL = 'public.start_approval_flow(text, uuid, uuid) is required by Checkpoint A.';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM (
      SELECT n.metadata->>'event_key'
        FROM public.notifications n
       WHERE nullif(n.metadata->>'event_key', '') IS NOT NULL
       GROUP BY n.metadata->>'event_key'
      HAVING count(*) > 1
    ) duplicate_events;

  IF v_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_DUPLICATE_NOTIFICATION_EVENT_KEYS',
      DETAIL = format('%s duplicated workflow event_key value(s) must be reviewed without deleting business data.', v_count);
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.approval_requests ar
    JOIN public.approval_flows f ON f.id = ar.flow_id
   WHERE ar.ended_at IS NULL
     AND f.version = 'v2'
     AND (
       f.active IS NOT TRUE
       OR f.module_id IS DISTINCT FROM ar.module_id
       OR NOT EXISTS (
         SELECT 1
           FROM public.approval_request_steps ars
          WHERE ars.approval_request_id = ar.id
       )
       OR EXISTS (
         SELECT 1
           FROM public.approval_request_steps ars
          WHERE ars.approval_request_id = ar.id
          GROUP BY ars.step_order
         HAVING count(*) > 1
       )
       OR EXISTS (
         SELECT 1
           FROM public.approval_request_steps ars
           LEFT JOIN public.approval_flow_steps afs
             ON afs.flow_id = ar.flow_id
            AND afs.step_order = ars.step_order
          WHERE ars.approval_request_id = ar.id
            AND afs.id IS NULL
       )
       OR EXISTS (
         SELECT 1
           FROM public.approval_flow_steps afs
          WHERE afs.flow_id = ar.flow_id
            AND NOT EXISTS (
              SELECT 1
                FROM public.approval_request_steps ars
               WHERE ars.approval_request_id = ar.id
                 AND ars.step_order = afs.step_order
            )
       )
       OR (
         ar.status = 'awaiting_step'
         AND (
           ar.current_approver_user_id IS NULL
           OR NOT EXISTS (
             SELECT 1
               FROM public.approval_request_steps ars
              WHERE ars.approval_request_id = ar.id
                AND ars.step_order = ar.current_step_order
                AND ars.status = 'pending'
                AND ars.approver_user_id = ar.current_approver_user_id
           )
         )
       )
       OR (
         ar.status = 'waiting_operational'
         AND ar.current_approver_user_id IS NOT NULL
       )
     );

  IF v_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_ACTIVE_V2_UNSAFE_FOR_SNAPSHOT',
      DETAIL = format('%s active V2 request(s) have a flow/step/actor state that cannot be snapshotted safely.', v_count);
  END IF;

  IF to_regclass('public.purchases') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_MISSING_PURCHASES_TABLE';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM storage.buckets b
     WHERE b.id IN ('admissions', 'purchases', 'purchase-attachments', 'epis')
       AND b.public IS TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_PUBLIC_SENSITIVE_BUCKET',
      DETAIL = 'Sensitive buckets must be private before the backend release.';
  END IF;

END;
$$;

-- The effective remote already has these buckets. The consolidated local
-- baseline may not have their configuration rows, so create only missing
-- private buckets without changing any existing bucket or object.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('admissions', 'admissions', false),
  ('purchase-attachments', 'purchase-attachments', false),
  ('epis', 'epis', false)
ON CONFLICT (id) DO NOTHING;

-- Local Sprint 15 already has this compatibility overload. The effective
-- remote predecessor does not. Checkpoint A revokes this exact signature, so
-- it must exist without exposing a new public entry point.
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_key text,
  p_entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  RETURN public.start_approval_flow(p_module_key, p_entity_id, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.start_approval_flow(text, uuid)
  FROM PUBLIC, anon, authenticated;

-- The consolidated remote predecessor lacks the operational purchase columns
-- introduced locally by 20260723130100. Add only nullable columns so existing
-- rows are preserved and no table rewrite/backfill is required.
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS purchase_notes text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

DO $$
DECLARE
  v_bad_columns text;
BEGIN
  SELECT string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_bad_columns
    FROM (VALUES
      ('purchase_notes', 'text'),
      ('delivery_address', 'text'),
      ('delivery_date', 'date'),
      ('tracking_code', 'text'),
      ('confirmed_at', 'timestamptz'),
      ('confirmed_by', 'uuid')
    ) expected(column_name, udt_name)
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = 'purchases'
     AND c.column_name = expected.column_name
   WHERE c.column_name IS NULL
      OR c.udt_name IS DISTINCT FROM expected.udt_name
      OR c.is_nullable IS DISTINCT FROM 'YES';

  IF v_bad_columns IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42804',
      MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_INCOMPATIBLE_PURCHASE_COLUMNS',
      DETAIL = 'Missing or incompatible nullable columns: ' || v_bad_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.purchases'::regclass
       AND c.confrelid = 'public.profiles'::regclass
       AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (confirmed_by) REFERENCES profiles(id)%'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_confirmed_by_fkey
      FOREIGN KEY (confirmed_by) REFERENCES public.profiles(id);
  END IF;
END;
$$;

-- Validate exact legacy policy targets before removing them. This prevents a
-- same-name policy with unrelated semantics from being dropped silently.
DO $$
DECLARE
  r record;
  v_expression text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Admins and RH can read admissions files', '''admissions'''),
      ('Admins and RH can upload admissions files', '''admissions'''),
      ('Admins RH read epis', '''epis'''),
      ('Admins RH upload epis', '''epis'''),
      ('Admins RH update epis', '''epis'''),
      ('Admins RH delete epis', '''epis'''),
      ('Purchases bucket requires authentication', 'purchase')
    ) legacy(policy_name, expected_marker)
  LOOP
    SELECT coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
      INTO v_expression
      FROM pg_policies p
     WHERE p.schemaname = 'storage'
       AND p.tablename = 'objects'
       AND p.policyname = r.policy_name;

    IF FOUND AND position(r.expected_marker IN v_expression) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'REMOTE_RELEASE_PREFLIGHT_UNEXPECTED_STORAGE_POLICY',
        DETAIL = format('Policy %I does not target the expected sensitive bucket.', r.policy_name);
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Admins and RH can read admissions files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and RH can upload admissions files" ON storage.objects;
DROP POLICY IF EXISTS "Admins RH read epis" ON storage.objects;
DROP POLICY IF EXISTS "Admins RH upload epis" ON storage.objects;
DROP POLICY IF EXISTS "Admins RH update epis" ON storage.objects;
DROP POLICY IF EXISTS "Admins RH delete epis" ON storage.objects;
DROP POLICY IF EXISTS "Purchases bucket requires authentication" ON storage.objects;
