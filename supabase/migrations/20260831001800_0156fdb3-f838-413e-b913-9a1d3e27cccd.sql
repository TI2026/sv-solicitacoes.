-- Desativa fluxo v1 órfão do módulo duplicado 'admissions' (0 requests vinculadas).
UPDATE public.approval_flows f
   SET active = false, updated_at = now()
  FROM public.approval_modules m
 WHERE m.id = f.module_id
   AND m.code = 'admissions'
   AND f.active
   AND coalesce(f.version, 'v1') <> 'v2'
   AND NOT EXISTS (SELECT 1 FROM public.approval_requests r WHERE r.flow_id = f.id);