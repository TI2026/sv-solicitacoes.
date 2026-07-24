-- ============================================================
-- Sprint 14 — Reativação do módulo Compras (Frente 1)
-- ============================================================

-- 1. TABELA OPERACIONAL
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  supplier text,
  category text NOT NULL,
  description text NOT NULL,
  justification text,
  cost_center text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('baixa','normal','alta')),
  estimated_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  approved_value numeric(12,2),
  purchase_number text,
  status text NOT NULL DEFAULT 'rascunho',
  approval_request_id uuid REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_purchases_requester ON public.purchases(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON public.purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_approval ON public.purchases(approval_request_id);

-- 4. RLS
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select_own" ON public.purchases;
CREATE POLICY "purchases_select_own"
  ON public.purchases FOR SELECT TO authenticated
  USING (auth.uid() = requester_user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "purchases_select_privileged" ON public.purchases;
CREATE POLICY "purchases_select_privileged"
  ON public.purchases FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.has_role(auth.uid(),'diretoria'::app_role) OR
      public.has_role(auth.uid(),'administrativo'::app_role) OR
      public.has_role(auth.uid(),'financeiro'::app_role) OR
      public.has_role(auth.uid(),'compras'::app_role) OR
      public.has_role(auth.uid(),'supervisor'::app_role) OR
      public.has_role(auth.uid(),'master'::app_role)
    )
  );

DROP POLICY IF EXISTS "purchases_select_approver" ON public.purchases;
CREATE POLICY "purchases_select_approver"
  ON public.purchases FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.approval_request_steps ars
      JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
      WHERE ar.reference_id = purchases.id
        AND ars.approver_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "purchases_insert_self" ON public.purchases;
CREATE POLICY "purchases_insert_self"
  ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_user_id
    AND status = 'rascunho'
    AND approval_request_id IS NULL
  );

DROP POLICY IF EXISTS "purchases_update_own_draft" ON public.purchases;
CREATE POLICY "purchases_update_own_draft"
  ON public.purchases FOR UPDATE TO authenticated
  USING (auth.uid() = requester_user_id AND status IN ('rascunho','retornado'))
  WITH CHECK (auth.uid() = requester_user_id);

DROP POLICY IF EXISTS "purchases_update_privileged" ON public.purchases;
CREATE POLICY "purchases_update_privileged"
  ON public.purchases FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'diretoria'::app_role) OR
    public.has_role(auth.uid(),'administrativo'::app_role) OR
    public.has_role(auth.uid(),'compras'::app_role) OR
    public.has_role(auth.uid(),'financeiro'::app_role) OR
    public.has_role(auth.uid(),'master'::app_role)
  );

-- 5. TRIGGERS
DROP TRIGGER IF EXISTS trg_purchases_updated_at ON public.purchases;
CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_purchases_status_change ON public.purchases;
CREATE TRIGGER trg_purchases_status_change
  AFTER UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.track_status_change('compras');

-- 6. REALTIME (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='purchases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
  END IF;
END $$;

-- 7. GARANTIR MÓDULO ATIVO
INSERT INTO public.approval_modules (code, name, active)
VALUES ('compras','Compras', true)
ON CONFLICT (code) DO UPDATE SET active = true;

-- 8. RPC submit_purchase_request (wrapper que aciona start_approval_flow)
CREATE OR REPLACE FUNCTION public.submit_purchase_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow_res jsonb;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('code','AUTH-401','message','Não autenticado');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM public.purchases
      WHERE id = p_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.requester_user_id <> _uid THEN
    RETURN jsonb_build_object('code','ENGINE-403','message','Apenas o solicitante pode enviar');
  END IF;

  IF _req.status NOT IN ('rascunho','retornado') THEN
    RETURN jsonb_build_object('code','ENGINE-400',
      'message', format('Transição inválida a partir do status "%s"', _req.status));
  END IF;

  IF EXISTS (SELECT 1 FROM public.approval_requests
             WHERE reference_id = p_request_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('code','ENGINE-409','message','Já existe fluxo ativo');
  END IF;

  _flow_res := public.start_approval_flow('compras', p_request_id, _uid);

  IF _flow_res ? 'error' THEN
    RETURN jsonb_build_object('code','ENGINE-500','message', _flow_res->>'error');
  END IF;

  UPDATE public.purchases
    SET status = 'em_aprovacao',
        approval_request_id = (_flow_res->>'approval_request_id')::uuid
    WHERE id = p_request_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'submit_for_approval', 'purchases', p_request_id::text,
    jsonb_build_object('approval_request_id', _flow_res->>'approval_request_id'));

  RETURN jsonb_build_object('success', true,
    'approval_request_id', _flow_res->>'approval_request_id',
    'status', 'em_aprovacao');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_purchase_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_purchase_request(uuid) TO authenticated;

-- 9. STORAGE POLICIES (bucket já criado via tool)
DROP POLICY IF EXISTS "purchase_attachments_read" ON storage.objects;
CREATE POLICY "purchase_attachments_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(),'diretoria'::app_role)
      OR public.has_role(auth.uid(),'administrativo'::app_role)
      OR public.has_role(auth.uid(),'financeiro'::app_role)
      OR public.has_role(auth.uid(),'compras'::app_role)
      OR public.has_role(auth.uid(),'supervisor'::app_role)
      OR public.has_role(auth.uid(),'master'::app_role)
    )
  );

DROP POLICY IF EXISTS "purchase_attachments_insert" ON storage.objects;
CREATE POLICY "purchase_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "purchase_attachments_delete" ON storage.objects;
CREATE POLICY "purchase_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'purchase-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(),'diretoria'::app_role)
      OR public.has_role(auth.uid(),'administrativo'::app_role)
      OR public.has_role(auth.uid(),'master'::app_role)
    )
  );