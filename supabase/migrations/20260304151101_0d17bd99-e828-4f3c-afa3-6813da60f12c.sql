
-- Add interview and priority columns to candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_address text,
  ADD COLUMN IF NOT EXISTS interview_city text,
  ADD COLUMN IF NOT EXISTS interviewer_name text,
  ADD COLUMN IF NOT EXISTS interview_notes text,
  ADD COLUMN IF NOT EXISTS interview_approved boolean;

-- Add priority to admission_requests
ALTER TABLE public.admission_requests
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_candidates_admission_status ON public.candidates(admission_request_id, status_triagem);
CREATE INDEX IF NOT EXISTS idx_candidate_documents_candidate_status ON public.candidate_documents(candidate_id, status);
CREATE INDEX IF NOT EXISTS idx_status_history_entity_created ON public.status_history(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_requests_status_created ON public.admission_requests(status, created_at DESC);

-- Enable realtime for admission-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidate_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_exams;
