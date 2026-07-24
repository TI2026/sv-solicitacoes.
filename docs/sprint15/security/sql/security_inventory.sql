-- 1. Security Definer functions and ownership
SELECT
  n.nspname AS schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef,
  p.proowner::regrole AS owner,
  p.proconfig,
  p.proacl,
  pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private', 'security')
ORDER BY n.nspname, p.proname;

-- 2. Grants for PUBLIC, anon, authenticated
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_schema, table_name, grantee, privilege_type;

-- 3. Row Level Security on tables
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename;

-- 4. Policies on tables
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 5. Views and Materialized Views (can bypass RLS if not security invoker)
SELECT 
  schemaname, 
  viewname, 
  viewowner 
FROM pg_views 
WHERE schemaname = 'public';

SELECT 
  schemaname, 
  matviewname, 
  matviewowner 
FROM pg_matviews 
WHERE schemaname = 'public';
