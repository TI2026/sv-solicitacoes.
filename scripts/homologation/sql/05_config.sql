-- CHECKPOINT 1 — Etapas 14/15: dashboard/fila e persistência de configuração + snapshot
\set ON_ERROR_STOP on

DO $$
DECLARE q int; d jsonb; pend int;
BEGIN
  PERFORM public.hom_auth('C');
  SELECT count(*) INTO q FROM public.get_my_approval_queue();
  d := public.get_dashboard_metrics();
  PERFORM public.hom_reset_auth();
  SELECT count(*) INTO pend FROM public.approval_requests ar
   WHERE ar.current_approver_user_id = public.hom_uid('C')
     AND ar.status = 'awaiting_step' AND ar.ended_at IS NULL;
  PERFORM public.hom_check('DASHBOARD','fila de C = regra canônica do backend', q = pend, format('fila=%s regra=%s', q, pend));
  PERFORM public.hom_check('DASHBOARD','métricas retornam objeto real (sem zero falso)',
    d IS NOT NULL AND d <> '{}'::jsonb, left(d::text, 120));
END $$;

-- Persistência da configuração + snapshot da solicitação já iniciada
DO $$
DECLARE v_step uuid; v_before uuid; v_after uuid; eid uuid := public.hom_uid('snap_case'); res jsonb; saved uuid;
BEGIN
  SELECT st.id INTO v_step
    FROM public.approval_flow_steps st
    JOIN public.approval_flows f ON f.id = st.flow_id
    JOIN public.approval_modules m ON m.id = f.module_id
   WHERE f.version = 'v2' AND m.code = 'compras' AND st.step_order = 1;

  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação snapshot', 'normal', 450, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');

  SELECT current_approver_user_id INTO v_before FROM public.approval_requests WHERE reference_id = eid;

  -- Master troca o responsável da etapa 1 (B -> D)
  PERFORM public.hom_auth('M');
  res := public.save_approval_step_assignment(v_step, 'person', public.hom_uid('D'), public.hom_uid('S'), NULL, 1);
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('CONFIGURACAO','Master salva assignment da etapa',
    coalesce(res->>'error','') = '', res::text);

  SELECT approver_user_id INTO saved FROM public.approval_flow_steps WHERE id = v_step;
  PERFORM public.hom_check('CONFIGURACAO','configuração permanece salva após reabrir',
    saved = public.hom_uid('D'), coalesce(saved::text,'-'));

  SELECT current_approver_user_id INTO v_after FROM public.approval_requests WHERE reference_id = eid;
  PERFORM public.hom_check('CONFIGURACAO','solicitação em andamento mantém o snapshot',
    v_after = v_before, format('antes=%s depois=%s', v_before, v_after));

  -- Nova solicitação usa a nova configuração
  DELETE FROM public.approval_requests WHERE reference_id = public.hom_uid('snap_case2');
  DELETE FROM public.purchases WHERE id = public.hom_uid('snap_case2');
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (public.hom_uid('snap_case2'), public.hom_uid('A'), 'material', 'Homologação snapshot 2', 'normal', 460, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',public.hom_uid('snap_case2'),'enviar');
  SELECT current_approver_user_id INTO v_after FROM public.approval_requests WHERE reference_id = public.hom_uid('snap_case2');
  PERFORM public.hom_check('CONFIGURACAO','nova solicitação usa a nova configuração',
    v_after = public.hom_uid('D'), coalesce(v_after::text,'-'));

  -- Restaura B como responsável da etapa 1
  PERFORM public.hom_auth('M');
  PERFORM public.save_approval_step_assignment(v_step, 'person', public.hom_uid('B'), public.hom_uid('S'), NULL, 1);
  PERFORM public.hom_reset_auth();
END $$;

-- Colaborador comum não configura o motor
DO $$
DECLARE v_step uuid; res jsonb; ok boolean;
BEGIN
  SELECT st.id INTO v_step FROM public.approval_flow_steps st
    JOIN public.approval_flows f ON f.id = st.flow_id WHERE f.version='v2' LIMIT 1;
  PERFORM public.hom_auth('U');
  BEGIN
    res := public.save_approval_step_assignment(v_step, 'person', public.hom_uid('U'), NULL, NULL, 1);
    ok := coalesce(res->>'error','') <> '';
  EXCEPTION WHEN OTHERS THEN ok := true; res := jsonb_build_object('error', SQLERRM);
  END;
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('SEGURANCA','colaborador não configura etapas do motor', ok, res::text);
END $$;

SELECT step, name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, left(detail,80) AS detail
  FROM public.hom_results WHERE step IN ('DASHBOARD','CONFIGURACAO') OR id > (SELECT max(id)-1 FROM public.hom_results)
 ORDER BY id;
