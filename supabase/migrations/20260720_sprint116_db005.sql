-- Fix DB-005: Adicionar ON DELETE RESTRICT na tabela approval_flow_steps para approver_user_id
-- Conforme decisão arquitetural: nenhum aprovador pode ser excluído fisicamente enquanto vinculado a um fluxo.

DO $$
DECLARE
    fk_name text;
BEGIN
    SELECT 
        tc.constraint_name INTO fk_name
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = 'approval_flow_steps'
      AND kcu.column_name = 'approver_user_id'
      AND ccu.table_name = 'profiles'
      AND tc.table_schema = 'public'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.approval_flow_steps DROP CONSTRAINT ' || quote_ident(fk_name) || ';';
    END IF;

    ALTER TABLE public.approval_flow_steps ADD CONSTRAINT approval_flow_steps_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
END $$;
