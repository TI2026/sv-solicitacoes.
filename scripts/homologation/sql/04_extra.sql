-- CHECKPOINT 1 — Etapas 13/14/15: concorrência, dashboard/fila, configuração e snapshot
\set ON_ERROR_STOP on

-- Entidade usada pelo teste de concorrência (executado por duas sessões paralelas)
DO $$
DECLARE eid uuid := public.hom_uid('conc_case');
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação concorrência', 'normal', 700, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');
END $$;
