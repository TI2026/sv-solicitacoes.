DO $$
DECLARE
  v_master UUID := uuid_generate_v5(uuid_ns_dns(), 'master_user');
  v_solicitante UUID := uuid_generate_v5(uuid_ns_dns(), 'solicitante_user');
  v_aprovador UUID := uuid_generate_v5(uuid_ns_dns(), 'aprovador_user');
  v_financeiro UUID := uuid_generate_v5(uuid_ns_dns(), 'financeiro_user');
  v_rh UUID := uuid_generate_v5(uuid_ns_dns(), 'rh_user');
  v_sem_acesso UUID := uuid_generate_v5(uuid_ns_dns(), 'sem_acesso_user');
  v_role_master UUID;
  v_role_aprovador UUID;
  v_role_financeiro UUID;
  v_role_rh UUID;
BEGIN
  -- Insert auth users
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
  ('00000000-0000-0000-0000-000000000000', v_master, 'authenticated', 'authenticated', 'master@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', v_solicitante, 'authenticated', 'authenticated', 'solicitante@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', v_aprovador, 'authenticated', 'authenticated', 'aprovador@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', v_financeiro, 'authenticated', 'authenticated', 'financeiro@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', v_rh, 'authenticated', 'authenticated', 'rh@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', v_sem_acesso, 'authenticated', 'authenticated', 'sem_acesso@example.com', 'crypt', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Insert profiles
  INSERT INTO public.profiles (id, full_name, email, active)
  VALUES 
  (v_master, 'Master', 'master@example.com', true),
  (v_solicitante, 'Solicitante', 'solicitante@example.com', true),
  (v_aprovador, 'Aprovador', 'aprovador@example.com', true),
  (v_financeiro, 'Financeiro', 'financeiro@example.com', true),
  (v_rh, 'RH', 'rh@example.com', true),
  (v_sem_acesso, 'Sem Acesso', 'sem_acesso@example.com', true)
  ON CONFLICT (id) DO UPDATE SET active = true;

  -- Get role IDs
  SELECT id INTO v_role_master FROM public.roles WHERE key = 'master';
  SELECT id INTO v_role_aprovador FROM public.roles WHERE key = 'gerente'; -- Using gerente as approver if exist, else we'll need to check what roles exist
  -- Or we can just insert by key:
  INSERT INTO public.user_role_assignments (user_id, role_id)
  SELECT v_master, id FROM public.roles WHERE key = 'master'
  ON CONFLICT DO NOTHING;
  
  INSERT INTO public.user_role_assignments (user_id, role_id)
  SELECT v_financeiro, id FROM public.roles WHERE key = 'financeiro'
  ON CONFLICT DO NOTHING;
  
  INSERT INTO public.user_role_assignments (user_id, role_id)
  SELECT v_rh, id FROM public.roles WHERE key = 'rh'
  ON CONFLICT DO NOTHING;

  -- Create some test data for dashboard
  INSERT INTO public.purchases (id, requester_user_id, status, category, priority, estimated_value, description)
  VALUES (uuid_generate_v5(uuid_ns_dns(), 'compra1'), v_solicitante, 'em_aprovacao', 'cat1', 'media', 100, 'Compra 1')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.fuel_requests (id, requester_user_id, status, type, valor, data_abastecimento)
  VALUES (uuid_generate_v5(uuid_ns_dns(), 'abastecimento1'), v_solicitante, 'aguardando_comprovante', 'abastecimento', 100, '2026-01-01')
  ON CONFLICT DO NOTHING;
END $$;
