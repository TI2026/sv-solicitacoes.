
-- =============================================
-- ETAPA 1: Schema completo — RBAC, Auditoria, Admissão, Frota
-- =============================================

-- 1) Enums adicionais
CREATE TYPE public.admission_status AS ENUM (
  'rascunho','aguardando_triagem','em_triagem','aguardando_documentos',
  'documentos_em_analise','aguardando_exame','exame_realizado',
  'aguardando_registro','registros_concluidos','concluido','cancelado'
);

CREATE TYPE public.candidate_status AS ENUM (
  'novo','em_triagem','aprovado','reprovado','desistente'
);

CREATE TYPE public.doc_status AS ENUM ('pending','submitted','approved','rejected');

CREATE TYPE public.exam_status AS ENUM ('aguardando','apto','apto_com_restricao','inapto');

CREATE TYPE public.fuel_status AS ENUM (
  'rascunho','enviado','em_aprovacao','retornado',
  'aguardando_fotos','em_revisao_admin','aprovado','reprovado','encerrado'
);

CREATE TYPE public.fuel_attachment_type AS ENUM ('hodometro','nota_fiscal');

CREATE TYPE public.review_decision AS ENUM ('approved','rejected','needs_revision');

CREATE TYPE public.notification_channel AS ENUM ('in_app','email');

-- 2) Tabela de lookup de roles (complementar ao enum existente)
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT ''
);

-- 3) Tabela de permissões (preparação futura)
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 4) status_history (genérico para todos os módulos)
CREATE TABLE public.status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5) Módulo Admissão
CREATE TABLE public.admission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_contratacao text NOT NULL DEFAULT '',
  centro_custo text NOT NULL DEFAULT '',
  cargo_funcao text NOT NULL DEFAULT '',
  tipo_contrato text NOT NULL DEFAULT '',
  salario_previsto numeric(12,2),
  jornada text NOT NULL DEFAULT '',
  data_prevista_inicio date,
  gestor_responsavel text NOT NULL DEFAULT '',
  motivo text NOT NULL DEFAULT '',
  justificativa text,
  contrato_publico_ref text,
  status admission_status NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_request_id uuid NOT NULL REFERENCES public.admission_requests(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cpf text,
  telefone text,
  email text,
  cidade text,
  experiencia text,
  indicacao_interna boolean NOT NULL DEFAULT false,
  curriculo_path text,
  status_triagem candidate_status NOT NULL DEFAULT 'novo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.public_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  applies_condition jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_path text,
  uploaded_at timestamptz,
  status doc_status NOT NULL DEFAULT 'pending',
  last_review_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_document_id uuid NOT NULL REFERENCES public.candidate_documents(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision doc_status NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  endereco text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.medical_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  status exam_status NOT NULL DEFAULT 'aguardando',
  restrictions text,
  guide_pdf_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  folha_pagamento boolean NOT NULL DEFAULT false,
  esocial boolean NOT NULL DEFAULT false,
  ponto boolean NOT NULL DEFAULT false,
  sistema_interno boolean NOT NULL DEFAULT false,
  entrega_epi boolean NOT NULL DEFAULT false,
  completed_at timestamptz
);

-- 6) Módulo Frota / Abastecimento
CREATE TABLE public.fuel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor numeric(12,2) NOT NULL,
  data_abastecimento date NOT NULL DEFAULT CURRENT_DATE,
  status fuel_status NOT NULL DEFAULT 'rascunho',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fuel_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_request_id uuid NOT NULL REFERENCES public.fuel_requests(id) ON DELETE CASCADE,
  type fuel_attachment_type NOT NULL,
  file_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fuel_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_request_id uuid NOT NULL REFERENCES public.fuel_requests(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision review_decision NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7) Alterar notifications para incluir channel
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel notification_channel NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_status_history_entity ON public.status_history(module, entity_type, entity_id);
CREATE INDEX idx_status_history_created ON public.status_history(created_at DESC);

