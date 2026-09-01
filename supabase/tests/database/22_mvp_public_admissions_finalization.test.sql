-- MVP 1.0 public Admissions finalization is strict, atomic and service-only.
BEGIN;
SELECT * FROM no_plan();

SELECT ok(
  has_function_privilege('service_role', 'public.finalize_admission_public_link(text,jsonb,boolean,text)', 'EXECUTE'),
  'service role can finalize capability-token links'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.finalize_admission_public_link(text,jsonb,boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.finalize_admission_public_link(text,jsonb,boolean,text)', 'EXECUTE'),
  'browser roles cannot call the finalization RPC directly'
);

INSERT INTO auth.users(id,email) VALUES
  ('fa000000-0000-0000-0000-000000000001','mvp-admissions-owner@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('fa000000-0000-0000-0000-000000000001','MVP Admissions Owner','mvp-admissions-owner@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

INSERT INTO public.admission_requests(id,requester_user_id,local_contratacao,centro_custo,cargo_funcao,tipo_contrato,jornada,gestor_responsavel,motivo)
VALUES ('fa100000-0000-0000-0000-000000000001','fa000000-0000-0000-0000-000000000001','Matriz','CC','Analista','CLT','Integral','Gestor','Teste MVP');

INSERT INTO public.candidates(id,admission_request_id,nome) VALUES
  ('fa200000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','Candidato Documentos'),
  ('fa200000-0000-0000-0000-000000000002','fa100000-0000-0000-0000-000000000001','Candidato Assinatura');

INSERT INTO public.admission_public_links(id,admission_request_id,candidate_id,link_type,token_hash,expires_at) VALUES
  ('fa300000-0000-0000-0000-000000000001','fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000001','DOCUMENTS',repeat('a',64),now()+interval '1 day'),
  ('fa300000-0000-0000-0000-000000000002','fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000002','SIGNATURE',repeat('b',64),now()+interval '1 day');

SELECT throws_ok(
  $$SELECT public.finalize_admission_public_link(repeat('a',64),'{"banco":"Banco","agencia":"1234","conta":"56789","tipo":"corrente"}',false,'127.0.0.1')$$,
  'REQUIRED_DOCUMENTS_MISSING:CPF,CTPS,PIS_PASEP,RESIDENCIA,RG_CNH',
  'document link cannot be consumed before required uploads exist'
);

INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
SELECT 'fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000001',file_type,'documents/'||file_type||'.pdf','CANDIDATE','DOCUMENTS'
FROM unnest(ARRAY['RG_CNH','CPF','CTPS','RESIDENCIA','PIS_PASEP']) file_type;

SELECT is(
  public.finalize_admission_public_link(repeat('a',64),'{"banco":"Banco Teste","agencia":"1234","conta":"56789-0","tipo":"corrente"}',false,'127.0.0.1')->>'success',
  'true',
  'complete document link finalizes successfully'
);
SELECT is(
  (SELECT bank_name||'|'||bank_agency||'|'||bank_account||'|'||bank_account_type||'|'||has_dependents::text
   FROM public.candidates WHERE id='fa200000-0000-0000-0000-000000000001'),
  'Banco Teste|1234|567890|corrente|false',
  'bank data and dependent declaration are persisted'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs
   WHERE action='finalize_public_link' AND entity_id='fa200000-0000-0000-0000-000000000001'),
  1,
  'finalization creates exactly one authoritative audit event'
);
SELECT throws_ok(
  $$SELECT public.finalize_admission_public_link(repeat('a',64),NULL,NULL,'127.0.0.1')$$,
  'PUBLIC_LINK_INVALID',
  'consumed link cannot finalize twice'
);

SELECT throws_ok(
  $$SELECT public.finalize_admission_public_link(repeat('b',64),NULL,NULL,'127.0.0.1')$$,
  'ADMIN_SIGNATURE_DOCUMENTS_MISSING:AUTORIZACAO_DESCONTO_VT_ADMIN,CONTRATO_TRABALHO_ADMIN,DECLARACAO_DEPENDENTES_IRRF_ADMIN,FICHA_REGISTRO_ADMIN',
  'signature link cannot finish before RH uploads mandatory documents'
);

INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
SELECT 'fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000002',file_type,'signature/admin/'||file_type||'.pdf','ADMIN','SIGNATURE'
FROM unnest(ARRAY['CONTRATO_TRABALHO_ADMIN','FICHA_REGISTRO_ADMIN','DECLARACAO_DEPENDENTES_IRRF_ADMIN','AUTORIZACAO_DESCONTO_VT_ADMIN']) file_type;
INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
SELECT 'fa100000-0000-0000-0000-000000000001','fa200000-0000-0000-0000-000000000002',replace(file_type,'_ADMIN','_SIGNED'),'signature/signed/'||file_type||'.pdf','CANDIDATE','SIGNATURE'
FROM unnest(ARRAY['CONTRATO_TRABALHO_ADMIN','FICHA_REGISTRO_ADMIN','DECLARACAO_DEPENDENTES_IRRF_ADMIN','AUTORIZACAO_DESCONTO_VT_ADMIN']) file_type;

SELECT is(
  public.finalize_admission_public_link(repeat('b',64),NULL,NULL,'127.0.0.1')->>'success',
  'true',
  'signature link finalizes only after all mandatory signed documents exist'
);

SELECT * FROM finish();
ROLLBACK;
