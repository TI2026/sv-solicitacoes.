
-- Add size fields to admission_requests
ALTER TABLE public.admission_requests
  ADD COLUMN IF NOT EXISTS shirt_size text,
  ADD COLUMN IF NOT EXISTS pants_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text;

-- Add size fields to collaborators
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS shirt_size text,
  ADD COLUMN IF NOT EXISTS pants_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text;
