-- Checkpoint B: contratos introduzidos pela migration de segurança e integridade.
-- Cobre P1-01 (trilhas), P1-02 (PII de Admissões), P1-03 (vínculo candidato<->admissão)
-- e P1-06 (retenção do histórico de workflow).
BEGIN;
SELECT * FROM no_plan();

-- ---------------------------------------------------------------------------
-- P1-01 — trilhas gravadas somente pelo motor (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.status_history', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.status_history', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.status_history', 'DELETE'),
  'cliente autenticado não escreve em status_history'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.status_history', 'INSERT'),
  'cliente anônimo não escreve em status_history'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.approval_history', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.approval_history', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.approval_history', 'DELETE'),
  'cliente autenticado não escreve em approval_history'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.audit_logs', 'SELECT'),
  'audit_logs é somente leitura para autenticado e invisível para anônimo'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.status_history', 'SELECT')
  AND has_table_privilege('authenticated', 'public.approval_history', 'SELECT'),
  'leitura autorizada das trilhas é preservada'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('status_history','approval_history')
     AND cmd IN ('INSERT','ALL')),
  0,
  'nenhuma policy permite inserção de trilha pelo cliente'
);

-- ---------------------------------------------------------------------------
-- P1-02 — PII de Admissões restrita a RH / Diretoria / Master
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='public' AND tablename='admission_files'
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%administrativo%'),
  0,
  'papel Administrativo não alcança admission_files'
);
SELECT ok(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='admission_files'
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%''rh''%') >= 3,
  'RH mantém leitura e escrita de admission_files'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%admissions%'
     AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%administrativo%'),
  0,
  'papel Administrativo não alcança o bucket de Admissões'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN (
       'Admins and RH can view admissions files',
       'Admins and RH can insert admissions files',
       'Admins and RH can update admissions files',
       'Admins and RH can delete admissions files')),
  4,
  'contrato nominal das policies do bucket de Admissões é preservado'
);
SELECT is(
  (SELECT public::boolean FROM storage.buckets WHERE id='admissions'),
  false,
  'bucket de Admissões permanece privado'
);

-- ---------------------------------------------------------------------------
-- P1-03 — vínculo candidato <-> admissão é garantido pelo banco
-- ---------------------------------------------------------------------------
INSERT INTO auth.users(id,email) VALUES
  ('cb000000-0000-0000-0000-000000000001','checkpoint-b-owner@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('cb000000-0000-0000-0000-000000000001','Checkpoint B Owner','checkpoint-b-owner@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

INSERT INTO public.admission_requests(id,requester_user_id,local_contratacao,centro_custo,cargo_funcao,tipo_contrato,jornada,gestor_responsavel,motivo)
VALUES
  ('cb100000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000001','Matriz','CC','Analista','CLT','Integral','Gestor','Checkpoint B A'),
  ('cb100000-0000-0000-0000-000000000002','cb000000-0000-0000-0000-000000000001','Matriz','CC','Analista','CLT','Integral','Gestor','Checkpoint B B');

INSERT INTO public.candidates(id,admission_request_id,nome) VALUES
  ('cb200000-0000-0000-0000-000000000001','cb100000-0000-0000-0000-000000000001','Candidato Checkpoint B');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conname='candidates_id_admission_request_id_key'
            AND conrelid='public.candidates'::regclass),
  'candidates expõe a chave composta (id, admission_request_id)'
);

SELECT throws_ok(
  $$INSERT INTO public.admission_public_links(admission_request_id,candidate_id,link_type,token_hash,expires_at)
    VALUES ('cb100000-0000-0000-0000-000000000002','cb200000-0000-0000-0000-000000000001','DOCUMENTS',repeat('c',64),now()+interval '1 day')$$,
  '23503',
  NULL,
  'link público com par candidato<->admissão incompatível é rejeitado'
);

SELECT throws_ok(
  $$INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
    VALUES ('cb100000-0000-0000-0000-000000000002','cb200000-0000-0000-0000-000000000001','CPF','documents/cpf.pdf','CANDIDATE','DOCUMENTS')$$,
  '23503',
  NULL,
  'arquivo de admissão com par incompatível é rejeitado'
);

SELECT lives_ok(
  $$INSERT INTO public.admission_public_links(admission_request_id,candidate_id,link_type,token_hash,expires_at)
    VALUES ('cb100000-0000-0000-0000-000000000001','cb200000-0000-0000-0000-000000000001','DOCUMENTS',repeat('d',64),now()+interval '1 day')$$,
  'par candidato<->admissão coerente continua permitido'
);

-- ---------------------------------------------------------------------------
-- P1-06 — exclusão nunca apaga a trilha do workflow
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM pg_trigger
   WHERE tgfoid='public.guard_entity_delete_workflow'::regproc AND NOT tgisinternal),
  4,
  'as quatro entidades de workflow possuem guarda de exclusão'
);

SELECT lives_ok(
  $$DELETE FROM public.admission_requests WHERE id='cb100000-0000-0000-0000-000000000002'$$,
  'entidade que nunca entrou em workflow pode ser excluída'
);

