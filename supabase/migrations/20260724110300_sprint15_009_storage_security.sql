-- ============================================================
-- SPRINT 15.1: Migration 009 - Storage Security & URLs
-- ============================================================

-- Garante que o bucket 'admissions' nao seja publico
UPDATE storage.buckets
SET public = false
WHERE id = 'admissions';

-- Revoga a politica legada "Anyone can upload to admissions" (caso exista)
DROP POLICY IF EXISTS "Anyone can upload to admissions" ON storage.objects;
DROP POLICY IF EXISTS "Public uploads to admissions" ON storage.objects;
DROP POLICY IF EXISTS "Candidate uploads to admissions" ON storage.objects;

-- Apenas autenticados (ou roles especificos) e Service Role (usado pela Edge Function) devem inserir/ler
-- Nota: Service Role bypassa RLS, logo as insercoes feitas pela Edge Function (via server) vao funcionar.
CREATE POLICY "Admissions bucket requires authentication"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'admissions' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  )
  WITH CHECK (
    bucket_id = 'admissions' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  );

-- O mesmo para buckets de anexos de compras se necessário
UPDATE storage.buckets
SET public = false
WHERE id = 'purchases';

CREATE POLICY "Purchases bucket requires authentication"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'purchases' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  )
  WITH CHECK (
    bucket_id = 'purchases' AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  );
