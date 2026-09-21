-- CHECKPOINT 2 — verificação dos defeitos D-01 a D-04 + notificações,
-- histórico, concorrência e rollback (BANCO LOCAL).
\set ON_ERROR_STOP on

-- ============================================================
-- D-01 — Financeiro executa o pagamento de Compras
-- ============================================================
DO $$
DECLARE
  eid uuid := public.hom_uid('c2_compras');
  other uuid := public.hom_uid('c2_compras_alheia');
  c public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id IN (eid, other);
  DELETE FROM public.purchases WHERE id IN (eid, other);

  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Checkpoint 2 compras', 'normal', 1500, 'rascunho');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_check('D-01','A envia compra', public.hom_ok(public.hom_act('A','compras',eid,'enviar')));
  PERFORM public.hom_check('D-01','B aprova necessidade',
    public.hom_ok(public.hom_act('B','compras',eid,'aprovar','{"notes":"necessidade validada"}')));
  PERFORM public.hom_check('D-01','C aprova financeiramente',
    public.hom_ok(public.hom_act('C','compras',eid,'aprovar','{"notes":"orcamento aprovado"}')));

  -- Fase operacional
  PERFORM public.hom_check('D-01','Financeiro gera OC',
    public.hom_ok(public.hom_act('F','compras',eid,'gerar_oc','{"ocNumber":"OC-HOM-001","notes":"OC emitida"}')));

  c := public.hom_ctx('F','compras',eid);
  PERFORM public.hom_check('D-01','Financeiro visualiza a solicitação', c.entity_id = eid, coalesce(c.current_status,'-'));
  PERFORM public.hom_check('D-01','Financeiro recebe a ação pagar', c.allowed_actions ? 'pagar', c.allowed_actions::text);

  v := public.hom_act('F','compras',eid,'pagar','{"notes":"pagamento efetuado pelo financeiro"}');
  PERFORM public.hom_check('D-01','Financeiro executa pagar', public.hom_ok(v), v::text);

  PERFORM public.hom_check('D-01','Administrativo informa entrega',
    public.hom_ok(public.hom_act('C','compras',eid,'informar_entrega','{"notes":"material recebido"}')));
  PERFORM public.hom_check('D-01','Diretoria conclui',
    public.hom_ok(public.hom_act('DIR','compras',eid,'concluir','{"notes":"processo concluido"}')));
  PERFORM public.hom_check('D-01','status final concluído',
    (SELECT status = 'concluido' FROM public.purchases WHERE id = eid),
    (SELECT status FROM public.purchases WHERE id = eid));

  -- Financeiro NÃO vira superusuário em outros módulos
  PERFORM public.hom_check('D-01','Financeiro não age em Diária alheia',
    public.hom_denied(public.hom_act('F','diaria',public.hom_uid('diaria_e2e'),'aprovar','{"notes":"tentativa indevida financeiro"}')));
  PERFORM public.hom_check('D-01','Usuário sem relação não paga compra',
    public.hom_denied(public.hom_act('U','compras',eid,'pagar','{"notes":"tentativa indevida sem relacao"}')));
END $$;

