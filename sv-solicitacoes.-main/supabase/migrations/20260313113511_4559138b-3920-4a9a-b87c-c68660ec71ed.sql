
-- ══════════════════════════════════════════════
-- RBAC ENTERPRISE + APPROVAL WORKFLOW
-- ══════════════════════════════════════════════

-- 1. Enhance roles table
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS parent_role_id uuid REFERENCES public.roles(id);
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_key_unique ON public.roles(key);

-- Update existing roles with names
UPDATE public.roles SET name = description WHERE (name = '' OR name IS NULL) AND description IS NOT NULL AND description != '';

-- Seed/upsert roles
INSERT INTO public.roles (key, description, name, active, is_system, is_master) VALUES
  ('master', 'Acesso total ao sistema', 'Master', true, true, true),
  ('supervisor', 'Supervisor de equipe', 'Supervisor', true, true, false),
  ('compras', 'Departamento de Compras', 'Compras', true, true, false),
  ('financeiro', 'Departamento Financeiro', 'Financeiro', true, true, false)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  is_system = EXCLUDED.is_system,
  is_master = EXCLUDED.is_master;

UPDATE public.roles SET name = 'Diretoria', is_system = true WHERE key = 'diretoria' AND name = '';
UPDATE public.roles SET name = 'Administrativo', is_system = true WHERE key = 'administrativo' AND name = '';
UPDATE public.roles SET name = 'Colaborador', is_system = true WHERE key = 'colaborador' AND name = '';
UPDATE public.roles SET name = 'RH', is_system = true WHERE key = 'rh' AND name = '';

-- Set hierarchy
UPDATE public.roles SET parent_role_id = (SELECT id FROM public.roles WHERE key = 'master') WHERE key = 'diretoria' AND parent_role_id IS NULL;
UPDATE public.roles SET parent_role_id = (SELECT id FROM public.roles WHERE key = 'diretoria') WHERE key IN ('supervisor', 'administrativo', 'rh', 'compras', 'financeiro', 'colaborador') AND parent_role_id IS NULL;

-- 2. Permission modules & actions
CREATE TABLE IF NOT EXISTS public.permission_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.permission_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.permission_actions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.permission_modules (code, name) VALUES
  ('dashboard', 'Dashboard'), ('abastecimento', 'Abastecimento'), ('reembolso', 'Reembolso'),
  ('diaria', 'Diária'), ('admissao', 'Admissão'), ('aprovacoes', 'Aprovações'),
  ('permissoes', 'Permissões'), ('usuarios', 'Usuários'), ('configuracoes', 'Configurações'),
  ('auditoria', 'Auditoria'), ('perfil', 'Meu Perfil')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permission_actions (code, name) VALUES
  ('view', 'Visualizar'), ('create', 'Criar'), ('edit', 'Editar'), ('delete', 'Excluir'),
  ('approve', 'Aprovar'), ('reject', 'Recusar'), ('return', 'Devolver'),
  ('manage', 'Gerenciar'), ('export', 'Exportar'), ('configure', 'Configurar')
ON CONFLICT (code) DO NOTHING;

-- 3. Role permission matrix
CREATE TABLE IF NOT EXISTS public.role_permission_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.permission_actions(id) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, module_id, action_id)
);
ALTER TABLE public.role_permission_matrix ENABLE ROW LEVEL SECURITY;

-- 4. User role assignments (new RBAC link, parallel to old user_roles)
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

-- 5. User permission overrides
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.permission_modules(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.permission_actions(id) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id, action_id)
);
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- 6. Effective permissions cache
CREATE TABLE IF NOT EXISTS public.user_effective_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.permission_modules(id),
  action_id uuid NOT NULL REFERENCES public.permission_actions(id),
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id, action_id)
);
ALTER TABLE public.user_effective_permissions ENABLE ROW LEVEL SECURITY;

-- 7. Approval tables
CREATE TABLE IF NOT EXISTS public.approval_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_modules ENABLE ROW LEVEL SECURITY;

