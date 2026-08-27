-- Checkpoint Final: homologação empresarial multiusuário dos seis módulos.
BEGIN;
SELECT * FROM no_plan();

-- Personas A requester, B/C/D aprovadores, S substituto, M Master e U unrelated.
INSERT INTO auth.users(id,email) VALUES
  ('fa000000-0000-0000-0000-000000000001','final-a@test.local'),
  ('fa000000-0000-0000-0000-000000000002','final-b@test.local'),
  ('fa000000-0000-0000-0000-000000000003','final-c@test.local'),
  ('fa000000-0000-0000-0000-000000000004','final-d@test.local'),
  ('fa000000-0000-0000-0000-000000000005','final-s@test.local'),
  ('fa000000-0000-0000-0000-000000000006','final-m@test.local'),
  ('fa000000-0000-0000-0000-000000000007','final-u@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id,full_name,email,active) VALUES
  ('fa000000-0000-0000-0000-000000000001','Final A Requester','final-a@test.local',true),
  ('fa000000-0000-0000-0000-000000000002','Final B Step 1','final-b@test.local',true),
  ('fa000000-0000-0000-0000-000000000003','Final C Step 2','final-c@test.local',true),
  ('fa000000-0000-0000-0000-000000000004','Final D Step 3','final-d@test.local',true),
  ('fa000000-0000-0000-0000-000000000005','Final S Substitute','final-s@test.local',true),
  ('fa000000-0000-0000-0000-000000000006','Final M Master','final-m@test.local',true),
  ('fa000000-0000-0000-0000-000000000007','Final U Unrelated','final-u@test.local',true)
ON CONFLICT (id) DO UPDATE SET active=true;

INSERT INTO public.roles(key,name,is_master,active)
VALUES ('master','Master',true,true)
ON CONFLICT (key) DO UPDATE SET is_master=true,active=true;
INSERT INTO public.user_role_assignments(user_id,role_id)
SELECT 'fa000000-0000-0000-0000-000000000006',id
FROM public.roles WHERE key='master'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) VALUES
  ('fa000000-0000-0000-0000-000000000003','rh')
ON CONFLICT DO NOTHING;

-- Configuração real: seis fluxos, 17 etapas, B/C/D e contingência S.
UPDATE public.approval_flows SET active=false;
UPDATE public.approval_flows SET active=true WHERE version='v2';
UPDATE public.approval_flow_steps s
SET assignment_mode='person',
    approver_type='person',
    approver_user_id=CASE s.step_order
      WHEN 1 THEN 'fa000000-0000-0000-0000-000000000002'::uuid
      WHEN 2 THEN 'fa000000-0000-0000-0000-000000000003'::uuid
      ELSE 'fa000000-0000-0000-0000-000000000004'::uuid END,
    substitute_user_id='fa000000-0000-0000-0000-000000000005',
    fixed_sector_id=NULL,
    default_sla_hours=24
FROM public.approval_flows f
WHERE f.id=s.flow_id AND f.version='v2';

SELECT is((SELECT count(*)::integer FROM public.approval_flows WHERE version='v2' AND active),6,
  'seis fluxos V2 reais estão ativos na fixture local');
SELECT is((SELECT count(*)::integer FROM public.approval_flow_steps s JOIN public.approval_flows f ON f.id=s.flow_id WHERE f.version='v2' AND s.approver_user_id IS NOT NULL AND s.substitute_user_id IS NOT NULL),17,
  '17 etapas possuem responsável e substituto');

INSERT INTO public.collaborators(id,full_name,role_name,worksite,status,active,user_profile_id)
VALUES ('fa400000-0000-0000-0000-000000000001','Colaborador Offboarding','Operação','Matriz','ativo',true,'fa000000-0000-0000-0000-000000000007');

