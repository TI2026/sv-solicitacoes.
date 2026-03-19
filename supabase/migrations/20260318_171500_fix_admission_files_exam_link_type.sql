BEGIN;

ALTER TABLE public.admission_files
DROP CONSTRAINT IF EXISTS admission_files_link_type_check;

ALTER TABLE public.admission_files
ADD CONSTRAINT admission_files_link_type_check
CHECK (link_type IN ('DOCUMENTS', 'SIGNATURE', 'EXAM'));

COMMIT;
