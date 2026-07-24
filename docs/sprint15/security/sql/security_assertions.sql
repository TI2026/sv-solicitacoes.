-- ============================================================
-- SPRINT 15.1: Security Assertions & Regression Tests
-- ============================================================

-- 1. Check Ownership (start_approval_flow)
DO $$
DECLARE
  res jsonb;
  test_module text := 'compras';
  test_ref uuid := gen_random_uuid();
  mock_uid uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Should fail if caller tries to impersonate without permission
  -- Note: psql runs as postgres, but let's assume we invoke via RPC locally
  -- We can't perfectly mock auth.uid() in plain SQL without set_config, 
  -- but we can test if the function blocks null auth.uid.
  SELECT set_config('request.jwt.claims', '{"sub":"' || mock_uid || '"}', true) INTO res;
  
  -- try to impersonate
  BEGIN
    SELECT public.start_approval_flow(test_module, test_ref, gen_random_uuid()) INTO res;
    -- Since mock_uid has no permissions, should return error
    IF res->>'error' IS NULL THEN
      RAISE EXCEPTION 'FAIL: start_approval_flow allowed impersonation without permission';
    END IF;
  END;

  RAISE NOTICE 'PASS: Ownership checks in start_approval_flow';
END $$;

-- 2. Role Assignments
DO $$
DECLARE
  cnt integer;
BEGIN
  -- As public/anon, reading user_role_assignments should return 0 rows or fail
  SET ROLE anon;
  SELECT count(*) INTO cnt FROM public.user_role_assignments;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'FAIL: anon can read user_role_assignments';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS: Role Assignments enumeration blocked';
END $$;

-- 3. Profiles
DO $$
DECLARE
  cnt integer;
BEGIN
  -- As anon, reading profiles should return 0 rows
  SET ROLE anon;
  SELECT count(*) INTO cnt FROM public.profiles;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'FAIL: anon can read profiles';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS: Profiles enumeration blocked';
END $$;

-- 4. Function Grants
DO $$
DECLARE
  has_grant boolean;
BEGIN
  -- PUBLIC should not have execute on start_approval_flow
  SELECT has_function_privilege('PUBLIC', 'public.start_approval_flow(text, uuid, uuid)', 'EXECUTE') INTO has_grant;
  IF has_grant THEN
    RAISE EXCEPTION 'FAIL: PUBLIC has EXECUTE on start_approval_flow';
  END IF;
  RAISE NOTICE 'PASS: Function grants secured';
END $$;
