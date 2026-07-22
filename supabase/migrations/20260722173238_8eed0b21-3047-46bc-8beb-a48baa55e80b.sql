-- Alinhar políticas do bucket purchase-attachments ao padrão Fleet
DROP POLICY IF EXISTS purchase_attachments_read ON storage.objects;
DROP POLICY IF EXISTS purchase_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS purchase_attachments_delete ON storage.objects;

-- Leitura: dono da purchase, aprovadores/admin/master
CREATE POLICY "Users can read own purchase files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'purchase-attachments'
  AND (
    current_has_role('diretoria'::app_role)
    OR current_has_role('administrativo'::app_role)
    OR current_has_role('master'::app_role)
    OR current_has_role('financeiro'::app_role)
    OR current_has_role('compras'::app_role)
    OR (storage.foldername(name))[2] IN (
      SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()
    )
  )
);

-- Insert: solicitante (edge function usa service role e ignora)
CREATE POLICY "Users can upload own purchase files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'purchase-attachments'
  AND (
    current_has_role('diretoria'::app_role)
    OR current_has_role('administrativo'::app_role)
    OR (storage.foldername(name))[2] IN (
      SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()
    )
  )
);

-- Delete: solicitante do rascunho ou admin
CREATE POLICY "Users can delete own purchase files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'purchase-attachments'
  AND (
    current_has_role('diretoria'::app_role)
    OR current_has_role('administrativo'::app_role)
    OR current_has_role('master'::app_role)
    OR (storage.foldername(name))[2] IN (
      SELECT p.id::text FROM public.purchases p WHERE p.requester_user_id = auth.uid()
    )
  )
);