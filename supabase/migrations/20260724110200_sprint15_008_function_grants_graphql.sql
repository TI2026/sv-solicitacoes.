-- ============================================================
-- SPRINT 15.1: Migration 008 - Function Grants & GraphQL
-- ============================================================

-- 1. Security Definer & Grants
-- Vamos usar um DO block para revogar EXECUTE de PUBLIC e anon de todas as funcoes publicas sensiveis
DO $$
DECLARE
  func record;
BEGIN
  FOR func IN 
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname IN (
        'has_role', 'has_permission', 'start_approval_flow', 'process_approval_action', 
        'create_profile_for_user', 'assign_role', 'remove_role', 'termination_set_status'
      )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func.sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || func.sig || ' FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION '  || func.sig || ' TO authenticated';
  END LOOP;
END
$$;

-- Alterar helpers internos para SECURITY INVOKER para reduzir a superficie de escalonamento de privilegios
DO $$
DECLARE
  func record;
BEGIN
  FOR func IN 
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname IN ('has_role', 'has_permission')
  LOOP
    EXECUTE 'ALTER FUNCTION ' || func.sig || ' SECURITY INVOKER';
  END LOOP;
END
$$;

-- 2. Restringir visibilidade GraphQL e PostgREST para o publico (anon)
-- Revogar tudo do 'anon' nas tabelas sensiveis
REVOKE ALL ON public.user_role_assignments FROM anon;
REVOKE ALL ON public.roles FROM anon;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.approval_requests FROM anon;
REVOKE ALL ON public.approval_flow_steps FROM anon;
REVOKE ALL ON public.approval_flows FROM anon;
REVOKE ALL ON public.approval_modules FROM anon;

-- Ocultar tabelas sensíveis administrativas do GraphQL por completo
COMMENT ON TABLE public.user_role_assignments IS '@graphql({"omit": true})';
COMMENT ON TABLE public.roles IS '@graphql({"omit": true})';
COMMENT ON TABLE public.permissions IS '@graphql({"omit": true})';
COMMENT ON TABLE public.role_permissions IS '@graphql({"omit": true})';
COMMENT ON TABLE public.approval_flows IS '@graphql({"omit": true})';
COMMENT ON TABLE public.approval_flow_steps IS '@graphql({"omit": true})';