INSERT INTO public.approval_modules (code, name) VALUES
  ('abastecimento', 'Abastecimento'), ('admissao', 'Admissão'),
  ('reembolso', 'Reembolso'), ('diaria', 'Diária')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.approval_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.approval_modules(id),
  name text NOT NULL,
  approval_type text NOT NULL CHECK (approval_type IN ('sequential', 'parallel')),
  active boolean NOT NULL DEFAULT true,
  require_rejection_reason boolean NOT NULL DEFAULT true,
  allow_return_for_adjustment boolean NOT NULL DEFAULT false,
  notify_next_approver boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_flows ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.approval_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.approval_flows(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES public.profiles(id),
  is_required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id, step_order)
);
ALTER TABLE public.approval_flow_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.approval_modules(id),
  flow_id uuid NOT NULL REFERENCES public.approval_flows(id),
  reference_id uuid NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id),
  current_step_order integer,
  current_approver_user_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending_approval',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.approval_request_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  flow_step_id uuid REFERENCES public.approval_flow_steps(id),
  step_order integer NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending',
  action_at timestamptz,
  comments text
);
ALTER TABLE public.approval_request_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  action_by uuid NOT NULL REFERENCES public.profiles(id),
  step_order integer,
  comments text,
  old_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies
DO $$ BEGIN
  -- permission_modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='permission_modules' AND policyname='Anyone can view permission_modules') THEN
    CREATE POLICY "Anyone can view permission_modules" ON public.permission_modules FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='permission_modules' AND policyname='Diretoria manages permission_modules') THEN
    CREATE POLICY "Diretoria manages permission_modules" ON public.permission_modules FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- permission_actions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='permission_actions' AND policyname='Anyone can view permission_actions') THEN
    CREATE POLICY "Anyone can view permission_actions" ON public.permission_actions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='permission_actions' AND policyname='Diretoria manages permission_actions') THEN
    CREATE POLICY "Diretoria manages permission_actions" ON public.permission_actions FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- role_permission_matrix
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permission_matrix' AND policyname='Anyone can view rpm') THEN
    CREATE POLICY "Anyone can view rpm" ON public.role_permission_matrix FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permission_matrix' AND policyname='Diretoria manages rpm') THEN
    CREATE POLICY "Diretoria manages rpm" ON public.role_permission_matrix FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- user_role_assignments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_role_assignments' AND policyname='Anyone can view ura') THEN
    CREATE POLICY "Anyone can view ura" ON public.user_role_assignments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_role_assignments' AND policyname='Diretoria manages ura') THEN
    CREATE POLICY "Diretoria manages ura" ON public.user_role_assignments FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- user_permission_overrides
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_permission_overrides' AND policyname='View own overrides') THEN
    CREATE POLICY "View own overrides" ON public.user_permission_overrides FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'diretoria'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_permission_overrides' AND policyname='Diretoria manages overrides') THEN
    CREATE POLICY "Diretoria manages overrides" ON public.user_permission_overrides FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- user_effective_permissions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_effective_permissions' AND policyname='View own effective perms') THEN
    CREATE POLICY "View own effective perms" ON public.user_effective_permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'diretoria'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_effective_permissions' AND policyname='System manages effective perms') THEN
    CREATE POLICY "System manages effective perms" ON public.user_effective_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- approval_modules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_modules' AND policyname='Anyone can view approval_modules') THEN
    CREATE POLICY "Anyone can view approval_modules" ON public.approval_modules FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_modules' AND policyname='Diretoria manages approval_modules') THEN
    CREATE POLICY "Diretoria manages approval_modules" ON public.approval_modules FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- approval_flows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_flows' AND policyname='Anyone can view approval_flows') THEN
    CREATE POLICY "Anyone can view approval_flows" ON public.approval_flows FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_flows' AND policyname='Diretoria manages approval_flows') THEN
    CREATE POLICY "Diretoria manages approval_flows" ON public.approval_flows FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- approval_flow_steps
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_flow_steps' AND policyname='Anyone can view afs') THEN
    CREATE POLICY "Anyone can view afs" ON public.approval_flow_steps FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_flow_steps' AND policyname='Diretoria manages afs') THEN
    CREATE POLICY "Diretoria manages afs" ON public.approval_flow_steps FOR ALL TO authenticated USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));
  END IF;
  -- approval_requests
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_requests' AND policyname='View relevant approval_requests') THEN
    CREATE POLICY "View relevant approval_requests" ON public.approval_requests FOR SELECT TO authenticated
      USING (requester_user_id = auth.uid() OR current_approver_user_id = auth.uid() OR has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_requests' AND policyname='System manages approval_requests') THEN
    CREATE POLICY "System manages approval_requests" ON public.approval_requests FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'))
      WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
  -- approval_request_steps
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_request_steps' AND policyname='View relevant ars') THEN
    CREATE POLICY "View relevant ars" ON public.approval_request_steps FOR SELECT TO authenticated
      USING (approver_user_id = auth.uid() OR has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_request_steps' AND policyname='System manages ars') THEN
    CREATE POLICY "System manages ars" ON public.approval_request_steps FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'))
      WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
  -- approval_history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_history' AND policyname='View relevant ah') THEN
    CREATE POLICY "View relevant ah" ON public.approval_history FOR SELECT TO authenticated
      USING (action_by = auth.uid() OR has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approval_history' AND policyname='System inserts ah') THEN
    CREATE POLICY "System inserts ah" ON public.approval_history FOR INSERT TO authenticated
      WITH CHECK (action_by = auth.uid() OR has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
  END IF;
END $$;

-- 9. RPCs

-- rebuild_user_permissions
CREATE OR REPLACE FUNCTION public.rebuild_user_permissions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role_id uuid;
  _role_ids uuid[] := '{}';
  _current_id uuid;
  _is_master boolean;
  _depth integer := 0;
BEGIN
  DELETE FROM public.user_effective_permissions WHERE user_id = p_user_id;

  SELECT ura.role_id INTO _role_id
  FROM public.user_role_assignments ura WHERE ura.user_id = p_user_id LIMIT 1;
  IF _role_id IS NULL THEN RETURN; END IF;

  SELECT is_master INTO _is_master FROM public.roles WHERE id = _role_id;
  IF _is_master THEN
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, pm.id, pa.id, true
    FROM public.permission_modules pm CROSS JOIN public.permission_actions pa
    WHERE pm.active AND pa.active
    ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = true;
    RETURN;
  END IF;

  _current_id := _role_id;
  WHILE _current_id IS NOT NULL AND _depth < 20 LOOP
    _role_ids := _role_ids || _current_id;
    SELECT parent_role_id INTO _current_id FROM public.roles WHERE id = _current_id;
    _depth := _depth + 1;
  END LOOP;

  _role_ids := ARRAY(SELECT unnest FROM unnest(_role_ids) WITH ORDINALITY ORDER BY ordinality DESC);

  FOR _current_id IN SELECT unnest(_role_ids) LOOP
    INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
    SELECT p_user_id, rpm.module_id, rpm.action_id, rpm.allowed
    FROM public.role_permission_matrix rpm WHERE rpm.role_id = _current_id
    ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = EXCLUDED.allowed;
  END LOOP;

  INSERT INTO public.user_effective_permissions (user_id, module_id, action_id, allowed)
  SELECT p_user_id, upo.module_id, upo.action_id, upo.allowed
  FROM public.user_permission_overrides upo WHERE upo.user_id = p_user_id
  ON CONFLICT (user_id, module_id, action_id) DO UPDATE SET allowed = EXCLUDED.allowed;
END;
$$;

-- has_permission
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_module_code text, p_action_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT uep.allowed
     FROM public.user_effective_permissions uep
     JOIN public.permission_modules pm ON pm.id = uep.module_id
     JOIN public.permission_actions pa ON pa.id = uep.action_id
     WHERE uep.user_id = p_user_id AND pm.code = p_module_code AND pa.code = p_action_code
     LIMIT 1),
    (SELECT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = p_user_id AND r.is_master)),
    false
  )
$$;

-- current_user_has_permission
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_module_code text, p_action_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_permission(auth.uid(), p_module_code, p_action_code) $$;

-- start_approval_flow
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code text, p_reference_id uuid, p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _module_id uuid; _flow RECORD; _step RECORD; _request_id uuid;
BEGIN
  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active;
  IF _module_id IS NULL THEN RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado'); END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE module_id = _module_id AND active LIMIT 1;
  IF _flow.id IS NULL THEN RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  SELECT * INTO _step FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active ORDER BY step_order LIMIT 1;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, current_step_order, current_approver_user_id, status)
  VALUES (_module_id, _flow.id, p_reference_id, p_requester_user_id, _step.step_order, _step.approver_user_id, 'awaiting_step_' || _step.step_order)
  RETURNING id INTO _request_id;

  INSERT INTO public.approval_request_steps (approval_request_id, flow_step_id, step_order, approver_user_id)
  SELECT _request_id, afs.id, afs.step_order, afs.approver_user_id
  FROM public.approval_flow_steps afs WHERE afs.flow_id = _flow.id AND afs.active ORDER BY afs.step_order;

  INSERT INTO public.approval_history (approval_request_id, action, action_by, step_order, old_status, new_status)
  VALUES (_request_id, 'flow_started', p_requester_user_id, _step.step_order, NULL, 'awaiting_step_' || _step.step_order);

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_step.approver_user_id, 'Nova aprovação pendente', 'Você tem uma nova solicitação aguardando sua aprovação',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id, 'module', p_module_code));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$$;

