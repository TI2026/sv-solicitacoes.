-- ============================================================================
-- CHECKPOINT FINAL — Bootstrap controlado do Master inicial
-- ----------------------------------------------------------------------------
-- Defeito auditado no schema efetivo de produção (somente leitura):
--   public.handle_new_user() promove o PRIMEIRO usuário a 'diretoria' na tabela
--   legada public.user_roles, usando count(public.profiles) = 1. Isso é:
--     * papel errado (diretoria, não Master);
--     * modelo errado (user_roles legado, não user_role_assignments);
--     * sujeito a corrida (duas inscrições simultâneas → zero ou dois promovidos).
--
-- Esta migration substitui o mecanismo por um bootstrap singleton, atômico e de
-- uso único, com e-mail autorizado configurado exclusivamente no servidor.
--
-- NÃO APLICADA EM NENHUM AMBIENTE REAL. Validada em banco limpo local (pgTAP).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Registro singleton do bootstrap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  authorized_email text,
  completed_at timestamptz,
  completed_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Default privileges do schema public concedem DML a anon/authenticated em
-- tabelas novas: revogar antes de conceder apenas a leitura necessária.
REVOKE ALL ON public.bootstrap_state FROM PUBLIC;
REVOKE ALL ON public.bootstrap_state FROM anon;
REVOKE ALL ON public.bootstrap_state FROM authenticated;
GRANT SELECT ON public.bootstrap_state TO authenticated;
GRANT ALL ON public.bootstrap_state TO service_role;


ALTER TABLE public.bootstrap_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master can read bootstrap state" ON public.bootstrap_state;
CREATE POLICY "Master can read bootstrap state"
  ON public.bootstrap_state FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()));

-- Escrita somente por service_role (script administrativo local/staging).
-- Nenhuma policy de INSERT/UPDATE/DELETE é criada de propósito.

INSERT INTO public.bootstrap_state (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

DROP TRIGGER IF EXISTS trg_bootstrap_state_updated_at ON public.bootstrap_state;
CREATE TRIGGER trg_bootstrap_state_updated_at
  BEFORE UPDATE ON public.bootstrap_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Reivindicação atômica e de uso único do papel Master
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_master_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_state public.bootstrap_state%ROWTYPE;
  v_email text;
  v_confirmed timestamptz;
  v_role_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- Serializa qualquer tentativa concorrente.
  PERFORM pg_advisory_xact_lock(hashtext('public.claim_master_bootstrap'));

  SELECT * INTO v_state FROM public.bootstrap_state WHERE singleton FOR UPDATE;

  IF NOT FOUND OR v_state.authorized_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'BOOTSTRAP_NOT_CONFIGURED');
  END IF;

  IF v_state.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'BOOTSTRAP_ALREADY_COMPLETED');
  END IF;

  SELECT u.email, u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_uid;

  IF lower(coalesce(v_email, '')) <> lower(v_state.authorized_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'BOOTSTRAP_EMAIL_NOT_AUTHORIZED');
  END IF;

  IF v_confirmed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'BOOTSTRAP_EMAIL_NOT_CONFIRMED');
  END IF;

  SELECT r.id INTO v_role_id FROM public.roles r WHERE r.is_master ORDER BY r.key LIMIT 1;
  IF v_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MASTER_ROLE_MISSING');
  END IF;

  -- Se já existe qualquer Master, o bootstrap encerra sem conceder privilégio.
  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.is_master
  ) THEN
    UPDATE public.bootstrap_state
       SET completed_at = now()
     WHERE singleton AND completed_at IS NULL;
    RETURN jsonb_build_object('success', false, 'error', 'BOOTSTRAP_ALREADY_COMPLETED');
  END IF;

  DELETE FROM public.user_role_assignments WHERE user_id = v_uid;
  INSERT INTO public.user_role_assignments (user_id, role_id, assigned_by)
  VALUES (v_uid, v_role_id, v_uid);

  UPDATE public.profiles SET active = true WHERE id = v_uid;

  PERFORM public.rebuild_user_permissions(v_uid);

  UPDATE public.bootstrap_state
     SET completed_at = now(),
         completed_user_id = v_uid
   WHERE singleton;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'BOOTSTRAP_MASTER_CREATED', 'user_role_assignments', v_uid::text,
          jsonb_build_object('email', v_email, 'role_id', v_role_id));

  RETURN jsonb_build_object('success', true, 'user_id', v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_master_bootstrap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_master_bootstrap() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_master_bootstrap() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cadastro público deixa de promover ninguém
-- ---------------------------------------------------------------------------
-- Toda nova conta entra como Colaborador pendente (profiles.active = false),
-- exceto o e-mail previamente autorizado enquanto o bootstrap não foi concluído.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_bootstrap_owner boolean := false;
BEGIN
  SELECT (bs.completed_at IS NULL
          AND bs.authorized_email IS NOT NULL
          AND lower(bs.authorized_email) = lower(coalesce(NEW.email, '')))
    INTO v_is_bootstrap_owner
  FROM public.bootstrap_state bs
  WHERE bs.singleton;

  v_is_bootstrap_owner := coalesce(v_is_bootstrap_owner, false);

  INSERT INTO public.profiles (id, full_name, email, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    v_is_bootstrap_owner
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMIT;
