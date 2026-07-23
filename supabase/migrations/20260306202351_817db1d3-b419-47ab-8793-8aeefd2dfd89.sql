
-- Add interview mode, meeting link, and confirmation fields to candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_mode text DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS interview_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_confirmed_by uuid;

-- Add welcome PDF fields to admission_requests
ALTER TABLE public.admission_requests
  ADD COLUMN IF NOT EXISTS welcome_local_apresentacao text,
  ADD COLUMN IF NOT EXISTS welcome_responsavel_nome text,
  ADD COLUMN IF NOT EXISTS welcome_responsavel_contato text;
