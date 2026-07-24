
CREATE TABLE public.admission_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_request_id uuid NOT NULL REFERENCES public.admission_requests(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  conducted_by uuid REFERENCES public.profiles(id),
  interview_mode text DEFAULT 'presencial',
  interview_address text,
  interview_city text,
  meeting_link text,
  result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admission_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and RH manage admission_interviews"
  ON public.admission_interviews
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'diretoria'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'rh'::app_role)
  );

CREATE INDEX idx_admission_interviews_candidate ON public.admission_interviews(candidate_id);
CREATE INDEX idx_admission_interviews_admission ON public.admission_interviews(admission_request_id);
