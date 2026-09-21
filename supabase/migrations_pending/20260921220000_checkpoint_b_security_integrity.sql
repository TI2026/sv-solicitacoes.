-- ============================================================================
-- CHECKPOINT B — Segurança, integridade de dados e retenção
-- Migration incremental. NÃO APLICADA em produção: revisar + aplicar em banco
-- local/staging antes de qualquer cutover.
--
-- Cobre os bloqueadores P1 da auditoria independente de 21/09/2026:
--   P1-01  trilhas (status_history / approval_history) forjáveis pelo cliente
--   P1-02  escopo de PII de Admissões inconsistente (admission_files + Storage)
--   P1-03  vínculo candidato ↔ admissão sem integridade relacional
--   P1-06  exclusão de entidade encerrada apagando a trilha do workflow
--
-- Nenhuma migration anterior é reescrita. Nenhum template/etapa V2 é alterado.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- P1-01 — Trilhas só podem ser escritas pelo motor (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- O motor grava status_history/approval_history dentro de funções
-- SECURITY DEFINER (owner = postgres), portanto não depende dos grants do
-- papel `authenticated`. Leitura autorizada é preservada.

DROP POLICY IF EXISTS "System can insert status_history" ON public.status_history;
DROP POLICY IF EXISTS "System inserts ah" ON public.approval_history;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.status_history FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.approval_history FROM authenticated, anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;

GRANT SELECT ON public.status_history TO authenticated;
GRANT SELECT ON public.approval_history TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.status_history TO service_role;
GRANT ALL ON public.approval_history TO service_role;
GRANT ALL ON public.audit_logs TO service_role;

-- ---------------------------------------------------------------------------
-- P1-02 — PII de Admissões: RH / Diretoria / Master (alinha com `candidates`)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and RH manage admission_files" ON public.admission_files;

CREATE POLICY "RH chain reads admission_files"
  ON public.admission_files FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "RH chain writes admission_files"
  ON public.admission_files FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "RH chain updates admission_files"
  ON public.admission_files FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role)
    OR has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

CREATE POLICY "Directors delete admission_files"
  ON public.admission_files FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  );

-- Storage: mesmo escopo do metadado (remove o papel Administrativo).
DROP POLICY IF EXISTS "Admins and RH can view admissions files"   ON storage.objects;
DROP POLICY IF EXISTS "Admins and RH can insert admissions files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and RH can update admissions files" ON storage.objects;
DROP POLICY IF EXISTS "Admins and RH can delete admissions files" ON storage.objects;

CREATE POLICY "RH chain views admissions bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'admissions'
    AND (current_has_role('rh'::app_role) OR current_has_role('diretoria'::app_role) OR current_has_role('master'::app_role))
  );

CREATE POLICY "RH chain inserts admissions bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'admissions'
    AND (current_has_role('rh'::app_role) OR current_has_role('diretoria'::app_role) OR current_has_role('master'::app_role))
  );

CREATE POLICY "RH chain updates admissions bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'admissions'
    AND (current_has_role('rh'::app_role) OR current_has_role('diretoria'::app_role) OR current_has_role('master'::app_role))
  )
  WITH CHECK (
    bucket_id = 'admissions'
    AND (current_has_role('rh'::app_role) OR current_has_role('diretoria'::app_role) OR current_has_role('master'::app_role))
  );

CREATE POLICY "Directors delete admissions bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'admissions'
    AND (current_has_role('diretoria'::app_role) OR current_has_role('master'::app_role))
  );

-- ---------------------------------------------------------------------------
-- P1-03 — Integridade candidato ↔ admissão (links públicos e arquivos)
-- ---------------------------------------------------------------------------
-- Chave composta em candidates permite que links e arquivos referenciem o par
-- (candidato, admissão) de forma autoritativa. Um link inconsistente passa a
-- ser impossível no banco, independentemente do que a Edge Function envie.

ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_id_admission_request_id_key;
ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_id_admission_request_id_key
  UNIQUE (id, admission_request_id);

ALTER TABLE public.admission_public_links
  DROP CONSTRAINT IF EXISTS admission_public_links_candidate_admission_fk;
ALTER TABLE public.admission_public_links
  ADD CONSTRAINT admission_public_links_candidate_admission_fk
  FOREIGN KEY (candidate_id, admission_request_id)
  REFERENCES public.candidates (id, admission_request_id)
  ON DELETE CASCADE;

ALTER TABLE public.admission_files
  DROP CONSTRAINT IF EXISTS admission_files_candidate_admission_fk;
ALTER TABLE public.admission_files
  ADD CONSTRAINT admission_files_candidate_admission_fk
  FOREIGN KEY (candidate_id, admission_request_id)
  REFERENCES public.candidates (id, admission_request_id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- P1-06 — Retenção: exclusão de entidade nunca apaga a trilha do workflow
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_entity_delete_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module text := TG_ARGV[0];
  v_active boolean;
  v_any boolean;
BEGIN
  IF TG_TABLE_NAME = 'fuel_requests' THEN
    v_module := OLD.type;
  END IF;

  SELECT
    bool_or(ar.ended_at IS NULL AND ar.status NOT IN ('rejected','cancelled','completed','approved')),
    count(*) > 0
  INTO v_active, v_any
  FROM public.approval_requests ar
  JOIN public.approval_modules m ON m.id = ar.module_id
  WHERE ar.reference_id = OLD.id
    AND m.code = v_module;

  IF COALESCE(v_active, false) THEN
    RAISE EXCEPTION 'WORKFLOW_ACTIVE_DELETE_DENIED';
  END IF;

  -- Retenção empresarial: histórico de aprovação encerrado é evidência e não
  -- pode ser removido junto com a entidade. Exclusão física só é permitida
  -- para registros que nunca entraram em workflow.
  IF COALESCE(v_any, false) THEN
    RAISE EXCEPTION 'WORKFLOW_HISTORY_RETENTION_DELETE_DENIED';
  END IF;

  RETURN OLD;
END;
$$;

COMMIT;
