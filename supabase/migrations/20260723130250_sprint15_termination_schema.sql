-- ============================================================
-- SPRINT 15: Migration 002.5 - Schema Desligamentos (Offboarding)
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
CREATE TYPE public.termination_type AS ENUM (
  'pedido_demissao',
  'demissao_sem_justa_causa',
  'demissao_por_justa_causa',
  'acordo',
  'termino_contrato',
  'experiencia',
  'aposentadoria',
  'falecimento',
  'outros'
);

CREATE TYPE public.termination_status AS ENUM (
  'rascunho',
  'em_aprovacao',
  'aprovado',
  'reprovado',
  'retornado',
  'desligamento_concluido',
  'cancelado'
);

-- ------------------------------------------------------------
-- 2. TABELA termination_requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.termination_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id       uuid NOT NULL REFERENCES public.collaborators(id),
  requester_user_id     uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  tipo_desligamento     public.termination_type NOT NULL,
  motivo                text NOT NULL,
  data_prevista         date NOT NULL,
  ultimo_dia_trabalhado date,
  gestor_imediato       text,
  matricula             text,
  observacoes           text,
  status                public.termination_status NOT NULL DEFAULT 'rascunho',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.termination_requests ENABLE ROW LEVEL SECURITY;

-- RH, Diretoria e Administrativo gerenciam desligamentos
CREATE POLICY "RH manages termination_requests" ON public.termination_requests
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'rh'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role)
  );

-- Solicitante pode ver suas próprias solicitações
CREATE POLICY "Requester can view own termination_requests" ON public.termination_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE INDEX idx_termination_requests_collaborator ON public.termination_requests(collaborator_id);
CREATE INDEX idx_termination_requests_status ON public.termination_requests(status);
CREATE INDEX idx_termination_requests_requester ON public.termination_requests(requester_user_id);

-- O Trigger set_updated_at já deve existir na baseline (já que ele é padrão para tabelas).
-- Se der erro, verificaremos, mas a func set_updated_at costuma estar lá.
CREATE TRIGGER set_termination_requests_updated_at
  BEFORE UPDATE ON public.termination_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 3. REGISTRO DO MÓDULO NO APPROVAL ENGINE
-- ------------------------------------------------------------
INSERT INTO public.approval_modules (code, name)
VALUES ('desligamentos', 'Desligamentos')
ON CONFLICT (code) DO NOTHING;
