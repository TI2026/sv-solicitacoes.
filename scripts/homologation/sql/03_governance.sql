-- CHECKPOINT 1 — Etapas 5, 7, 10, 11, 12, 13, 14: governança do workflow (BANCO LOCAL)
\set ON_ERROR_STOP on

-- ============================================================
-- DEVOLUÇÃO / REENVIO / REJEIÇÃO / CANCELAMENTO / MASTER OVERRIDE
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('gov_return'); c1 public.entity_action_context; c2 public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'servico', 'Homologação devolução', 'normal', 500, 'rascunho');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_act('A','compras',eid,'enviar');
  c1 := public.hom_ctx('A','compras',eid);

  v := public.hom_act('B','compras',eid,'devolver','{"notes":"nao"}');
  PERFORM public.hom_check('GOVERNANCA','justificativa curta é recusada na devolução', public.hom_denied(v), v::text);
  PERFORM public.hom_check('GOVERNANCA','B devolve com justificativa válida',
    public.hom_ok(public.hom_act('B','compras',eid,'devolver','{"notes":"faltou orcamento detalhado"}')));

  c2 := public.hom_ctx('A','compras',eid);
  PERFORM public.hom_check('GOVERNANCA','devolvida volta a ser editável pelo solicitante', c2.can_edit, c2.current_status);
  PERFORM public.hom_check('GOVERNANCA','A reenvia',
    public.hom_ok(public.hom_act('A','compras',eid,'enviar','{"notes":"orcamento anexado"}')));
  c2 := public.hom_ctx('A','compras',eid);
  PERFORM public.hom_check('GOVERNANCA','reenvio mantém a mesma approval_request',
    c1.approval_request_id = c2.approval_request_id, coalesce(c2.approval_request_id::text,'-'));
  PERFORM public.hom_check('GOVERNANCA','reenvio mantém a mesma etapa',
    c1.current_step_code = c2.current_step_code, coalesce(c2.current_step_code,'-'));

  PERFORM public.hom_check('GOVERNANCA','B rejeita com justificativa',
    public.hom_ok(public.hom_act('B','compras',eid,'rejeitar','{"notes":"orcamento acima do teto"}')));
  c2 := public.hom_ctx('A','compras',eid);
  PERFORM public.hom_check('GOVERNANCA','rejeição encerra o fluxo',
    (SELECT status = 'rejected' AND ended_at IS NOT NULL FROM public.approval_requests WHERE id = c2.approval_request_id),
    c2.current_status);
  PERFORM public.hom_check('GOVERNANCA','rejeitada não aceita nova aprovação',
    public.hom_denied(public.hom_act('B','compras',eid,'aprovar','{"notes":"tentativa apos rejeicao"}')));
END $$;

DO $$
DECLARE eid uuid := public.hom_uid('gov_cancel'); v jsonb;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'servico', 'Homologação cancelamento', 'normal', 400, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');
  PERFORM public.hom_check('GOVERNANCA','U não cancela solicitação alheia',
    public.hom_denied(public.hom_act('U','compras',eid,'cancelar','{"notes":"cancelamento indevido"}')));
  PERFORM public.hom_check('GOVERNANCA','A cancela a própria solicitação',
    public.hom_ok(public.hom_act('A','compras',eid,'cancelar','{"notes":"desistencia do solicitante"}')));
  v := public.hom_act('A','compras',eid,'cancelar','{"notes":"tentativa de cancelar duas vezes"}');
  PERFORM public.hom_check('GOVERNANCA','cancelar novamente é negado', public.hom_denied(v), v::text);
END $$;

-- ============================================================
-- MASTER: não é aprovador automático e só atua pelo mecanismo auditado
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('gov_master'); c public.entity_action_context; v jsonb; n int;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação master', 'normal', 900, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');

  c := public.hom_ctx('M','compras',eid);
  PERFORM public.hom_check('MASTER','Master não é ator automático da etapa', NOT c.is_current_actor,
    coalesce(c.current_approver_name,'-'));
  v := public.hom_act('M','compras',eid,'aprovar','{"notes":"aprovacao master sem override"}');
  PERFORM public.hom_check('MASTER','Master não aprova pela via normal', public.hom_denied(v), v::text);

  v := public.hom_act('M','compras',eid,'master_override','{"notes":"curto"}');
  PERFORM public.hom_check('MASTER','override sem justificativa mínima é negado', public.hom_denied(v), v::text);
  v := public.hom_act('M','compras',eid,'master_override','{"notes":"override necessario por urgencia operacional documentada"}');
  PERFORM public.hom_check('MASTER','override auditado disponível', public.hom_ok(v), v::text);
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE entity_id = eid::text AND (action ILIKE '%override%' OR details::text ILIKE '%override%');
  PERFORM public.hom_check('MASTER','override registrado em auditoria', n > 0, n::text);
