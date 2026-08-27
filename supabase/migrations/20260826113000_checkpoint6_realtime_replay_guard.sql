-- CHECKPOINT 6 — replay guard for the published PII hardening migration.
--
-- 20260826113853 intentionally removes candidate PII from Realtime, but its
-- published DROP TABLE statements assume both tables are publication members.
-- A fresh local project does not make that assumption true.  This predecessor
-- is safe to apply later to an already-migrated remote: when the published
-- hardening version is present in migration history it is a no-op.  During a
-- fresh replay it temporarily adds only the missing tables; 20260826113853
-- immediately removes them again, preserving the final privacy contract.
DO $$
DECLARE
  v_hardening_already_applied boolean;
  v_table text;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260826113853'
  ) INTO v_hardening_already_applied;

  IF v_hardening_already_applied THEN
    RETURN;
  END IF;

  FOREACH v_table IN ARRAY ARRAY['candidates', 'candidate_documents'] LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
        FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = v_table
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;
