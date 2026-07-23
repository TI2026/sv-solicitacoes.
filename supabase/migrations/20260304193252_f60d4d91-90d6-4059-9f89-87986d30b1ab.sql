
-- Create admission_public_links table for persistent link management
CREATE TABLE IF NOT EXISTS public.admission_public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_request_id uuid NOT NULL REFERENCES public.admission_requests(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('DOCUMENTS', 'SIGNATURE')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  admin_uploaded_at timestamptz,
  candidate_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_apl_candidate_type ON public.admission_public_links (admission_request_id, candidate_id, link_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apl_token_hash ON public.admission_public_links (token_hash);

-- Enable RLS
ALTER TABLE public.admission_public_links ENABLE ROW LEVEL SECURITY;

-- RLS: Admins/RH can manage
CREATE POLICY "Admins and RH manage admission_public_links"
  ON public.admission_public_links
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

-- Create admission_files table for tracking uploads
CREATE TABLE IF NOT EXISTS public.admission_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_request_id uuid NOT NULL REFERENCES public.admission_requests(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  file_type text NOT NULL DEFAULT 'generic',
  storage_path text NOT NULL,
  original_filename text,
  uploaded_by text NOT NULL CHECK (uploaded_by IN ('CANDIDATE', 'ADMIN')),
  link_type text NOT NULL CHECK (link_type IN ('DOCUMENTS', 'SIGNATURE')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admission_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and RH manage admission_files"
  ON public.admission_files
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

-- Drop old generate_candidate_token that uses gen_random_bytes
DROP FUNCTION IF EXISTS public.generate_candidate_token(uuid, integer);