END $$;

-- ============================================================
-- ISOLAMENTO MÓDULO + REFERÊNCIA
-- ============================================================
DO $$
DECLARE c public.entity_action_context; n int;
BEGIN
  c := public.hom_ctx('A','reembolso', public.hom_uid('abast_e2e'));
  PERFORM public.hom_check('ISOLAMENTO','Abastecimento não é lido como Reembolso',
    c.current_status IS NULL OR c.approval_request_id IS NULL, coalesce(c.current_status,'null'));
  c := public.hom_ctx('A','diaria', public.hom_uid('reemb_e2e'));
  PERFORM public.hom_check('ISOLAMENTO','Reembolso não é lido como Diária',
    c.current_status IS NULL OR c.approval_request_id IS NULL, coalesce(c.current_status,'null'));
  c := public.hom_ctx('A','compras', public.hom_uid('diaria_e2e'));
  PERFORM public.hom_check('ISOLAMENTO','Diária não é lida como Compras',
    c.current_status IS NULL OR c.approval_request_id IS NULL, coalesce(c.current_status,'null'));

  SELECT count(*) INTO n
    FROM public.approval_requests ar
    JOIN public.approval_modules am ON am.id = ar.module_id
   WHERE ar.reference_id IN (public.hom_uid('abast_e2e'), public.hom_uid('diaria_e2e'), public.hom_uid('reemb_e2e'))
   GROUP BY ar.reference_id HAVING count(DISTINCT am.code) > 1;
  PERFORM public.hom_check('ISOLAMENTO','nenhuma referência compartilhada entre módulos', n IS NULL, coalesce(n::text,'0'));
END $$;

-- ============================================================
-- FILA, NOTIFICAÇÕES, REALTIME
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('fila_notif'); n int; q int; m int;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  DELETE FROM public.notifications WHERE user_id IN (public.hom_uid('A'), public.hom_uid('B'), public.hom_uid('C'));
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação fila', 'normal', 800, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');

  SELECT count(*) INTO n FROM public.notifications WHERE user_id = public.hom_uid('B');
  PERFORM public.hom_check('NOTIFICACOES','responsável da etapa 1 recebe notificação persistida', n > 0, n::text);
  SELECT count(*) INTO m FROM public.notifications
   WHERE user_id = public.hom_uid('B') AND metadata ? 'entity_id' AND metadata ? 'module_key';
  PERFORM public.hom_check('NOTIFICACOES','notificação carrega metadata de navegação', m > 0, m::text);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = public.hom_uid('U');
  PERFORM public.hom_check('NOTIFICACOES','usuário sem relação não é notificado', n = 0, n::text);

  PERFORM public.hom_auth('B');
  SELECT count(*) INTO q FROM public.get_my_approval_queue();
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('FILA','B vê a solicitação na própria fila', q > 0, q::text);

  PERFORM public.hom_auth('U');
  SELECT count(*) INTO q FROM public.get_my_approval_queue();
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('FILA','U tem fila vazia', q = 0, q::text);

  PERFORM public.hom_act('B','compras',eid,'aprovar','{"notes":"aprovado etapa 1 fila"}');
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = public.hom_uid('C');
  PERFORM public.hom_check('NOTIFICACOES','próximo responsável é notificado ao ativar a etapa', n > 0, n::text);
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = public.hom_uid('A');
  PERFORM public.hom_check('NOTIFICACOES','solicitante acompanha o andamento por notificação', n > 0, n::text);
END $$;

DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(t, ', ') INTO faltando
    FROM unnest(ARRAY['approval_requests','approval_request_steps','notifications','status_history',
                      'purchases','fuel_requests','admission_requests','termination_requests']) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public' AND pt.tablename = t
   );
  PERFORM public.hom_check('REALTIME','tabelas essenciais publicadas em supabase_realtime',
    faltando IS NULL, coalesce('faltando: '||faltando,'todas publicadas'));
END $$;