-- ============================================================
-- D-02 — Notificação ao solicitante a cada avanço de etapa
-- ============================================================
DO $$
DECLARE
  eid uuid := public.hom_uid('c2_notif');
  n_req int; n_b int; n_c int; n_dup int;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  DELETE FROM public.notifications WHERE metadata->>'entity_id' = eid::text;

  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'servico', 'Checkpoint 2 notificacoes', 'normal', 800, 'rascunho');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_act('A','compras',eid,'enviar');
  SELECT count(*) INTO n_req FROM public.notifications
   WHERE user_id = public.hom_uid('A') AND metadata->>'entity_id' = eid::text;
  PERFORM public.hom_check('D-02','solicitante notificado no envio', n_req >= 1, n_req::text);
  SELECT count(*) INTO n_b FROM public.notifications
   WHERE user_id = public.hom_uid('B') AND metadata->>'entity_id' = eid::text;
  PERFORM public.hom_check('D-02','responsável da etapa 1 notificado', n_b >= 1, n_b::text);

  PERFORM public.hom_act('B','compras',eid,'aprovar','{"notes":"aprovado etapa um"}');
  SELECT count(*) INTO n_c FROM public.notifications
   WHERE user_id = public.hom_uid('C') AND metadata->>'entity_id' = eid::text;
  PERFORM public.hom_check('D-02','próximo responsável notificado', n_c >= 1, n_c::text);
  SELECT count(*) INTO n_req FROM public.notifications
   WHERE user_id = public.hom_uid('A') AND metadata->>'entity_id' = eid::text
     AND metadata->>'type' = 'approval_step_activated';
  PERFORM public.hom_check('D-02','solicitante notificado do avanço', n_req = 2, n_req::text);

  PERFORM public.hom_check('D-02','metadata mínima presente',
    (SELECT bool_and(metadata ? 'module_key' AND metadata ? 'entity_id'
                     AND metadata ? 'approval_request_id' AND metadata ? 'status')
       FROM public.notifications WHERE metadata->>'entity_id' = eid::text));

  -- idempotência: repetir a operação não duplica notificação
  PERFORM public.hom_act('B','compras',eid,'aprovar','{"notes":"tentativa duplicada de aprovacao"}');
  SELECT count(*) INTO n_dup FROM (
    SELECT user_id, metadata->>'event_key' k, count(*) qt
      FROM public.notifications
     WHERE metadata->>'entity_id' = eid::text AND metadata->>'event_key' IS NOT NULL
     GROUP BY 1,2 HAVING count(*) > 1) x;
  PERFORM public.hom_check('D-02','nenhuma notificação duplicada', n_dup = 0, n_dup::text);
END $$;

-- ============================================================
-- D-03 — status_history operacional + approval_history
-- ============================================================
DO $$
DECLARE
  eid uuid := public.hom_uid('c2_notif');
  n int; dup int; ord boolean;
BEGIN
  SELECT count(*) INTO n FROM public.status_history WHERE entity_id = eid;
  PERFORM public.hom_check('D-03','status_history registrado para a entidade', n >= 1, n::text);

  PERFORM public.hom_check('D-03','campos obrigatórios preenchidos',
    (SELECT bool_and(to_status IS NOT NULL AND changed_by IS NOT NULL
                     AND entity_type IS NOT NULL AND module IS NOT NULL
                     AND created_at IS NOT NULL)
       FROM public.status_history WHERE entity_id = eid));

  PERFORM public.hom_check('D-03','entity_type canônico',
    (SELECT bool_and(entity_type = 'purchases') FROM public.status_history WHERE entity_id = eid),
    (SELECT string_agg(DISTINCT entity_type, ',') FROM public.status_history WHERE entity_id = eid));

  SELECT count(*) INTO dup FROM (
    SELECT from_status, to_status, count(*) qt
      FROM public.status_history WHERE entity_id = eid
     GROUP BY 1,2 HAVING count(*) > 1) x;
  PERFORM public.hom_check('D-03','sem duplicidade de transição', dup = 0, dup::text);

  SELECT bool_and(ok) INTO ord FROM (
    SELECT created_at >= lag(created_at) OVER (ORDER BY created_at) IS NOT FALSE AS ok
      FROM public.status_history WHERE entity_id = eid) y;
  PERFORM public.hom_check('D-03','ordenação cronológica', coalesce(ord,true));

  SELECT count(*) INTO n FROM public.approval_history ah
    JOIN public.approval_requests ar ON ar.id = ah.approval_request_id
   WHERE ar.reference_id = eid;
  PERFORM public.hom_check('D-03','approval_history registrado pelo motor V2', n >= 1, n::text);

  SELECT count(*) INTO n FROM public.audit_logs WHERE entity_id = eid::text;
  PERFORM public.hom_check('D-03','audit_logs preservado', n >= 2, n::text);
END $$;

