-- ============================================================
-- Sprint 15 — Migration 001: purchases schema fix
-- PREFLIGHT OBRIGATÓRIO antes de executar:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'purchases' AND column_name = 'deleted_at';
-- Se retornar 0 linhas, a coluna está ausente (B1 confirmado).
-- Esta migration é IDEMPOTENTE via ADD COLUMN IF NOT EXISTS.
-- NÃO normaliza status. NÃO apaga dados.
-- ============================================================

-- ── PREFLIGHT READ-ONLY ─────────────────────────────────────
-- Executar antes de aplicar:
--
-- 1. Verificar existência da coluna:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='purchases' AND table_schema='public' AND column_name='deleted_at';
--
-- 2. Verificar status distintos (NÃO normalizar sem aprovação):
-- SELECT DISTINCT status FROM public.purchases ORDER BY status;
--
-- 3. Verificar policies ativas:
-- SELECT policyname FROM pg_policies WHERE tablename='purchases';
--
-- 4. Verificar indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename='purchases';
-- ────────────────────────────────────────────────────────────

-- 1. Adicionar coluna deleted_at se ausente (idempotente)
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Adicionar coluna notes para compras (OC, pagamento, entrega)
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS purchase_notes text;

-- 3. Adicionar coluna delivery_address para local de entrega
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS delivery_address text;

-- 4. Adicionar coluna delivery_date para data prevista de entrega
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS delivery_date date;

-- 5. Adicionar coluna tracking_code para rastreio
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS tracking_code text;

-- 6. Adicionar coluna confirmed_at para confirmação de recebimento
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 7. Adicionar coluna confirmed_by para quem confirmou o recebimento
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id);

-- 8. Garantir indexes existem (idempotente)
CREATE INDEX IF NOT EXISTS idx_purchases_requester   ON public.purchases(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status      ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at  ON public.purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_approval    ON public.purchases(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_purchases_deleted_at  ON public.purchases(deleted_at) WHERE deleted_at IS NULL;

-- 9. Recriar RLS policies com deleted_at (idempotente via DROP + CREATE)
-- NOTA: policies da Sprint 8 sem deleted_at devem ser substituídas
DROP POLICY IF EXISTS "Usuários podem ver suas próprias compras" ON public.purchases;
DROP POLICY IF EXISTS "Aprovadores e global podem ver todas as compras" ON public.purchases;
DROP POLICY IF EXISTS "Usuários podem criar compras" ON public.purchases;
DROP POLICY IF EXISTS "Apenas solicitante pode editar rascunhos ou retornados" ON public.purchases;
DROP POLICY IF EXISTS "Global pode editar qualquer compra" ON public.purchases;

-- As policies da Sprint 14 (20260722131759) já usam deleted_at — manter/recriar
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

-- 10. Grant
GRANT SELECT, INSERT, UPDATE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
