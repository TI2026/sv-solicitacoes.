SELECT count(*) AS flow_count
FROM public.approval_flows;

SELECT count(*) AS step_count
FROM public.approval_flow_steps;

SELECT
  am.key AS module_key,
  af.id AS flow_id,
  af.name AS flow_name,
  af.version,
  af.active AS flow_active,
  afs.id AS flow_step_id,
  afs.step_order,
  afs.step_code,
  afs.name AS existing_name,
  afs.approver_type,
  afs.approver_user_id,
  afs.role,
  afs.setor,
  afs.sla_hours,
  afs.active AS step_active
FROM public.approval_flow_steps afs
JOIN public.approval_flows af
  ON af.id = afs.flow_id
JOIN public.approval_modules am
  ON am.id = af.module_id
ORDER BY am.key, af.version, afs.step_order;
