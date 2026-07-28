-- ==============================================================================
-- Migration: 20260724200150_sprint15_1c_action_context_type_compat
-- Description: Adiciona atributos faltantes no tipo composto entity_action_context
--              que foram omitidos na migration 017 devido ao IF NOT EXISTS.
--              Isso garante que o tipo possua todos os campos usados pelas
--              funcoes e evita falhas no db lint e nos testes.
-- ==============================================================================

DO $$
DECLARE
    v_oid oid;
BEGIN
    SELECT typrelid INTO v_oid 
    FROM pg_type 
    WHERE typname = 'entity_action_context' 
      AND typnamespace = 'public'::regnamespace;
    
    IF v_oid IS NULL THEN
        RAISE EXCEPTION 'Tipo entity_action_context não encontrado!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'flow_version' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE flow_version TEXT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'current_step_order' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE current_step_order INT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'current_step_name' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE current_step_name TEXT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'next_step_order' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE next_step_order INT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'next_step_name' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE next_step_name TEXT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'next_responsible_rule' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE next_responsible_rule TEXT CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = v_oid AND attname = 'overdue' AND NOT attisdropped) THEN
        ALTER TYPE public.entity_action_context ADD ATTRIBUTE overdue BOOLEAN CASCADE;
    END IF;
END;
$$;
