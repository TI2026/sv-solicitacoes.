
ALTER TABLE public.admission_requests
  ADD COLUMN IF NOT EXISTS uniform_sizes jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS uniform_sizes jsonb DEFAULT '{}'::jsonb;
