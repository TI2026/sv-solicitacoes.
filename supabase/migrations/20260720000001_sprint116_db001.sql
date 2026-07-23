-- Fix DB-001: Adicionar ON DELETE SET NULL em todas as referências a sectors
-- Tabelas afetadas: collaborators, epi_deliveries, epi_deliveries_items, profiles, approval_flow_steps

DO $$
DECLARE
    rec RECORD;
    query text;
BEGIN
    -- Lista de tabelas e colunas que referenciam public.sectors
    FOR rec IN 
        SELECT 
            tc.table_name, 
            kcu.column_name, 
            tc.constraint_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_name = 'sectors'
          AND tc.table_schema = 'public'
    LOOP
        -- Remove a constraint existente
        query := 'ALTER TABLE public.' || quote_ident(rec.table_name) || ' DROP CONSTRAINT ' || quote_ident(rec.constraint_name) || ';';
        EXECUTE query;
        
        -- Adiciona a nova constraint com ON DELETE SET NULL
        query := 'ALTER TABLE public.' || quote_ident(rec.table_name) || 
                 ' ADD CONSTRAINT ' || quote_ident(rec.table_name || '_' || rec.column_name || '_fkey') || 
                 ' FOREIGN KEY (' || quote_ident(rec.column_name) || ') REFERENCES public.sectors(id) ON DELETE SET NULL;';
        EXECUTE query;
    END LOOP;
END $$;
