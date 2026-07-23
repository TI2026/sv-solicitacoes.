
-- =============================================
-- EPI MODULE — CORRECTED MIGRATION
-- =============================================

-- 1. collaborators
CREATE TABLE IF NOT EXISTS public.collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  cpf text,
  sector_id uuid REFERENCES public.sectors(id),
  role_name text NOT NULL DEFAULT '',
  worksite text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ativo',
  admission_request_id uuid,
  user_profile_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins RH manage collaborators" ON public.collaborators
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

CREATE INDEX idx_collaborators_sector ON public.collaborators(sector_id);
CREATE INDEX idx_collaborators_active ON public.collaborators(active);

CREATE TRIGGER set_collaborators_updated_at
  BEFORE UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. epi_items
CREATE TABLE IF NOT EXISTS public.epi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL DEFAULT '',
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Outros',
  manufacturer text NOT NULL DEFAULT '',
  ca_number text NOT NULL DEFAULT '',
  ca_valid_until date,
  useful_life_days integer,
  size_required boolean NOT NULL DEFAULT false,
  unit text NOT NULL DEFAULT 'un',
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epi_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins RH manage epi_items" ON public.epi_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

CREATE INDEX idx_epi_items_active ON public.epi_items(active);
CREATE INDEX idx_epi_items_category ON public.epi_items(category);

CREATE TRIGGER set_epi_items_updated_at
  BEFORE UPDATE ON public.epi_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. epi_deliveries
CREATE TABLE IF NOT EXISTS public.epi_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id),
  epi_item_id uuid NOT NULL REFERENCES public.epi_items(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  size text,
  delivered_by_user_id uuid NOT NULL REFERENCES public.profiles(id),
  delivered_at timestamptz NOT NULL DEFAULT now(),
  sector_id uuid REFERENCES public.sectors(id),
  worksite text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT 'primeira_entrega' CHECK (reason IN ('primeira_entrega','troca','reposicao','desgaste','perda','outro')),
  current_status text NOT NULL DEFAULT 'entregue' CHECK (current_status IN ('entregue','em_uso','devolvido','substituido','pendente_devolucao','perdido','baixado')),
  notes text NOT NULL DEFAULT '',
  signature_employee_url text,
  signature_responsible_url text,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epi_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins RH manage epi_deliveries" ON public.epi_deliveries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

CREATE INDEX idx_epi_deliveries_collaborator ON public.epi_deliveries(collaborator_id);
CREATE INDEX idx_epi_deliveries_item ON public.epi_deliveries(epi_item_id);
CREATE INDEX idx_epi_deliveries_status ON public.epi_deliveries(current_status);

CREATE TRIGGER set_epi_deliveries_updated_at
  BEFORE UPDATE ON public.epi_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. epi_movements
CREATE TABLE IF NOT EXISTS public.epi_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.epi_deliveries(id),
  movement_type text NOT NULL DEFAULT 'delivery' CHECK (movement_type IN ('delivery','return','replacement','loss','disposal','adjustment')),
  moved_by_user_id uuid NOT NULL REFERENCES public.profiles(id),
  moved_at timestamptz NOT NULL DEFAULT now(),
  condition text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epi_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins RH manage epi_movements" ON public.epi_movements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

CREATE INDEX idx_epi_movements_delivery ON public.epi_movements(delivery_id);

-- 5. epi_kit_rules
CREATE TABLE IF NOT EXISTS public.epi_kit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid REFERENCES public.sectors(id),
  role_name text NOT NULL DEFAULT '',
  epi_item_id uuid NOT NULL REFERENCES public.epi_items(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epi_kit_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins RH manage epi_kit_rules" ON public.epi_kit_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'))
  WITH CHECK (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh'));

CREATE INDEX idx_epi_kit_rules_sector ON public.epi_kit_rules(sector_id);
CREATE INDEX idx_epi_kit_rules_item ON public.epi_kit_rules(epi_item_id);

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('epis', 'epis', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins RH upload epis" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'epis' AND (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh')));

CREATE POLICY "Admins RH read epis" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'epis' AND (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh')));

CREATE POLICY "Admins RH delete epis" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'epis' AND (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'rh')));