-- process_approval_action
CREATE OR REPLACE FUNCTION public.process_approval_action(
  p_approval_request_id uuid, p_action text, p_comments text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid(); _req RECORD; _flow RECORD; _next_step RECORD;
  _old_status text; _new_status text;
BEGIN
  IF p_action NOT IN ('approve', 'reject', 'return') THEN
    RETURN jsonb_build_object('error', 'Ação inválida');
  END IF;

  SELECT * INTO _req FROM public.approval_requests WHERE id = p_approval_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Solicitação não encontrada'); END IF;
  IF _req.ended_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'Fluxo já encerrado'); END IF;
  IF _req.current_approver_user_id != _uid THEN RETURN jsonb_build_object('error', 'Você não é o aprovador da etapa atual'); END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE id = _req.flow_id;
  _old_status := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments) = '') THEN
      RETURN jsonb_build_object('error', 'É obrigatório informar o motivo da recusa');
    END IF;
    _new_status := 'rejected';
    UPDATE public.approval_request_steps SET status = 'rejected', action_at = now(), comments = p_comments
    WHERE approval_request_id = p_approval_request_id AND step_order = _req.current_step_order;
    UPDATE public.approval_requests SET status = _new_status, ended_at = now() WHERE id = p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN
      RETURN jsonb_build_object('error', 'Este fluxo não permite devolução');
    END IF;
    _new_status := 'returned_for_adjustment';
    UPDATE public.approval_request_steps SET status = 'returned', action_at = now(), comments = p_comments
    WHERE approval_request_id = p_approval_request_id AND step_order = _req.current_step_order;
    UPDATE public.approval_requests SET status = _new_status, ended_at = now() WHERE id = p_approval_request_id;

  ELSIF p_action = 'approve' THEN
    UPDATE public.approval_request_steps SET status = 'approved', action_at = now(), comments = p_comments
    WHERE approval_request_id = p_approval_request_id AND step_order = _req.current_step_order;

    SELECT * INTO _next_step FROM public.approval_request_steps
    WHERE approval_request_id = p_approval_request_id AND step_order > _req.current_step_order AND status = 'pending'
    ORDER BY step_order LIMIT 1;

    IF _next_step.id IS NOT NULL THEN
      _new_status := 'awaiting_step_' || _next_step.step_order;
      UPDATE public.approval_requests SET current_step_order = _next_step.step_order,
        current_approver_user_id = _next_step.approver_user_id, status = _new_status
      WHERE id = p_approval_request_id;
      IF _flow.notify_next_approver THEN
        INSERT INTO public.notifications (user_id, title, message, metadata)
        VALUES (_next_step.approver_user_id, 'Nova aprovação pendente', 'Solicitação aguardando sua aprovação',
          jsonb_build_object('entity_type', 'approval_request', 'entity_id', p_approval_request_id));
      END IF;
    ELSE
      _new_status := 'approved';
      UPDATE public.approval_requests SET status = _new_status, ended_at = now() WHERE id = p_approval_request_id;
    END IF;
  END IF;

  INSERT INTO public.approval_history (approval_request_id, action, action_by, step_order, comments, old_status, new_status)
  VALUES (p_approval_request_id, p_action, _uid, _req.current_step_order, p_comments, _old_status, _new_status);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'approval_' || p_action, 'approval_request', p_approval_request_id::text,
    jsonb_build_object('old_status', _old_status, 'new_status', _new_status, 'comments', p_comments));

  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      CASE p_action WHEN 'approve' THEN CASE WHEN _new_status = 'approved' THEN 'Solicitação aprovada' ELSE 'Etapa aprovada' END
        WHEN 'reject' THEN 'Solicitação recusada' WHEN 'return' THEN 'Solicitação devolvida' END,
      CASE p_action WHEN 'approve' THEN 'Sua solicitação avançou no fluxo de aprovação'
        WHEN 'reject' THEN COALESCE('Motivo: ' || p_comments, 'Recusada') WHEN 'return' THEN COALESCE('Motivo: ' || p_comments, 'Devolvida') END,
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', p_approval_request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _new_status);
END;
$$;

