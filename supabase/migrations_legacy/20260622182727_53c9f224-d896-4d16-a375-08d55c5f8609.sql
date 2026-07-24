-- 1) Vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  modelo text NOT NULL,
  km integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','manutencao')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can list (needed by combobox)
CREATE POLICY "vehicles_select_authenticated"
  ON public.vehicles FOR SELECT
  TO authenticated
  USING (true);

-- Only master or diretoria can mutate
CREATE POLICY "vehicles_insert_admin"
  ON public.vehicles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'diretoria')
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.is_master = TRUE
    )
  );

CREATE POLICY "vehicles_update_admin"
  ON public.vehicles FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'diretoria')
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.is_master = TRUE
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'diretoria')
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.is_master = TRUE
    )
  );

CREATE POLICY "vehicles_delete_admin"
  ON public.vehicles FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'diretoria')
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      WHERE ura.user_id = auth.uid() AND r.is_master = TRUE
    )
  );

-- Uppercase placa + updated_at trigger
CREATE OR REPLACE FUNCTION public.vehicles_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.placa := upper(trim(NEW.placa));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_normalize_trg ON public.vehicles;
CREATE TRIGGER vehicles_normalize_trg
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_normalize();

-- 2) Realtime publication
ALTER TABLE public.vehicles REPLICA IDENTITY FULL;
ALTER TABLE public.user_role_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_role_assignments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;