INSERT INTO public.purchases(id,requester_user_id,status,category,description,priority,estimated_value)
VALUES ('fa100000-0000-0000-0000-000000000001','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra final','normal',1000);
INSERT INTO public.fuel_requests(id,requester_user_id,valor,data_abastecimento,status,type,placa,motivo)
VALUES ('fa200000-0000-0000-0000-000000000001','fa000000-0000-0000-0000-000000000001',200,current_date+1,'rascunho','abastecimento','ABC1D23','Viagem programada');
INSERT INTO public.fuel_requests(
  id,requester_user_id,valor,data_abastecimento,status,type,
  daily_start_date,daily_end_date,daily_start_time,daily_end_time,daily_quantity,
  daily_category,daily_destination,person_name,daily_value,notes
)
VALUES (
  'fa200000-0000-0000-0000-000000000002','fa000000-0000-0000-0000-000000000001',
  300,current_date+1,'rascunho','diaria',
  current_date+1,current_date+1,'08:00','18:00',1,
  'Viagem','Matriz - Filial','Pessoa Teste',300,'Atividade externa programada'
);
INSERT INTO public.fuel_requests(id,requester_user_id,valor,data_abastecimento,status,type,categoria,notes,payment_method,pix_key)
VALUES ('fa200000-0000-0000-0000-000000000003','fa000000-0000-0000-0000-000000000001',400,current_date,'rascunho','reembolso','Hospedagem','Despesa empresarial comprovada','pix','12345678901');
INSERT INTO public.fuel_attachments(fuel_request_id,type,file_path)
VALUES ('fa200000-0000-0000-0000-000000000003','nota_fiscal','final/reembolso/comprovante.pdf');
INSERT INTO public.admission_requests(
  id,requester_user_id,local_contratacao,centro_custo,cargo_funcao,tipo_contrato,
  jornada,gestor_responsavel,motivo,status
) VALUES (
  'fa300000-0000-0000-0000-000000000001','fa000000-0000-0000-0000-000000000001',
  'Matriz','CC-01','Analista','CLT','44h','Gestor Teste','Nova vaga','rascunho'
);
INSERT INTO public.termination_requests(
  id,collaborator_id,requester_user_id,tipo_desligamento,motivo,data_prevista,status
) VALUES (
  'fa410000-0000-0000-0000-000000000001','fa400000-0000-0000-0000-000000000001',
  'fa000000-0000-0000-0000-000000000001','pedido_demissao','Solicitação final',current_date,'rascunho'
);

-- A envia os seis módulos.
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','enviar'))->>'code','200','Compras: A envia');
SELECT is((public.execute_entity_action('abastecimento','fa200000-0000-0000-0000-000000000001','enviar'))->>'code','200','Abastecimento: A envia');
SELECT is((public.execute_entity_action('diaria','fa200000-0000-0000-0000-000000000002','enviar'))->>'code','200','Diária: A envia imediatamente');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','enviar'))->>'code','200','Reembolso: A envia com comprovante');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','enviar'))->>'code','200','Admissões: A envia');
SELECT is((public.execute_entity_action('desligamentos','fa410000-0000-0000-0000-000000000001','enviar'))->>'code','200','Desligamentos: A envia');

SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.get_my_approval_queue()),6,
  'B recebe os seis itens na fila V2');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id=auth.uid() AND metadata->>'module_key' IN ('compras','abastecimento','diaria','reembolso','admissoes','desligamentos')),6,
  'notificações A→B persistem para os seis módulos');

-- B conclui etapa 1. Diária entra em execução operacional.
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','aprovar'))->>'code','200','Compras: B aprova necessidade');
SELECT ok((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','aprovar'))->>'code' <> '200',
  'double approve: segunda execução não produz nova aprovação');
SELECT is((SELECT count(*)::integer FROM public.approval_request_steps ars JOIN public.approval_requests ar ON ar.id=ars.approval_request_id WHERE ar.reference_id='fa100000-0000-0000-0000-000000000001' AND ars.step_order=1 AND ars.status='approved'),1,
  'double approve mantém uma única etapa efetiva');
SELECT is((public.execute_entity_action('abastecimento','fa200000-0000-0000-0000-000000000001','aprovar'))->>'code','200','Abastecimento: B autoriza');
SELECT is((public.execute_entity_action('diaria','fa200000-0000-0000-0000-000000000002','aprovar'))->>'code','200','Diária: B autoriza');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','aprovar'))->>'code','200','Reembolso: B aprova');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','aprovar'))->>'code','200','Admissões: B aprova vaga');
SELECT is((public.execute_entity_action('desligamentos','fa410000-0000-0000-0000-000000000001','aprovar'))->>'code','200','Desligamentos: B autoriza');
SELECT is((SELECT count(*)::integer FROM public.get_my_approval_queue()),0,'fila de B esvazia após suas ações');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000003',true);
SELECT ok((SELECT count(*) >= 5 FROM public.notifications WHERE user_id=auth.uid() AND metadata->>'type'='approval_assigned' AND metadata->>'module_key' IN ('compras','abastecimento','diaria','reembolso','admissoes','desligamentos') AND metadata->>'link' IS NOT NULL),
  'aprovação notifica o próximo responsável C com metadata e link canônicos');