-- Prevent last master removal
CREATE OR REPLACE FUNCTION public.prevent_last_master_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _master_role_id uuid; _remaining integer;
BEGIN
  SELECT id INTO _master_role_id FROM public.roles WHERE is_master LIMIT 1;
  IF _master_role_id IS NULL THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' AND OLD.role_id = _master_role_id THEN
    SELECT count(*) INTO _remaining FROM public.user_role_assignments WHERE role_id = _master_role_id AND id != OLD.id;
    IF _remaining < 1 THEN RAISE EXCEPTION 'O sistema precisa ter pelo menos um usuário master.'; END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_master ON public.user_role_assignments;
CREATE TRIGGER trg_prevent_last_master BEFORE DELETE ON public.user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_master_removal();

-- Auto-rebuild permissions triggers
CREATE OR REPLACE FUNCTION public.trigger_rebuild_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_role_assignments' THEN
    PERFORM public.rebuild_user_permissions(COALESCE(NEW.user_id, OLD.user_id));
  ELSIF TG_TABLE_NAME = 'user_permission_overrides' THEN
    PERFORM public.rebuild_user_permissions(COALESCE(NEW.user_id, OLD.user_id));
  ELSIF TG_TABLE_NAME = 'role_permission_matrix' THEN
    PERFORM public.rebuild_user_permissions(ura.user_id)
    FROM public.user_role_assignments ura WHERE ura.role_id = COALESCE(NEW.role_id, OLD.role_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rebuild_perms_ura ON public.user_role_assignments;
CREATE TRIGGER trg_rebuild_perms_ura AFTER INSERT OR UPDATE OR DELETE ON public.user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_rebuild_permissions();

DROP TRIGGER IF EXISTS trg_rebuild_perms_override ON public.user_permission_overrides;
CREATE TRIGGER trg_rebuild_perms_override AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.trigger_rebuild_permissions();

DROP TRIGGER IF EXISTS trg_rebuild_perms_matrix ON public.role_permission_matrix;
CREATE TRIGGER trg_rebuild_perms_matrix AFTER INSERT OR UPDATE OR DELETE ON public.role_permission_matrix
  FOR EACH ROW EXECUTE FUNCTION public.trigger_rebuild_permissions();

DROP TRIGGER IF EXISTS trg_approval_flows_updated ON public.approval_flows;
CREATE TRIGGER trg_approval_flows_updated BEFORE UPDATE ON public.approval_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. Sync existing user_roles to user_role_assignments
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT ur.user_id, r.id
FROM public.user_roles ur JOIN public.roles r ON r.key = ur.role::text
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 11. Seed permission matrix for key roles
INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, pm.id, pa.id, true
FROM public.roles r CROSS JOIN public.permission_modules pm CROSS JOIN public.permission_actions pa
WHERE r.key = 'master' AND pm.active AND pa.active
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, pm.id, pa.id, true
FROM public.roles r CROSS JOIN public.permission_modules pm CROSS JOIN public.permission_actions pa
WHERE r.key = 'diretoria' AND pm.active AND pa.active
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, pm.id, pa.id, true
FROM public.roles r CROSS JOIN public.permission_modules pm CROSS JOIN public.permission_actions pa
WHERE r.key = 'administrativo' AND pm.active AND pa.active
  AND pa.code IN ('view', 'create', 'edit', 'export')
  AND pm.code NOT IN ('permissoes')
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, pm.id, pa.id, true
FROM public.roles r CROSS JOIN public.permission_modules pm CROSS JOIN public.permission_actions pa
WHERE r.key = 'rh' AND pm.active AND pa.active
  AND ((pm.code IN ('admissao', 'perfil', 'dashboard') AND pa.code IN ('view', 'create', 'edit', 'export'))
    OR (pm.code IN ('abastecimento', 'reembolso', 'diaria') AND pa.code = 'view'))
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, pm.id, pa.id, true
FROM public.roles r CROSS JOIN public.permission_modules pm CROSS JOIN public.permission_actions pa
WHERE r.key = 'colaborador' AND pm.active AND pa.active
  AND ((pm.code IN ('abastecimento', 'reembolso', 'diaria') AND pa.code IN ('view', 'create'))
    OR (pm.code IN ('dashboard', 'perfil', 'configuracoes') AND pa.code = 'view')
    OR (pm.code = 'perfil' AND pa.code = 'edit'))
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

-- 12. Rebuild all user permissions
DO $$
DECLARE _uid uuid;
BEGIN
  FOR _uid IN SELECT DISTINCT user_id FROM public.user_role_assignments LOOP
    PERFORM public.rebuild_user_permissions(_uid);
  END LOOP;
END;
$$;
