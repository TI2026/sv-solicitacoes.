
-- Add assigned_to_user_id to fuel_requests for sector-based reviewer assignment
ALTER TABLE public.fuel_requests
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_requests_assigned_to
  ON public.fuel_requests(assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

-- Add welcome_pdf_generated_at to admission_requests
ALTER TABLE public.admission_requests
  ADD COLUMN IF NOT EXISTS welcome_pdf_generated_at timestamptz;