-- ============================================================
-- D-04 — exclusão não deixa fluxo órfão
-- ============================================================
DO $$
DECLARE
  draft uuid := public.hom_uid('c2_draft');
  active uuid := public.hom_uid('c2_active');
  ok boolean; n int;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id IN (draft, active);
  DELETE FROM public.purchases WHERE id IN (draft, active);

  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (draft, public.hom_uid('A'), 'material', 'Checkpoint 2 rascunho', 'normal', 100, 'rascunho'),
         (active, public.hom_uid('A'), 'material', 'Checkpoint 2 ativo', 'normal', 100, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_act('A','compras',active,'enviar');

  -- rascunho sem workflow continua excluível
  BEGIN
    DELETE FROM public.purchases WHERE id = draft;
    ok := NOT EXISTS (SELECT 1 FROM public.purchases WHERE id = draft);
  EXCEPTION WHEN OTHERS THEN ok := false;
  END;
  PERFORM public.hom_check('D-04','rascunho sem fluxo pode ser excluído', ok);

  -- workflow ativo bloqueia exclusão física
  BEGIN
    DELETE FROM public.purchases WHERE id = active;
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true;
  END;
  PERFORM public.hom_check('D-04','workflow ativo bloqueia exclusão física', ok);

  SELECT count(*) INTO n FROM public.approval_requests WHERE reference_id = active;
  PERFORM public.hom_check('D-04','fluxo permanece íntegro após tentativa', n = 1, n::text);

  SELECT count(*) INTO n FROM public.approval_requests ar
   WHERE NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = ar.reference_id)
     AND ar.module_id = (SELECT id FROM public.approval_modules WHERE code = 'compras');
  PERFORM public.hom_check('D-04','nenhum fluxo órfão de Compras', n = 0, n::text);

  SELECT count(*) INTO n FROM public.approval_request_steps ars
   WHERE NOT EXISTS (SELECT 1 FROM public.approval_requests ar WHERE ar.id = ars.approval_request_id);
  PERFORM public.hom_check('D-04','nenhuma etapa órfã', n = 0, n::text);
END $$;

-- ============================================================
-- CONCORRÊNCIA E ROLLBACK
-- ============================================================
DO $$
DECLARE
  eid uuid := public.hom_uid('c2_conc');
  v1 jsonb; v2 jsonb; n int; before_status text;
BEGIN
  DELETE FROM public.approval_requests WHERE reference_id = eid;
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Checkpoint 2 concorrencia', 'normal', 400, 'rascunho');
  PERFORM public.hom_reset_auth();

  v1 := public.hom_act('A','compras',eid,'enviar');
  v2 := public.hom_act('A','compras',eid,'enviar');
  PERFORM public.hom_check('CONCORRENCIA','segundo envio não cria nova approval_request',
    (SELECT count(*) FROM public.approval_requests WHERE reference_id = eid) = 1,
    v2::text);

  v1 := public.hom_act('B','compras',eid,'aprovar','{"notes":"primeira aprovacao valida"}');
  v2 := public.hom_act('B','compras',eid,'aprovar','{"notes":"segunda aprovacao concorrente"}');
  PERFORM public.hom_check('CONCORRENCIA','segunda aprovação é recusada',
    public.hom_ok(v1) AND public.hom_denied(v2), v2::text);

  SELECT count(*) INTO n FROM public.approval_request_steps
   WHERE approval_request_id = (SELECT id FROM public.approval_requests WHERE reference_id = eid)
     AND status = 'approved';
  PERFORM public.hom_check('CONCORRENCIA','apenas uma transição de etapa efetivada', n = 1, n::text);

  -- rollback: falha controlada dentro da transação da ação
  SELECT status INTO before_status FROM public.purchases WHERE id = eid;
  BEGIN
    PERFORM public.execute_entity_action('compras', eid, 'aprovar', '{"notes":"forcando falha controlada"}'::jsonb);
    RAISE EXCEPTION 'ROLLBACK_TESTE';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM public.hom_check('ROLLBACK','status preservado após falha',
    (SELECT status FROM public.purchases WHERE id = eid) = before_status,
    (SELECT status FROM public.purchases WHERE id = eid));
  SELECT count(*) INTO n FROM public.status_history
   WHERE entity_id = eid AND to_status IS DISTINCT FROM before_status
     AND created_at > now() - interval '5 seconds';
  PERFORM public.hom_check('ROLLBACK','nenhum histórico órfão criado', n = 0, n::text);
END $$;
