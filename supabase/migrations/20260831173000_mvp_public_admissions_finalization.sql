-- MVP 1.0: atomic public Admissions finalization and bank-data persistence.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_agency text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_account_type text,
  ADD COLUMN IF NOT EXISTS has_dependents boolean;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.candidates'::regclass
      AND conname = 'candidates_bank_account_type_check'
  ) THEN
    ALTER TABLE public.candidates
      ADD CONSTRAINT candidates_bank_account_type_check
      CHECK (bank_account_type IS NULL OR bank_account_type IN ('corrente', 'poupanca'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_admission_public_link(
  p_token_hash text,
  p_bank_info jsonb DEFAULT NULL,
  p_has_dependents boolean DEFAULT NULL,
  p_client_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_link public.admission_public_links%ROWTYPE;
  v_bank_name text;
  v_bank_agency text;
  v_bank_account text;
  v_bank_account_type text;
  v_missing text[];
  v_required_personal constant text[] := ARRAY['RG_CNH','CPF','CTPS','RESIDENCIA','PIS_PASEP'];
  v_required_dependent constant text[] := ARRAY['DEP_CERTIDAO','DEP_CPF'];
  v_required_signature_admin constant text[] := ARRAY[
    'CONTRATO_TRABALHO_ADMIN',
    'FICHA_REGISTRO_ADMIN',
    'DECLARACAO_DEPENDENTES_IRRF_ADMIN',
    'AUTORIZACAO_DESCONTO_VT_ADMIN'
  ];
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PUBLIC_LINK_INVALID';
  END IF;

  SELECT *
    INTO v_link
  FROM public.admission_public_links
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_link.used_at IS NOT NULL OR v_link.expires_at <= now() THEN
    RAISE EXCEPTION 'PUBLIC_LINK_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.candidates c
    WHERE c.id = v_link.candidate_id
      AND c.admission_request_id = v_link.admission_request_id
  ) THEN
    RAISE EXCEPTION 'PUBLIC_LINK_CANDIDATE_MISMATCH';
  END IF;

  IF v_link.link_type = 'DOCUMENTS' THEN
    IF p_bank_info IS NULL OR jsonb_typeof(p_bank_info) <> 'object' OR p_has_dependents IS NULL THEN
      RAISE EXCEPTION 'BANK_DATA_REQUIRED';
    END IF;

    v_bank_name := NULLIF(trim(p_bank_info->>'banco'), '');
    v_bank_agency := regexp_replace(coalesce(p_bank_info->>'agencia', ''), '\D', '', 'g');
    v_bank_account := regexp_replace(coalesce(p_bank_info->>'conta', ''), '\D', '', 'g');
    v_bank_account_type := NULLIF(trim(p_bank_info->>'tipo'), '');

    IF v_bank_name IS NULL OR length(v_bank_name) > 80
       OR length(v_bank_agency) NOT BETWEEN 3 AND 12
       OR length(v_bank_account) NOT BETWEEN 3 AND 20
       OR v_bank_account_type NOT IN ('corrente', 'poupanca') THEN
      RAISE EXCEPTION 'BANK_DATA_INVALID';
    END IF;

    SELECT array_agg(required_key ORDER BY required_key)
      INTO v_missing
    FROM unnest(
      v_required_personal ||
      CASE WHEN p_has_dependents THEN v_required_dependent ELSE ARRAY[]::text[] END
    ) required_key
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.admission_files af
      WHERE af.admission_request_id = v_link.admission_request_id
        AND af.candidate_id = v_link.candidate_id
        AND af.link_type = 'DOCUMENTS'
        AND af.uploaded_by = 'CANDIDATE'
        AND af.file_type = required_key
    );

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION 'REQUIRED_DOCUMENTS_MISSING:%', array_to_string(v_missing, ',');
    END IF;

    UPDATE public.candidates
       SET bank_name = v_bank_name,
           bank_agency = v_bank_agency,
           bank_account = v_bank_account,
           bank_account_type = v_bank_account_type,
           has_dependents = p_has_dependents,
           updated_at = now()
     WHERE id = v_link.candidate_id;

  ELSIF v_link.link_type = 'SIGNATURE' THEN
    SELECT array_agg(required_key ORDER BY required_key)
      INTO v_missing
    FROM unnest(v_required_signature_admin) required_key
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.admission_files af
      WHERE af.admission_request_id = v_link.admission_request_id
        AND af.candidate_id = v_link.candidate_id
        AND af.link_type = 'SIGNATURE'
        AND af.uploaded_by = 'ADMIN'
        AND af.file_type = required_key
    );

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION 'ADMIN_SIGNATURE_DOCUMENTS_MISSING:%', array_to_string(v_missing, ',');
    END IF;

    SELECT array_agg(replace(admin_file.file_type, '_ADMIN', '_SIGNED') ORDER BY admin_file.file_type)
      INTO v_missing
    FROM public.admission_files admin_file
    WHERE admin_file.admission_request_id = v_link.admission_request_id
      AND admin_file.candidate_id = v_link.candidate_id
      AND admin_file.link_type = 'SIGNATURE'
      AND admin_file.uploaded_by = 'ADMIN'
      AND NOT EXISTS (
        SELECT 1
        FROM public.admission_files signed_file
        WHERE signed_file.admission_request_id = v_link.admission_request_id
          AND signed_file.candidate_id = v_link.candidate_id
          AND signed_file.link_type = 'SIGNATURE'
          AND signed_file.uploaded_by = 'CANDIDATE'
          AND signed_file.file_type = replace(admin_file.file_type, '_ADMIN', '_SIGNED')
      );

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION 'SIGNED_DOCUMENTS_MISSING:%', array_to_string(v_missing, ',');
    END IF;
  ELSE
    RAISE EXCEPTION 'PUBLIC_LINK_TYPE_INVALID';
  END IF;

  UPDATE public.admission_public_links
     SET used_at = now(),
         candidate_uploaded_at = now()
   WHERE id = v_link.id
     AND used_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLIC_LINK_ALREADY_FINALIZED';
  END IF;

  INSERT INTO public.audit_logs(action, entity_type, entity_id, details, ip_address)
  VALUES (
    'finalize_public_link',
    'candidates',
    v_link.candidate_id::text,
    jsonb_build_object(
      'link_type', v_link.link_type,
      'admission_request_id', v_link.admission_request_id,
      'finalized_at', now(),
      'audit_source', 'database_authoritative'
    ),
    NULLIF(left(p_client_ip, 64), '')
  );

  RETURN jsonb_build_object(
    'success', true,
    'link_type', v_link.link_type,
    'candidate_id', v_link.candidate_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_admission_public_link(text,jsonb,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_admission_public_link(text,jsonb,boolean,text) TO service_role;
