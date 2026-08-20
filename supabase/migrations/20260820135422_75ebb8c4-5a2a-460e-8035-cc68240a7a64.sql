-- ONDA D: invariante real de uma única request ativa por módulo + referência
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_requests_one_active_per_entity
  ON public.approval_requests (module_id, reference_id)
  WHERE ended_at IS NULL;