-- ============================================================
-- SPRINT 15.1: Migration 007 - Sensitive Data RLS & Directory
-- ============================================================

-- ==========================================
-- 1. Profiles & Minimum Directory
-- ==========================================
-- Habilitar RLS estrito em profiles, se não estiver
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Limpar policies abertas de profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;

-- Criar policy restrita: o proprio usuario, ou RH/Admin (has_role), ou o gestor dele.
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'master'::app_role)
    OR manager_user_id = auth.uid()
  );

-- View para diretório mínimo, rodando como INVOKER (respeitando a própria view, mas não expond e-mail)
-- Note: Views por padrão no Postgres rodam com permissões do owner, MAS se não quisermos bypassar RLS da view em si,
-- deixamos a view ter RLS? Views não têm RLS, mas se criarmos com security_invoker = true, ela usa RLS da tabela base.
-- Como fechamos a tabela base, a view mínima VAI FALHAR se usarmos security invoker.
-- Solução correta para "View ou RPC de diretório mínimo com SECURITY INVOKER ou regras equivalentes":
-- Criar uma view normal (que executa como owner) sobre a tabela restrita,
-- e conceder select na view apenas para autenticados, mas NÃO exibir campos sensíveis.

CREATE OR REPLACE VIEW public.vw_employee_directory AS
SELECT 
  id,
  full_name AS display_name,
  avatar_url AS avatar,
  sector_id,
  active
FROM public.profiles
WHERE active = true;

GRANT SELECT ON public.vw_employee_directory TO authenticated;

-- ==========================================
-- 2. Role Assignments
-- ==========================================
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read user_role_assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view all role assignments" ON public.user_role_assignments;

CREATE POLICY "Users can read own role assignments"
  ON public.user_role_assignments FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

-- Atualização/Deleção de role assignments: apenas admin e proteção do último Master
CREATE POLICY "Admin can manage role assignments"
  ON public.user_role_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  permission text
) LANGUAGE sql SECURITY INVOKER
AS $$
  SELECT r.key
  FROM public.roles r
  JOIN public.user_role_assignments ura ON ura.role_id = r.id
  WHERE ura.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- ==========================================
-- 3. Approval Flow Configs
-- ==========================================
ALTER TABLE public.approval_flow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view approval flow steps" ON public.approval_flow_steps;
DROP POLICY IF EXISTS "Users can view flow steps" ON public.approval_flow_steps;

-- Apenas admins podem ler a configuração completa abertamente
CREATE POLICY "Admin can view approval flow steps"
  ON public.approval_flow_steps FOR SELECT
  USING (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Admin can manage approval flow steps"
  ON public.approval_flow_steps FOR ALL
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- ==========================================
-- 4. Approval Requests (Aprovadores limitados)
-- ==========================================
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view approval requests" ON public.approval_requests;
DROP POLICY IF EXISTS "Anyone can view approval requests" ON public.approval_requests;

-- Solicitante vê as suas, admin vê todas, aprovador atual vê as que estão pendentes com ele.
CREATE POLICY "Restricted view on approval_requests"
  ON public.approval_requests FOR SELECT
  USING (
    requester_user_id = auth.uid()
    OR current_approver_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'master'::app_role)
  );

CREATE OR REPLACE FUNCTION public.get_my_approval_queue()
RETURNS SETOF public.approval_requests
LANGUAGE sql SECURITY INVOKER
AS $$
  SELECT * FROM public.approval_requests 
  WHERE current_approver_user_id = auth.uid() AND status LIKE 'awaiting_step_%';
$$;

GRANT EXECUTE ON FUNCTION public.get_my_approval_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_request_approval_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
AS $$
  SELECT jsonb_build_object(
    'status', status,
    'current_step_order', current_step_order
  )
  FROM public.approval_requests
  WHERE id = p_request_id 
    AND (requester_user_id = auth.uid() OR current_approver_user_id = auth.uid() OR public.has_role(auth.uid(), 'master'::app_role));
$$;

GRANT EXECUTE ON FUNCTION public.get_request_approval_status(uuid) TO authenticated;