SELECT set_config('role','postgres',true);
INSERT INTO public.fuel_attachments(fuel_request_id,type,file_path) VALUES
  ('fa200000-0000-0000-0000-000000000002','nota_fiscal','final/diaria/execucao.pdf');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('diaria','fa200000-0000-0000-0000-000000000002','enviar_comprovantes'))->>'code','200','Diária: A envia execução/comprovantes');

-- C conclui etapa 2. Abastecimento entra em waiting_operational.
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000003',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','aprovar'))->>'code','200','Compras: C aprova financeiro');
SELECT is((public.execute_entity_action('abastecimento','fa200000-0000-0000-0000-000000000001','pagar'))->>'code','200','Abastecimento: C paga');
SELECT is((public.execute_entity_action('diaria','fa200000-0000-0000-0000-000000000002','confirmar_horas'))->>'code','200','Diária: C confirma horas');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','concluir_revisao'))->>'code','200','Reembolso: C conclui revisão');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','concluir_triagem'))->>'code','200','Admissões: C processa RH');
SELECT is((public.execute_entity_action('desligamentos','fa410000-0000-0000-0000-000000000001','concluir_processamento_rh'))->>'code','200','Desligamentos: C conclui processamento RH');

SELECT set_config('role','postgres',true);
INSERT INTO public.fuel_attachments(fuel_request_id,type,file_path) VALUES
  ('fa200000-0000-0000-0000-000000000001','hodometro','final/abastecimento/hodometro.jpg'),
  ('fa200000-0000-0000-0000-000000000001','nota_fiscal','final/abastecimento/nota.pdf');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('abastecimento','fa200000-0000-0000-0000-000000000001','enviar_comprovantes'))->>'code','200','Abastecimento: A envia NF e hodômetro');

-- D encerra etapa 3; offboarding só ocorre agora.
SELECT set_config('role','postgres',true);
SELECT ok((SELECT active FROM public.collaborators WHERE id='fa400000-0000-0000-0000-000000000001'),
  'colaborador permanece ativo antes da etapa final de Desligamento');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000004',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('abastecimento','fa200000-0000-0000-0000-000000000001','concluir_revisao'))->>'code','200','Abastecimento: D confere e conclui');
SELECT is((public.execute_entity_action('diaria','fa200000-0000-0000-0000-000000000002','pagar'))->>'code','200','Diária: D paga e conclui');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','pagar'))->>'code','200','Reembolso: D paga');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','concluir'))->>'code','200','Admissões: D valida workflow');
SELECT is((public.execute_entity_action('desligamentos','fa410000-0000-0000-0000-000000000001','concluir'))->>'code','200','Desligamentos: D finaliza offboarding');
SELECT set_config('role','postgres',true);
SELECT ok((SELECT NOT active FROM public.collaborators WHERE id='fa400000-0000-0000-0000-000000000001'),
  'offboarding inativa colaborador somente na etapa final');

-- Operacional de Compras e confirmação final de Reembolso.
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','gerar_oc',jsonb_build_object('ocNumber','OC-FINAL-1','approvedValue','950')))->>'code','200','Compras: gera OC');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','pagar'))->>'code','200','Compras: paga');
SELECT set_config(
  'release_gate.payment_history_before',
  (SELECT count(*)::text FROM public.status_history WHERE entity_id='fa100000-0000-0000-0000-000000000001' AND from_status='aguardando_pagamento' AND to_status='aguardando_entrega'),
  true
);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','pagar'))->>'code','409',
  'double payment: segunda execução retorna conflito e não duplica pagamento');
SELECT is(
  (SELECT count(*)::integer FROM public.status_history WHERE entity_id='fa100000-0000-0000-0000-000000000001' AND from_status='aguardando_pagamento' AND to_status='aguardando_entrega'),
  current_setting('release_gate.payment_history_before')::integer,
  'double payment não cria nova transição após o conflito'
);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','informar_entrega'))->>'code','200','Compras: informa entrega');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','concluir'))->>'code','200','Compras: conclui');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','concluir'))->>'code','200','Reembolso: A confirma e conclui');