INSERT INTO public.approval_requests(module_id,flow_id,reference_id,requester_user_id,status,ended_at)
SELECT f.module_id,f.id,'cb100000-0000-0000-0000-000000000001','cb000000-0000-0000-0000-000000000001','completed',now()
FROM public.approval_flows f
JOIN public.approval_modules m ON m.id=f.module_id
WHERE m.code='admissoes'
ORDER BY f.created_at DESC
LIMIT 1;

SELECT throws_ok(
  $$DELETE FROM public.admission_requests WHERE id='cb100000-0000-0000-0000-000000000001'$$,
  'WORKFLOW_HISTORY_RETENTION_DELETE_DENIED',
  'exclusão de entidade com histórico de aprovação é bloqueada'
);

-- Registro com workflow ATIVO também é bloqueado (mensagem específica)
INSERT INTO public.approval_requests(module_id,flow_id,reference_id,requester_user_id,status)
SELECT f.module_id,f.id,'cb100000-0000-0000-0000-000000000003','cb000000-0000-0000-0000-000000000001','awaiting_step'
FROM public.approval_flows f
JOIN public.approval_modules m ON m.id=f.module_id
WHERE m.code='admissoes'
ORDER BY f.created_at DESC
LIMIT 1;

INSERT INTO public.admission_requests(id,requester_user_id,local_contratacao,centro_custo,cargo_funcao,tipo_contrato,jornada,gestor_responsavel,motivo)
VALUES ('cb100000-0000-0000-0000-000000000003','cb000000-0000-0000-0000-000000000001','Matriz','CC','Analista','CLT','Integral','Gestor','Checkpoint B C');

SELECT throws_ok(
  $$DELETE FROM public.admission_requests WHERE id='cb100000-0000-0000-0000-000000000003'$$,
  'WORKFLOW_ACTIVE_DELETE_DENIED',
  'exclusão de entidade com workflow ativo é bloqueada'
);

-- ---------------------------------------------------------------------------
-- Operações reais com personas (não apenas contagem de policy)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users(id,email) VALUES
  ('cb000000-0000-0000-0000-0000000000a1','checkpoint-b-adm@test.local'),
  ('cb000000-0000-0000-0000-0000000000a2','checkpoint-b-rh@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('cb000000-0000-0000-0000-0000000000a1','Persona Administrativo','checkpoint-b-adm@test.local',true),
  ('cb000000-0000-0000-0000-0000000000a2','Persona RH','checkpoint-b-rh@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;
INSERT INTO public.user_roles(user_id,role) VALUES
  ('cb000000-0000-0000-0000-0000000000a1','administrativo'),
  ('cb000000-0000-0000-0000-0000000000a2','rh')
ON CONFLICT DO NOTHING;

INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
VALUES ('cb100000-0000-0000-0000-000000000001','cb200000-0000-0000-0000-000000000001','CPF','documents/cb/cpf.pdf','CANDIDATE','DOCUMENTS');

-- Persona Administrativo: nenhum acesso a PII/documentos
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"cb000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT count(*)::integer FROM public.admission_files),
  0,
  'Administrativo não lista documentos de admissão'
);
SELECT throws_ok(
  $$INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
    VALUES ('cb100000-0000-0000-0000-000000000001','cb200000-0000-0000-0000-000000000001','RG','documents/cb/rg.pdf','CANDIDATE','DOCUMENTS')$$,
  '42501',
  NULL,
  'Administrativo não envia documentos de admissão'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id='admissions'),
  0,
  'Administrativo não enumera objetos do bucket de Admissões'
);
SELECT throws_ok(
  $$INSERT INTO public.status_history(module,entity_type,entity_id,to_status)
    VALUES ('admissoes','admission_requests','cb100000-0000-0000-0000-000000000001','forjado')$$,
  '42501',
  NULL,
  'cliente autenticado não forja status_history'
);
SELECT throws_ok(
  $$INSERT INTO public.audit_logs(action,entity_type,entity_id)
    VALUES ('forjado','admission_requests','cb100000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'cliente autenticado não escreve audit_logs'
);

-- Persona RH: acesso previsto preservado
SET LOCAL request.jwt.claims TO '{"sub":"cb000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.admission_files),
  1,
  'RH continua lendo documentos de admissão'
);
SELECT lives_ok(
  $$INSERT INTO public.admission_files(admission_request_id,candidate_id,file_type,storage_path,uploaded_by,link_type)
    VALUES ('cb100000-0000-0000-0000-000000000001','cb200000-0000-0000-0000-000000000001','CTPS','documents/cb/ctps.pdf','RH','DOCUMENTS')$$,
  'RH continua enviando documentos de admissão'
);

RESET role;
RESET request.jwt.claims;

-- O motor (SECURITY DEFINER / owner) continua gravando a trilha normalmente
SELECT lives_ok(
  $$INSERT INTO public.status_history(module,entity_type,entity_id,to_status)
    VALUES ('admissoes','admission_requests','cb100000-0000-0000-0000-000000000001','em_triagem')$$,
  'o motor continua gravando status_history'
);

-- ---------------------------------------------------------------------------
-- Manutenção destrutiva sai do schema (script local/teste apenas)
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='admin_purge_test_data'),
  0,
  'rotina de limpeza destrutiva não existe no schema'
);

SELECT * FROM finish();
ROLLBACK;
