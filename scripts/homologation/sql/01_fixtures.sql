-- CHECKPOINT 1 — fixtures de homologação (APENAS BANCO LOCAL)
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.hom_uid(p_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid, 'homolog_' || p_key) $$;

CREATE OR REPLACE FUNCTION public.hom_auth(p_key text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', public.hom_uid(p_key)::text, 'role', 'authenticated')::text, false);
  PERFORM set_config('role', 'authenticated', false);
END $$;

CREATE OR REPLACE FUNCTION public.hom_reset_auth() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', false);
  PERFORM set_config('request.jwt.claims', '', false);
END $$;

-- Resultado de cada verificação da bateria
CREATE TABLE IF NOT EXISTS public.hom_results (
  id serial primary key, step text, name text, passed boolean, detail text, at timestamptz default now()
);
TRUNCATE public.hom_results;

CREATE OR REPLACE FUNCTION public.hom_check(p_step text, p_name text, p_passed boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.hom_results(step, name, passed, detail) VALUES (p_step, p_name, coalesce(p_passed,false), p_detail);
$$;

DO $$
DECLARE
  v RECORD;
  v_id uuid;
BEGIN
  FOR v IN SELECT * FROM (VALUES
      ('A','a.requester@local.homolog','A Solicitante','colaborador'),
      ('B','b.approver1@local.homolog','B Aprovador 1','supervisor'),
      ('C','c.approver2@local.homolog','C Aprovador 2','administrativo'),
      ('D','d.approver3@local.homolog','D Aprovador 3','administrativo'),
      ('S','s.substitute@local.homolog','S Substituto','supervisor'),
      ('M','m.master@local.homolog','M Master','master'),
      ('F','f.financeiro@local.homolog','F Financeiro','financeiro'),
      ('RH','rh@local.homolog','RH Homolog','rh'),
      ('DIR','dir@local.homolog','DIR Diretoria','diretoria'),
      ('U','u.unrelated@local.homolog','U Sem Relacao','colaborador')
    ) AS t(k, email, name, role)
  LOOP
    v_id := public.hom_uid(v.k);
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, email_confirmed_at)
    VALUES (v_id, 'authenticated', 'authenticated', v.email,
            jsonb_build_object('full_name', v.name), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, email, department, active)
    VALUES (v_id, v.name, v.email, 'Homologação', true)
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, active = true;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_id, v.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  -- Setor de homologação: responsável B, substituto S
  INSERT INTO public.sectors (id, code, name, responsible_user_id, substitute_user_id, active)
  VALUES (public.hom_uid('setor'), 'HOM', 'Setor Homologação', public.hom_uid('B'), public.hom_uid('S'), true)
  ON CONFLICT (id) DO UPDATE SET responsible_user_id = EXCLUDED.responsible_user_id,
                                 substitute_user_id = EXCLUDED.substitute_user_id, active = true;

  UPDATE public.profiles SET sector_id = public.hom_uid('setor'), manager_user_id = public.hom_uid('B')
   WHERE id IN (public.hom_uid('A'), public.hom_uid('U'));
END $$;

-- Assignments reais das 17 etapas V2, via RPC oficial, executada pelo Master.
DO $$
DECLARE
  s RECORD;
  v_primary uuid;
  v_res jsonb;
  v_count int := 0;
BEGIN
  PERFORM public.hom_auth('M');
  FOR s IN
    SELECT st.id, st.step_order, st.step_code, m.code AS module_code
      FROM public.approval_flow_steps st
      JOIN public.approval_flows f ON f.id = st.flow_id
      JOIN public.approval_modules m ON m.id = f.module_id
     WHERE f.version = 'v2'
     ORDER BY m.code, st.step_order
  LOOP
    v_primary := CASE s.step_order WHEN 1 THEN public.hom_uid('B')
                                   WHEN 2 THEN public.hom_uid('C')
                                   ELSE public.hom_uid('D') END;
    v_res := public.save_approval_step_assignment(s.id, 'person', v_primary, public.hom_uid('S'), NULL, 1);
    IF coalesce(v_res->>'error','') <> '' THEN
      RAISE EXCEPTION 'assignment % (%): %', s.step_code, s.module_code, v_res->>'error';
    END IF;
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('FIXTURES', '17 etapas V2 configuradas', v_count = 17, v_count::text);
END $$;

-- Ativação do Motor V2 no banco LOCAL (jamais em produção)
DO $$
DECLARE v jsonb;
BEGIN
  -- activate_approval_v2 é exclusiva de servidor (service_role); aqui roda como
  -- superusuário local, mantendo a identidade Master nas claims.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', public.hom_uid('M')::text, 'role', 'authenticated')::text, false);
  v := public.activate_approval_v2();
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('FIXTURES', 'Motor V2 ativado no banco local',
    coalesce((v->>'success')::boolean, false), v::text);
END $$;

SELECT step, name, passed, detail FROM public.hom_results ORDER BY id;