-- Lifecycle de Admissões permanece separado do workflow.
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000003',true);
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','documentos_em_analise')))->>'code','200','Admissões lifecycle: documentos em análise');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','aguardando_exame')))->>'code','200','Admissões lifecycle: aguardando exame');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','exame_realizado')))->>'code','200','Admissões lifecycle: exame realizado');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','aguardando_registro')))->>'code','200','Admissões lifecycle: aguardando registro');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','registros_concluidos')))->>'code','200','Admissões lifecycle: registros concluídos');
SELECT is((public.execute_entity_action('admissoes','fa300000-0000-0000-0000-000000000001','avancar_etapa',jsonb_build_object('to_status','concluido')))->>'code','200','Admissões lifecycle: concluída');

SELECT set_config('role','postgres',true);
SELECT is((SELECT status FROM public.purchases WHERE id='fa100000-0000-0000-0000-000000000001'),'concluido','Compras E2E termina concluída');
SELECT is((SELECT status::text FROM public.fuel_requests WHERE id='fa200000-0000-0000-0000-000000000001'),'concluido','Abastecimento E2E termina concluído');
SELECT is((SELECT status::text FROM public.fuel_requests WHERE id='fa200000-0000-0000-0000-000000000002'),'concluido','Diária E2E termina concluída');
SELECT is((SELECT status::text FROM public.fuel_requests WHERE id='fa200000-0000-0000-0000-000000000003'),'concluido','Reembolso E2E termina concluído');
SELECT is((SELECT status::text FROM public.admission_requests WHERE id='fa300000-0000-0000-0000-000000000001'),'concluido','Admissões E2E termina concluída');
SELECT is((SELECT status::text FROM public.termination_requests WHERE id='fa410000-0000-0000-0000-000000000001'),'desligamento_concluido','Desligamentos E2E termina concluído');

-- Divergência pós-pagamento: ator real, notificação, resolução e retorno a A.
UPDATE public.fuel_requests SET status='pago' WHERE id='fa200000-0000-0000-0000-000000000003';
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','relatar_divergencia',jsonb_build_object('notes','Valor creditado está incorreto')))->>'code','200','Reembolso: A relata divergência');
SELECT is((SELECT assigned_to_user_id FROM public.fuel_requests WHERE id='fa200000-0000-0000-0000-000000000003'),'fa000000-0000-0000-0000-000000000003'::uuid,'divergência é atribuída a C, revisor snapshot');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000003',true);
SELECT ok((SELECT allowed_actions ? 'concluir_revisao' FROM public.get_entity_action_context('reembolso','fa200000-0000-0000-0000-000000000003')),
  'C recebe ação explícita para resolver divergência');
SELECT is((public.execute_entity_action('reembolso','fa200000-0000-0000-0000-000000000003','concluir_revisao',jsonb_build_object('notes','Pagamento revisado e corrigido')))->>'code','200','C resolve divergência');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT ok((SELECT allowed_actions ? 'concluir' FROM public.get_entity_action_context('reembolso','fa200000-0000-0000-0000-000000000003')),
  'A volta a poder confirmar após resolução');
SELECT is((SELECT metadata->>'status' FROM public.notifications WHERE user_id=auth.uid() AND metadata->>'type'='reimbursement_divergence_resolved' ORDER BY created_at DESC LIMIT 1),'pago',
  'notificação de resolução preserva status da entidade');

-- Return/resubmit preserva request, etapa e aprovação anterior.
SELECT set_config('role','postgres',true);
INSERT INTO public.purchases(id,requester_user_id,status,category,description,priority,estimated_value)
VALUES ('fa100000-0000-0000-0000-000000000002','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra retorno','normal',100);
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000002','enviar'))->>'code','200','Return: A envia');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000002',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000002','aprovar'))->>'code','200','Return: B aprova step1');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000003',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000002','devolver',jsonb_build_object('notes','Ajustar centro de custo informado')))->>'code','200','Return: C devolve step2');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT is((SELECT metadata->>'link' FROM public.notifications WHERE user_id=auth.uid() AND metadata->>'type'='approval_returned' AND metadata->>'entity_id'='fa100000-0000-0000-0000-000000000002' ORDER BY created_at DESC LIMIT 1),'/purchases/fa100000-0000-0000-0000-000000000002',
  'return notifica requester A com metadata e link corretos');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000002','enviar'))->>'code','200','Return: A reenvia mesma request');
