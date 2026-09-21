-- CHECKPOINT 1 — Etapas 6/7/8/9: seis fluxos ponta a ponta (BANCO LOCAL)
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.hom_act(p_persona text, p_module text, p_entity uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.hom_auth(p_persona);
  BEGIN
    v := public.execute_entity_action(p_module, p_entity, p_action, p_payload);
  EXCEPTION WHEN OTHERS THEN
    v := jsonb_build_object('code', 500, 'success', false, 'error', SQLERRM);
  END;
  PERFORM public.hom_reset_auth();
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.hom_ok(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT v IS NOT NULL
     AND coalesce((v->>'success')::boolean, true)
     AND coalesce((v->>'code')::int, 200) BETWEEN 200 AND 299
$$;

CREATE OR REPLACE FUNCTION public.hom_denied(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT public.hom_ok(v)
$$;

CREATE OR REPLACE FUNCTION public.hom_ctx(p_persona text, p_module text, p_entity uuid)
RETURNS public.entity_action_context LANGUAGE plpgsql AS $$
DECLARE c public.entity_action_context;
BEGIN
  PERFORM public.hom_auth(p_persona);
  c := public.get_entity_action_context(p_module, p_entity);
  PERFORM public.hom_reset_auth();
  RETURN c;
END $$;

-- ============================================================
-- COMPRAS: envio -> aprovação 1 -> aprovação 2 -> OC -> pagamento -> entrega -> conclusão
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('compras_e2e'); c public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.purchases WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.purchases (id, requester_user_id, category, description, priority, estimated_value, status)
  VALUES (eid, public.hom_uid('A'), 'material', 'Homologação Compras', 'normal', 1000, 'rascunho');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('COMPRAS','A cria rascunho (RLS insert)', true);

  c := public.hom_ctx('A','compras',eid);
  PERFORM public.hom_check('COMPRAS','can_edit do solicitante no rascunho', c.can_edit, c.current_status);
  PERFORM public.hom_check('COMPRAS','enviar disponível no Action Context', c.allowed_actions ? 'enviar', c.allowed_actions::text);

  PERFORM public.hom_check('COMPRAS','A envia', public.hom_ok(public.hom_act('A','compras',eid,'enviar')));
  c := public.hom_ctx('B','compras',eid);
  PERFORM public.hom_check('COMPRAS','B é ator da etapa 1', c.is_current_actor, coalesce(c.current_step_code,'-'));
  PERFORM public.hom_check('COMPRAS','Action Context traz nomes reais',
    c.requester_name = 'A Solicitante' AND c.current_approver_name = 'B Aprovador 1',
    coalesce(c.requester_name,'-')||' / '||coalesce(c.current_approver_name,'-'));
  PERFORM public.hom_check('COMPRAS','can_edit falso após envio', NOT c.can_edit);
  PERFORM public.hom_check('COMPRAS','U não executa ação alheia',
    public.hom_denied(public.hom_act('U','compras',eid,'aprovar', '{"notes":"tentativa indevida do U"}')));
  PERFORM public.hom_check('COMPRAS','A não aprova a própria solicitação',
    public.hom_denied(public.hom_act('A','compras',eid,'aprovar', '{"notes":"autoaprovacao indevida"}')));
  PERFORM public.hom_check('COMPRAS','C não atua antes da ativação da etapa 2',
    public.hom_denied(public.hom_act('C','compras',eid,'aprovar', '{"notes":"atuacao antecipada"}')));
  PERFORM public.hom_check('COMPRAS','B aprova etapa 1',
    public.hom_ok(public.hom_act('B','compras',eid,'aprovar','{"notes":"aprovado etapa 1"}')));
  c := public.hom_ctx('C','compras',eid);
  PERFORM public.hom_check('COMPRAS','C vira ator da etapa 2', c.is_current_actor, coalesce(c.current_step_code,'-'));
  PERFORM public.hom_check('COMPRAS','C aprova etapa 2',
    public.hom_ok(public.hom_act('C','compras',eid,'aprovar','{"notes":"aprovado etapa 2"}')));

  c := public.hom_ctx('C','compras',eid);
  PERFORM public.hom_check('COMPRAS','pós-aprovação: status operacional aguardando OC',
    c.current_status = 'aguardando_oc', c.current_status);
  PERFORM public.hom_check('COMPRAS','gerar_oc',
    public.hom_ok(public.hom_act('C','compras',eid,'gerar_oc','{"ocNumber":"OC-HOM-1","notes":"ordem emitida"}')));
  PERFORM public.hom_check('COMPRAS','pagar',
    public.hom_ok(public.hom_act('F','compras',eid,'pagar','{"notes":"pagamento efetuado"}')));
  PERFORM public.hom_check('COMPRAS','informar_entrega',
    public.hom_ok(public.hom_act('A','compras',eid,'informar_entrega','{"notes":"entrega recebida"}')));
  PERFORM public.hom_check('COMPRAS','concluir',
    public.hom_ok(public.hom_act('A','compras',eid,'concluir','{"notes":"processo concluido"}')));
  c := public.hom_ctx('A','compras',eid);
  PERFORM public.hom_check('COMPRAS','status final concluído', c.current_status = 'concluido', c.current_status);
  PERFORM public.hom_check('COMPRAS','concluída não volta ao workflow', coalesce(jsonb_array_length(c.allowed_actions),0) = 0,
    c.allowed_actions::text);
END $$;

-- ============================================================
-- ABASTECIMENTO: envio -> autorização -> pagamento -> comprovantes -> revisão -> conclusão
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('abast_e2e'); c public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.fuel_requests WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_requests (id, requester_user_id, type, valor, data_abastecimento, placa, km, motivo, status, notes)
  VALUES (eid, public.hom_uid('A'), 'abastecimento', 250, current_date, 'ABC1D23', '120000', 'Abastecimento de rota', 'rascunho', 'Homologação Abastecimento');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('ABASTECIMENTO','A cria rascunho', true);

  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_attachments (fuel_request_id, type, file_path)
  VALUES (eid, 'hodometro', 'homolog/hodometro.jpg'), (eid, 'nota_fiscal', 'homolog/nota.jpg');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('ABASTECIMENTO','A anexa nota e hodômetro no rascunho', true);
  PERFORM public.hom_check('ABASTECIMENTO','A envia',
    public.hom_ok(public.hom_act('A','abastecimento',eid,'enviar')));

  PERFORM public.hom_check('ABASTECIMENTO','B autoriza',
    public.hom_ok(public.hom_act('B','abastecimento',eid,'aprovar','{"notes":"autorizado para pagamento"}')));
  PERFORM public.hom_check('ABASTECIMENTO','C paga',
    public.hom_ok(public.hom_act('C','abastecimento',eid,'pagar','{"notes":"pagamento realizado"}')));
  c := public.hom_ctx('A','abastecimento',eid);
  PERFORM public.hom_check('ABASTECIMENTO','status aguardando comprovantes', c.current_status = 'aguardando_fotos', c.current_status);
  PERFORM public.hom_check('ABASTECIMENTO','A envia comprovantes',
    public.hom_ok(public.hom_act('A','abastecimento',eid,'enviar_comprovantes','{"notes":"comprovantes anexados"}')));
  PERFORM public.hom_check('ABASTECIMENTO','D conclui revisão',
    public.hom_ok(public.hom_act('D','abastecimento',eid,'concluir_revisao','{"notes":"revisao concluida"}')));
  c := public.hom_ctx('A','abastecimento',eid);
  PERFORM public.hom_check('ABASTECIMENTO','status final concluído', c.current_status = 'concluido', c.current_status);
  PERFORM public.hom_check('ABASTECIMENTO','sem etapas de Compras no fluxo',
    NOT (c.allowed_actions ? 'gerar_oc'), c.allowed_actions::text);
END $$;

-- ============================================================
-- DIÁRIA: envio -> autorização -> verificação (horas) -> pagamento -> conclusão
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('diaria_e2e'); c public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.fuel_requests WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_requests (id, requester_user_id, type, valor, data_abastecimento,
    daily_start_date, daily_end_date, daily_start_time, daily_end_time, daily_quantity, daily_value,
    daily_category, daily_destination, person_name, status, notes)
  VALUES (eid, public.hom_uid('A'), 'diaria', 300, current_date, current_date, current_date,
    '08:00', '17:00', 1, 300, 'operacional', 'Obra Matriz', 'A Solicitante', 'rascunho', 'Homologação Diária');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_check('DIARIA','A envia', public.hom_ok(public.hom_act('A','diaria',eid,'enviar')));
  c := public.hom_ctx('A','diaria',eid);
  PERFORM public.hom_check('DIARIA','não permanece em rascunho após enviar', c.current_status <> 'rascunho', c.current_status);
  PERFORM public.hom_check('DIARIA','etapa 1 com responsável real',
    c.current_approver_user_id = public.hom_uid('B'), coalesce(c.current_approver_name,'-'));
  PERFORM public.hom_check('DIARIA','B autoriza',
    public.hom_ok(public.hom_act('B','diaria',eid,'aprovar','{"notes":"diaria autorizada"}')));
  -- Fase operacional: execução da diária e envio dos comprovantes pelo solicitante
  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_attachments (fuel_request_id, type, file_path)
  VALUES (eid, 'nota_fiscal', 'homolog/diaria_e2e/comprovante.pdf');
  PERFORM public.hom_reset_auth();
  PERFORM public.hom_check('DIARIA','A envia comprovantes da execução',
    public.hom_ok(public.hom_act('A','diaria',eid,'enviar_comprovantes')));
  PERFORM public.hom_check('DIARIA','C confirma horas',
    public.hom_ok(public.hom_act('C','diaria',eid,'confirmar_horas','{"notes":"horas confirmadas"}')));

  PERFORM public.hom_check('DIARIA','D paga',
    public.hom_ok(public.hom_act('D','diaria',eid,'pagar','{"notes":"diaria paga"}')));
  c := public.hom_ctx('A','diaria',eid);
  PERFORM public.hom_check('DIARIA','status final concluído', c.current_status = 'concluido', c.current_status);
  PERFORM public.hom_check('DIARIA','nenhuma ação de Compras disponível',
    NOT (c.allowed_actions ? 'gerar_oc'), c.allowed_actions::text);
END $$;

-- ============================================================
-- REEMBOLSO: comprovante obrigatório -> envio -> aprovação -> revisão -> pagamento
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('reemb_e2e'); c public.entity_action_context; v jsonb;
BEGIN
  DELETE FROM public.fuel_requests WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_requests (id, requester_user_id, type, valor, data_abastecimento, categoria, status, notes)
  VALUES (eid, public.hom_uid('A'), 'reembolso', 120, current_date, 'alimentacao', 'rascunho', 'Homologação Reembolso');
  PERFORM public.hom_reset_auth();

  v := public.hom_act('A','reembolso',eid,'enviar');
  PERFORM public.hom_check('REEMBOLSO','envio sem comprovante é bloqueado', public.hom_denied(v), v::text);

  PERFORM public.hom_auth('A');
  INSERT INTO public.fuel_attachments (fuel_request_id, type, file_path)
  VALUES (eid, 'nota_fiscal', 'homolog/comprovante.jpg');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_check('REEMBOLSO','A envia com comprovante',
    public.hom_ok(public.hom_act('A','reembolso',eid,'enviar')));
  PERFORM public.hom_check('REEMBOLSO','B aprova',
    public.hom_ok(public.hom_act('B','reembolso',eid,'aprovar','{"notes":"reembolso aprovado"}')));
  PERFORM public.hom_check('REEMBOLSO','C conclui revisão financeira',
    public.hom_ok(public.hom_act('C','reembolso',eid,'concluir_revisao','{"notes":"revisao financeira ok"}')));
  PERFORM public.hom_check('REEMBOLSO','D paga',
    public.hom_ok(public.hom_act('D','reembolso',eid,'pagar','{"notes":"reembolso pago"}')));
  c := public.hom_ctx('A','reembolso',eid);
  PERFORM public.hom_check('REEMBOLSO','status final pago', c.current_status = 'pago', c.current_status);
  PERFORM public.hom_check('REEMBOLSO','sem ações de Abastecimento',
    NOT (c.allowed_actions ? 'enviar_comprovantes'), c.allowed_actions::text);
END $$;

-- ============================================================
-- ADMISSÕES: aprovação da vaga -> processamento RH -> validação final
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('adm_e2e'); c public.entity_action_context;
BEGIN
  DELETE FROM public.admission_requests WHERE id = eid;
  PERFORM public.hom_auth('A');
  INSERT INTO public.admission_requests (id, requester_user_id, local_contratacao, centro_custo, cargo_funcao,
    tipo_contrato, jornada, gestor_responsavel, motivo, status, priority)
  VALUES (eid, public.hom_uid('A'), 'Matriz', 'CC-01', 'Auxiliar', 'clt', '44h', 'B Aprovador 1',
    'aumento_quadro', 'rascunho', 'normal');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_check('ADMISSOES','A envia', public.hom_ok(public.hom_act('A','admissoes',eid,'enviar')));
  PERFORM public.hom_check('ADMISSOES','B aprova a vaga',
    public.hom_ok(public.hom_act('B','admissoes',eid,'aprovar','{"notes":"vaga aprovada"}')));
  PERFORM public.hom_check('ADMISSOES','C conclui triagem (lifecycle separado da aprovação)',
    public.hom_ok(public.hom_act('C','admissoes',eid,'concluir_triagem','{"notes":"triagem concluida"}')));
  PERFORM public.hom_check('ADMISSOES','D conclui validação final',
    public.hom_ok(public.hom_act('D','admissoes',eid,'concluir','{"notes":"validacao final"}')));
  c := public.hom_ctx('A','admissoes',eid);
  PERFORM public.hom_check('ADMISSOES','status operacional após conclusão do workflow',
    c.current_status = 'aguardando_documentos', c.current_status);
END $$;

-- ============================================================
-- DESLIGAMENTOS: autorização -> processamento RH -> checklist -> conclusão
-- ============================================================
DO $$
DECLARE eid uuid := public.hom_uid('desl_e2e'); col uuid := public.hom_uid('colab_e2e'); c public.entity_action_context;
BEGIN
  DELETE FROM public.termination_requests WHERE id = eid;
  INSERT INTO public.collaborators (id, full_name, role_name, worksite, status, sector_id, active)
  VALUES (col, 'Colaborador Homologação', 'Auxiliar', 'Matriz', 'ativo', public.hom_uid('setor'), true)
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.hom_auth('RH');
  INSERT INTO public.termination_requests (id, collaborator_id, requester_user_id, tipo_desligamento,
    motivo, data_prevista, status)
  VALUES (eid, col, public.hom_uid('RH'), 'pedido_demissao', 'Pedido do colaborador', current_date + 5, 'rascunho');
  PERFORM public.hom_reset_auth();

  PERFORM public.hom_check('DESLIGAMENTOS','RH envia', public.hom_ok(public.hom_act('RH','desligamentos',eid,'enviar')));
  PERFORM public.hom_check('DESLIGAMENTOS','B autoriza',
    public.hom_ok(public.hom_act('B','desligamentos',eid,'aprovar','{"notes":"desligamento autorizado"}')));
  PERFORM public.hom_check('DESLIGAMENTOS','C conclui processamento RH',
    public.hom_ok(public.hom_act('C','desligamentos',eid,'concluir_processamento_rh','{"notes":"rescisao processada"}')));
  PERFORM public.hom_check('DESLIGAMENTOS','D conclui checklist/offboarding',
    public.hom_ok(public.hom_act('D','desligamentos',eid,'concluir','{"notes":"offboarding concluido"}')));
  c := public.hom_ctx('RH','desligamentos',eid);
  PERFORM public.hom_check('DESLIGAMENTOS','status final desligamento_concluido',
    c.current_status = 'desligamento_concluido', c.current_status);
END $$;

SELECT step, name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, left(detail,90) AS detail
  FROM public.hom_results WHERE step <> 'FIXTURES' ORDER BY id;
