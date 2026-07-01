
-- Dynamic categories table
CREATE TABLE public.dynamic_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  field_key text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on active categories
CREATE UNIQUE INDEX idx_dynamic_categories_unique 
  ON public.dynamic_categories (module, field_key, label) 
  WHERE is_active = true;

-- Index for fast lookups
CREATE INDEX idx_dynamic_categories_lookup 
  ON public.dynamic_categories (module, field_key, is_active);

-- Enable RLS
ALTER TABLE public.dynamic_categories ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active categories
CREATE POLICY "Anyone authenticated can view categories"
  ON public.dynamic_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Only diretoria can insert/update/delete
CREATE POLICY "Diretoria manages categories"
  ON public.dynamic_categories
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'diretoria'))
  WITH CHECK (has_role(auth.uid(), 'diretoria'));

-- Add pix_key_type column to fuel_requests
ALTER TABLE public.fuel_requests 
  ADD COLUMN IF NOT EXISTS pix_key_type text DEFAULT NULL;

-- Seed default categories from existing constants
INSERT INTO public.dynamic_categories (module, field_key, label) VALUES
  -- Reembolso categories
  ('fleet', 'reembolso_categoria', 'Viagem'),
  ('fleet', 'reembolso_categoria', 'Alimentação'),
  ('fleet', 'reembolso_categoria', 'Hospedagem'),
  ('fleet', 'reembolso_categoria', 'Transporte'),
  ('fleet', 'reembolso_categoria', 'Outros'),
  -- Diária categories
  ('fleet', 'diaria_categoria', 'Faxineira'),
  ('fleet', 'diaria_categoria', 'Pedreiro'),
  ('fleet', 'diaria_categoria', 'Ajudante'),
  ('fleet', 'diaria_categoria', 'Pintor'),
  ('fleet', 'diaria_categoria', 'Eletricista'),
  ('fleet', 'diaria_categoria', 'Encanador'),
  ('fleet', 'diaria_categoria', 'Outros');