-- ============================================================
-- SLA / SUBSTITUTO
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('sla_case'); v jsonb; r record; n int;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação SLA', 'normal', 600, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',eid,'enviar');

  SELECT ars.sla_deadline IS NOT NULL AS has_sla, ars.activated_at IS NOT NULL AS activated
    INTO r
    FROM public.approval_request_steps ars
    JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
   WHERE ar.reference_id = eid AND ars.status = 'pending'
   ORDER BY ars.step_order LIMIT 1;
  PERFORM public.hom_check('SLA','SLA inicia quando a etapa é ativada', r.has_sla AND r.activated);

  -- Vence o prazo sem alterar produção: recua o deadline apenas desta etapa local
  UPDATE public.approval_request_steps ars
     SET sla_deadline = now() - interval '2 hours'
    FROM public.approval_requests ar
   WHERE ar.id = ars.approval_request_id AND ar.reference_id = eid AND ars.status = 'pending';

  v := public._engine_sla_sweep();
  PERFORM public.hom_check('SLA','sweep do servidor executa', v IS NOT NULL, v::text);

  SELECT ar.current_approver_user_id = public.hom_uid('S') AS to_sub,
         ars.overdue AS overdue, ars.escalated_at IS NOT NULL AS escalated
    INTO r
    FROM public.approval_requests ar
    JOIN public.approval_request_steps ars ON ars.approval_request_id = ar.id AND ars.status = 'pending'
   WHERE ar.reference_id = eid LIMIT 1;
  PERFORM public.hom_check('SLA','etapa vencida escala para o substituto elegível', coalesce(r.to_sub,false),
    format('overdue=%s escalated=%s', r.overdue, r.escalated));
  PERFORM public.hom_check('SLA','vencimento não aprova automaticamente',
    (SELECT status = 'awaiting_step' FROM public.approval_requests WHERE reference_id = eid));

  v := public._engine_sla_sweep();
  SELECT count(*) INTO n FROM public.approval_request_steps ars
    JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
   WHERE ar.reference_id = eid AND ars.escalated_at IS NOT NULL;
  PERFORM public.hom_check('SLA','escalonamento ocorre uma única vez (sweep idempotente)', n = 1, n::text);
  PERFORM public.hom_check('SLA','substituto assume e aprova',
    public.hom_ok(public.hom_act('S','compras',eid,'aprovar','{"notes":"aprovado pelo substituto apos SLA"}')));
END $$;

-- ============================================================
-- SEGURANÇA NEGATIVA (backend/RLS, não a UI)
-- ============================================================
DO $$
DECLARE n int; ok boolean;
BEGIN
  PERFORM public.hom_auth('U');
  SELECT count(*) INTO n FROM public.purchases WHERE requester_user_id = public.hom_uid('A');
  PERFORM public.hom_check('SEGURANCA','U não lê compras alheias', n = 0, n::text);
  SELECT count(*) INTO n FROM public.approval_requests;
  PERFORM public.hom_check('SEGURANCA','U não lê approval_requests alheias', n = 0, n::text);
  SELECT count(*) INTO n FROM public.approval_request_steps;
  PERFORM public.hom_check('SEGURANCA','U não lê etapas alheias', n = 0, n::text);
  SELECT count(*) INTO n FROM public.notifications;
  PERFORM public.hom_check('SEGURANCA','U não lê notificações alheias', n = 0, n::text);
  SELECT count(*) INTO n FROM public.documents;
  PERFORM public.hom_check('SEGURANCA','U não lê catálogo de documentos de admissão', n = 0, n::text);
  PERFORM public.hom_reset_auth();

  -- Alteração direta de status pelo cliente
  PERFORM public.hom_auth('A');
  BEGIN
    UPDATE public.fuel_requests SET status = 'pago' WHERE id = public.hom_uid('abast_e2e');
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('SEGURANCA','solicitante não altera status diretamente', ok);

  PERFORM public.hom_auth('U');
  BEGIN
    UPDATE public.approval_requests SET status = 'completed' WHERE reference_id = public.hom_uid('fila_notif');
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN n := 0;
  END;
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('SEGURANCA','ninguém altera approval_requests diretamente', n = 0, n::text);

  PERFORM public.hom_auth('DIR');
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (public.hom_uid('DIR'), 'master');
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  PERFORM public.hom_reset_auth();
  DELETE FROM public.user_roles WHERE user_id = public.hom_uid('DIR') AND role = 'master';
  PERFORM public.hom_check('SEGURANCA','Diretoria não escala para Master', ok);

  PERFORM set_config('role','anon',false);
  PERFORM set_config('request.jwt.claims','',false);
  BEGIN
    SELECT count(*) INTO n FROM public.purchases; EXCEPTION WHEN OTHERS THEN n := 0;
  END;
  PERFORM public.hom_check('SEGURANCA','anon não lê compras', n = 0, n::text);
  PERFORM public.hom_reset_auth();
END $$;

SELECT step, name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, left(detail,80) AS detail
  FROM public.hom_results
 WHERE step IN ('GOVERNANCA','MASTER','ISOLAMENTO','NOTIFICACOES','FILA','REALTIME','SLA','SEGURANCA')
 ORDER BY id;
