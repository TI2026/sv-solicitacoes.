-- Fix DB-004: Adicionar ON DELETE SET NULL em referências administrativas
-- Tabelas: user_role_assignments (assigned_by), user_permission_overrides (created_by), approval_modules (created_by)

DO $$
DECLARE
    rec RECORD;
    query text;
BEGIN
    -- user_role_assignments.assigned_by
    SELECT tc.constraint_name INTO rec 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
    WHERE tc.table_name = 'user_role_assignments' AND kcu.column_name = 'assigned_by' AND tc.constraint_type = 'FOREIGN KEY' LIMIT 1;
    IF rec.constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.user_role_assignments DROP CONSTRAINT ' || quote_ident(rec.constraint_name) || ';';
        EXECUTE 'ALTER TABLE public.user_role_assignments ADD CONSTRAINT user_role_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;';
    END IF;

    -- user_permission_overrides.created_by
    SELECT tc.constraint_name INTO rec 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
    WHERE tc.table_name = 'user_permission_overrides' AND kcu.column_name = 'created_by' AND tc.constraint_type = 'FOREIGN KEY' LIMIT 1;
    IF rec.constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.user_permission_overrides DROP CONSTRAINT ' || quote_ident(rec.constraint_name) || ';';
        EXECUTE 'ALTER TABLE public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;';
    END IF;

    -- approval_modules.created_by
    SELECT tc.constraint_name INTO rec 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
    WHERE tc.table_name = 'approval_modules' AND kcu.column_name = 'created_by' AND tc.constraint_type = 'FOREIGN KEY' LIMIT 1;
    IF rec.constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.approval_modules DROP CONSTRAINT ' || quote_ident(rec.constraint_name) || ';';
        EXECUTE 'ALTER TABLE public.approval_modules ADD CONSTRAINT approval_modules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;';
    END IF;
END $$;