CREATE INDEX idx_admission_requests_status ON public.admission_requests(status);
CREATE INDEX idx_admission_requests_requester ON public.admission_requests(requester_user_id);
CREATE INDEX idx_candidates_admission ON public.candidates(admission_request_id);
CREATE INDEX idx_candidates_cpf ON public.candidates(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_candidate_documents_candidate ON public.candidate_documents(candidate_id);
CREATE INDEX idx_public_tokens_hash ON public.public_tokens(token_hash);

CREATE INDEX idx_fuel_requests_status ON public.fuel_requests(status);
CREATE INDEX idx_fuel_requests_requester ON public.fuel_requests(requester_user_id);
CREATE INDEX idx_fuel_attachments_request ON public.fuel_attachments(fuel_request_id);

CREATE UNIQUE INDEX idx_candidates_cpf_unique ON public.candidates(cpf) WHERE cpf IS NOT NULL AND cpf <> '';

-- =============================================
-- TRIGGERS: updated_at
-- =============================================
CREATE TRIGGER set_admission_requests_updated_at
  BEFORE UPDATE ON public.admission_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_fuel_requests_updated_at
  BEFORE UPDATE ON public.fuel_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_medical_exams_updated_at
  BEFORE UPDATE ON public.medical_exams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- TRIGGER: status_history automática
-- =============================================
CREATE OR REPLACE FUNCTION public.track_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
    VALUES (
      TG_ARGV[0],
      TG_TABLE_NAME,
      NEW.id,
      OLD.status::text,
      NEW.status::text,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_admission_status
  AFTER UPDATE ON public.admission_requests
  FOR EACH ROW EXECUTE FUNCTION public.track_status_change('admissions');

CREATE TRIGGER track_candidate_status
  AFTER UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.track_status_change('admissions');

CREATE TRIGGER track_fuel_status
  AFTER UPDATE ON public.fuel_requests
  FOR EACH ROW EXECUTE FUNCTION public.track_status_change('fleet');

-- =============================================
-- VIEWS para Dashboard
-- =============================================
CREATE OR REPLACE VIEW public.vw_admission_metrics AS
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status NOT IN ('concluido','cancelado')) AS pendentes,
  count(*) FILTER (WHERE status = 'concluido') AS concluidos,
  count(*) FILTER (WHERE status = 'cancelado') AS cancelados,
  coalesce(sum(salario_previsto), 0) AS salario_total,
  centro_custo,
  status
FROM public.admission_requests
GROUP BY centro_custo, status;

CREATE OR REPLACE VIEW public.vw_fuel_metrics AS
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status NOT IN ('aprovado','reprovado','encerrado')) AS pendentes,
  count(*) FILTER (WHERE status = 'aprovado') AS aprovados,
  count(*) FILTER (WHERE status = 'reprovado') AS reprovados,
  count(*) FILTER (WHERE status = 'encerrado') AS encerrados,
  coalesce(sum(valor), 0) AS valor_total,
  status
FROM public.fuel_requests
GROUP BY status;

-- =============================================
-- RLS POLICIES
-- =============================================

-- status_history: admins podem ver tudo, usuários veem do próprio módulo
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all status history" ON public.status_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
CREATE POLICY "Users can view own status changes" ON public.status_history
  FOR SELECT TO authenticated
  USING (changed_by = auth.uid());

-- roles (lookup)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only diretoria can manage roles" ON public.roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));

-- permissions
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only diretoria can manage permissions" ON public.permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));

-- role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only diretoria can manage role_permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria')) WITH CHECK (has_role(auth.uid(), 'diretoria'));

-- admission_requests
ALTER TABLE public.admission_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH can view all admissions" ON public.admission_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));
CREATE POLICY "Requester can view own admissions" ON public.admission_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());
CREATE POLICY "RH and admins can insert admissions" ON public.admission_requests
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));
CREATE POLICY "RH and admins can update admissions" ON public.admission_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- candidates
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH can manage candidates" ON public.candidates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- public_tokens: acesso anônimo por hash (para link público)
ALTER TABLE public.public_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH manage tokens" ON public.public_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'));
CREATE POLICY "Public can read valid tokens" ON public.public_tokens
  FOR SELECT TO anon
  USING (expires_at > now() AND used_at IS NULL);

