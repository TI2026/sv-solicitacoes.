-- A. Histórico remoto
SELECT version, name, inserted_at FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;

-- B. Purchases
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'purchases';

SELECT DISTINCT status FROM public.purchases;

SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'purchases';

-- C. Approval Engine
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'approval_flows';
SELECT proname FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname IN ('process_approval_action', 'start_approval_flow', 'get_approval_context', 'get_domain_status');

-- D. RBAC
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('user_roles', 'app_role', 'roles', 'user_role_assignments');

-- E. Storage e Realtime
SELECT id, name, public FROM storage.buckets;