SELECT set_config('role','postgres',true);
SELECT is((SELECT count(*)::integer FROM public.approval_requests ar JOIN public.approval_modules am ON am.id=ar.module_id WHERE am.code='compras' AND ar.reference_id='fa100000-0000-0000-0000-000000000002'),1,'return/resubmit não cria nova request');
SELECT is((SELECT ars.status FROM public.approval_request_steps ars JOIN public.approval_requests ar ON ar.id=ars.approval_request_id WHERE ar.reference_id='fa100000-0000-0000-0000-000000000002' AND ars.step_order=1),'approved','step1 aprovado é preservado');
SELECT is((SELECT ars.status FROM public.approval_request_steps ars JOIN public.approval_requests ar ON ar.id=ars.approval_request_id WHERE ar.reference_id='fa100000-0000-0000-0000-000000000002' AND ars.step_order=2),'pending','mesma step2 é reativada');

-- Reject, cancel, Master override, duplicidade e unrelated.
INSERT INTO public.purchases(id,requester_user_id,status,category,description,priority,estimated_value) VALUES
  ('fa100000-0000-0000-0000-000000000003','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra rejeição','normal',100),
  ('fa100000-0000-0000-0000-000000000004','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra cancelamento','normal',100),
  ('fa100000-0000-0000-0000-000000000005','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra override','normal',100),
  ('fa100000-0000-0000-0000-000000000006','fa000000-0000-0000-0000-000000000001','rascunho','Operação','Compra substitute','normal',100);
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000003','enviar'))->>'code','200','Reject: A envia');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000002',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000003','rejeitar',jsonb_build_object('notes','Solicitação fora da política')))->>'code','200','B rejeita com motivo');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT is((SELECT metadata->>'link' FROM public.notifications WHERE user_id=auth.uid() AND metadata->>'type'='approval_rejected' AND metadata->>'entity_id'='fa100000-0000-0000-0000-000000000003' ORDER BY created_at DESC LIMIT 1),'/purchases/fa100000-0000-0000-0000-000000000003',
  'reject notifica requester A com metadata e link corretos');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000004','enviar'))->>'code','200','Cancel: A envia');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000004','cancelar',jsonb_build_object('notes','Solicitação não é mais necessária')))->>'code','200','A cancela com motivo');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000005','enviar'))->>'code','200','Override: A envia');
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000005','enviar'))->>'code','409','double send é bloqueado');
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000006',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000005','aprovar',jsonb_build_object('notes','Override Master devidamente justificado')))->>'code','200','Master override executa com motivo');
SELECT ok((SELECT (details->>'master_override')::boolean FROM public.audit_logs WHERE entity_id='fa100000-0000-0000-0000-000000000005' AND action='ENGINE_V2_APROVAR' ORDER BY created_at DESC LIMIT 1),
  'Master override é auditado');

UPDATE public.profiles SET active=false WHERE id='fa000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000001',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000006','enviar'))->>'code','200','request com primary inativo ainda envia');
SELECT set_config('role','postgres',true);
SELECT is((SELECT current_approver_user_id FROM public.approval_requests WHERE reference_id='fa100000-0000-0000-0000-000000000006' AND ended_at IS NULL),'fa000000-0000-0000-0000-000000000005'::uuid,
  'primary inativo resolve para substitute S');
UPDATE public.profiles SET active=true WHERE id='fa000000-0000-0000-0000-000000000002';

SELECT set_config('request.jwt.claim.sub','fa000000-0000-0000-0000-000000000007',true);
SELECT set_config('role','authenticated',true);
SELECT is((public.execute_entity_action('compras','fa100000-0000-0000-0000-000000000001','pagar'))->>'code','404','U unrelated não enxerga nem opera Compra alheia');

SELECT set_config('role','postgres',true);
SELECT is((SELECT status FROM public.purchases WHERE id='fa100000-0000-0000-0000-000000000003'),'reprovado','reject persiste status correto');
SELECT is((SELECT status FROM public.purchases WHERE id='fa100000-0000-0000-0000-000000000004'),'cancelado','cancel persiste status correto');
SELECT is((SELECT count(*)::integer FROM public.approval_requests WHERE ended_at IS NULL AND status='waiting_operational' AND current_approver_user_id IS NULL),0,
  'nenhum waiting_operational concluído ficou órfão');

SELECT * FROM finish();
ROLLBACK;
