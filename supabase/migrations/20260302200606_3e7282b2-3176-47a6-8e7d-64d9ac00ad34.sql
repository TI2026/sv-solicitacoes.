
-- Fix: recreate views with security_invoker = true
CREATE OR REPLACE VIEW public.vw_admission_metrics
WITH (security_invoker = true)
AS
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status NOT IN ('concluido','cancelado')) AS pendentes,
  count(*) FILTER (WHERE status = 'concluido') AS concluidos,
  count(*) FILTER (WHERE status = 'cancelado') AS cancelados,
  coalesce(sum(salario_previsto), 0) AS salario_total,
  centro_custo,
  status
FROM public.admission_requests
GROUP BY centro_custo, status;

CREATE OR REPLACE VIEW public.vw_fuel_metrics
WITH (security_invoker = true)
AS
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status NOT IN ('aprovado','reprovado','encerrado')) AS pendentes,
  count(*) FILTER (WHERE status = 'aprovado') AS aprovados,
  count(*) FILTER (WHERE status = 'reprovado') AS reprovados,
  count(*) FILTER (WHERE status = 'encerrado') AS encerrados,
  coalesce(sum(valor), 0) AS valor_total,
  status
FROM public.fuel_requests
GROUP BY status;
