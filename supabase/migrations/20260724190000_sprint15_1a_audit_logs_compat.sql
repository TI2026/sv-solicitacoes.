-- ==============================================================================
-- Migration: 20260724190000_sprint15_1a_audit_logs_compat
-- Description: Criação do usuário de sistema na tabela auth.users para garantir 
--              compatibilidade com inserções automáticas na audit_logs que
--              utilizam o UUID 00000000-0000-0000-0000-000000000000.
--              Isso previne a violação da foreign key audit_logs_user_id_fkey.
-- ==============================================================================

INSERT INTO auth.users (id, aud, role, email)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'system@system.local'
)
ON CONFLICT DO NOTHING;
