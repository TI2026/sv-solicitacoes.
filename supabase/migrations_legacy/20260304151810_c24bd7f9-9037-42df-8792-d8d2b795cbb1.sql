
-- Fix: make view security invoker (default, but explicit to satisfy linter)
DROP VIEW IF EXISTS public.vw_admissions_list_items;

CREATE VIEW public.vw_admissions_list_items
WITH (security_invoker = true)
AS
SELECT
  ar.id,
  ar.cargo_funcao,
  ar.centro_custo,
  ar.local_contratacao,
  ar.status,
  ar.priority,
  ar.salario_previsto,
  ar.data_prevista_inicio,
  ar.created_at,
  ar.requester_user_id,
  ar.tipo_contrato,
  ar.jornada,
  ar.gestor_responsavel,
  ar.motivo,
  p.full_name AS solicitante_nome,
  c_primary.nome AS candidato_nome,
  c_primary.id AS candidato_id,
  COALESCE(c_stats.total_candidatos, 0) AS total_candidatos,
  CASE
    WHEN c_primary.id IS NULL THEN 'sem_candidato'
    WHEN doc_stats.total_docs = 0 THEN 'pendente'
    WHEN doc_stats.approved_docs = doc_stats.total_docs THEN 'completo'
    WHEN doc_stats.submitted_or_approved > 0 THEN 'parcial'
    ELSE 'pendente'
  END AS documentos_status
FROM public.admission_requests ar
LEFT JOIN public.profiles p ON p.id = ar.requester_user_id
LEFT JOIN LATERAL (
  SELECT c.id, c.nome
  FROM public.candidates c
  WHERE c.admission_request_id = ar.id
    AND c.status_triagem NOT IN ('reprovado', 'desistente')
  ORDER BY
    CASE WHEN c.status_triagem = 'aprovado' THEN 0 ELSE 1 END,
    c.created_at DESC
  LIMIT 1
) c_primary ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS total_candidatos
  FROM public.candidates c2
  WHERE c2.admission_request_id = ar.id
) c_stats ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS total_docs,
    COUNT(*) FILTER (WHERE cd.status = 'approved')::int AS approved_docs,
    COUNT(*) FILTER (WHERE cd.status IN ('submitted', 'approved'))::int AS submitted_or_approved
  FROM public.candidate_documents cd
  WHERE cd.candidate_id = c_primary.id
) doc_stats ON true;