-- documents (dicionário)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public can view documents" ON public.documents FOR SELECT TO anon USING (true);
CREATE POLICY "Admins manage documents" ON public.documents FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'));

-- candidate_documents
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH manage candidate_documents" ON public.candidate_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- document_reviews
ALTER TABLE public.document_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH manage document_reviews" ON public.document_reviews
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- clinics
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view clinics" ON public.clinics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and RH manage clinics" ON public.clinics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'rh'));

-- medical_exams
ALTER TABLE public.medical_exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH manage medical_exams" ON public.medical_exams
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- system_registrations
ALTER TABLE public.system_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and RH manage system_registrations" ON public.system_registrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

-- fuel_requests
ALTER TABLE public.fuel_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester can view own fuel requests" ON public.fuel_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());
CREATE POLICY "Admins can view all fuel requests" ON public.fuel_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
CREATE POLICY "Authenticated can insert fuel requests" ON public.fuel_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());
CREATE POLICY "Requester can update own draft fuel requests" ON public.fuel_requests
  FOR UPDATE TO authenticated
  USING (requester_user_id = auth.uid() AND status = 'rascunho')
  WITH CHECK (requester_user_id = auth.uid());
CREATE POLICY "Admins can update fuel requests" ON public.fuel_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));

-- fuel_attachments
ALTER TABLE public.fuel_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester can manage own attachments" ON public.fuel_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fuel_requests fr WHERE fr.id = fuel_request_id AND fr.requester_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fuel_requests fr WHERE fr.id = fuel_request_id AND fr.requester_user_id = auth.uid()));
CREATE POLICY "Admins can view all attachments" ON public.fuel_attachments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));

-- fuel_reviews
ALTER TABLE public.fuel_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage fuel reviews" ON public.fuel_reviews
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo'));
CREATE POLICY "Requester can view reviews of own requests" ON public.fuel_reviews
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fuel_requests fr WHERE fr.id = fuel_request_id AND fr.requester_user_id = auth.uid()));

-- =============================================
-- SEED: roles lookup
-- =============================================
INSERT INTO public.roles (key, description) VALUES
  ('diretoria', 'Acesso total + gestão de permissões e usuários'),
  ('administrativo', 'Revisa, opera e comanda processos'),
  ('colaborador', 'Nível básico — solicitações e acompanhamento'),
  ('rh', 'Opera fluxo de admissão');

-- =============================================
-- SEED: documents (dicionário de documentos obrigatórios)
-- =============================================
INSERT INTO public.documents (key, label, required, applies_condition) VALUES
  ('rg', 'RG (Identidade)', true, '{}'),
  ('cpf', 'CPF', true, '{}'),
  ('titulo_eleitor', 'Título de Eleitor', true, '{}'),
  ('comprovante_residencia', 'Comprovante de Residência', true, '{}'),
  ('certidao_nascimento_casamento', 'Certidão de Nascimento ou Casamento', true, '{}'),
  ('carteira_trabalho', 'Carteira de Trabalho (CTPS)', true, '{}'),
  ('pis_pasep', 'PIS/PASEP', true, '{}'),
  ('foto_3x4', 'Foto 3x4', true, '{}'),
  ('comprovante_escolaridade', 'Comprovante de Escolaridade', true, '{}'),
  ('certidao_nascimento_filhos', 'Certidão de Nascimento dos Filhos', false, '{"condition": "has_children"}'),
  ('cartao_vacina_filhos', 'Cartão de Vacina dos Filhos (até 7 anos)', false, '{"condition": "has_children_under_7"}'),
  ('reservista', 'Certificado de Reservista', false, '{"condition": "male"}'),
  ('cnh', 'CNH', false, '{"condition": "requires_driving"}'),
  ('certidao_negativa_criminal', 'Certidão Negativa Criminal', true, '{}'),
  ('exame_admissional', 'Atestado de Saúde Ocupacional (ASO)', true, '{}'),
  ('conta_bancaria', 'Dados Bancários', true, '{}');
