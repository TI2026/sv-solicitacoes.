-- Fix DB-002: Adicionar ON DELETE RESTRICT na tabela epi_deliveries para epi_item_id

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
      AND tc.table_name = 'epi_deliveries'
      AND kcu.column_name = 'epi_item_id'
      AND ccu.table_name = 'epi_items'
      AND tc.table_schema = 'public'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.epi_deliveries DROP CONSTRAINT ' || quote_ident(fk_name) || ';';
    END IF;

    ALTER TABLE public.epi_deliveries ADD CONSTRAINT epi_deliveries_epi_item_id_fkey FOREIGN KEY (epi_item_id) REFERENCES public.epi_items(id) ON DELETE RESTRICT;
END $$;
