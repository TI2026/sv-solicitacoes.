-- Migration para P2-08: Segurança de Upload (Storage Policies via Trigger)
-- Impõe validação estrita de tamanho e MIME Type diretamente no banco de dados para a tabela storage.objects,
-- impedindo uploads forjados ignorando o frontend.

CREATE OR REPLACE FUNCTION check_upload_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Validar Tamanho Máximo (10MB = 10485760 bytes)
  IF (NEW.metadata->>'size')::int > 10485760 THEN
    RAISE EXCEPTION 'Arquivo excede o limite de segurança de 10MB. Tamanho recebido: %', NEW.metadata->>'size';
  END IF;

  -- 2. Validar MIME Type Estrito
  -- Bloqueia executáveis, scripts ou outros arquivos maliciosos, permitindo apenas imagens e PDFs
  IF NEW.metadata->>'mimetype' NOT IN (
    'application/pdf', 
    'image/jpeg', 
    'image/png', 
    'image/webp',
    'image/jpg'
  ) THEN
    RAISE EXCEPTION 'Tipo de arquivo bloqueado por segurança: %', NEW.metadata->>'mimetype';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_check_upload_security ON storage.objects;

CREATE TRIGGER tr_check_upload_security
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION check_upload_security();
