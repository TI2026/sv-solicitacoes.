-- =====================================================================
-- MOTOR V2 — ONDA A: Templates V2 (6 flows / 17 steps), inativos
-- =====================================================================

-- 1. Colunas / constraints de suporte ao modo de responsável V2
ALTER TABLE public.approval_flow_steps
  ADD COLUMN IF NOT EXISTS assignment_mode text;

ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS chk_assignment_mode;
ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT chk_assignment_mode
  CHECK (assignment_mode IS NULL OR assignment_mode IN ('person','sector'));

-- approver_type: permitir os modos V2 sem quebrar V1
ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_approver_type_check;
ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_approver_type_check
  CHECK (approver_type IN (
    'usuario_fixo','gestor_imediato','responsavel_do_setor_do_solicitante',
    'responsavel_do_setor_especifico','cargo_perfil',
    'person','sector'
  ));

-- required_fields: linhas V2 (assignment_mode NOT NULL) validam pelo modo
ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_required_fields_check;
ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_required_fields_check
  CHECK (
    assignment_mode IS NOT NULL
    OR (approver_type = 'usuario_fixo' AND approver_user_id IS NOT NULL)
    OR (approver_type = 'responsavel_do_setor_especifico' AND fixed_sector_id IS NOT NULL)
    OR (approver_type = 'cargo_perfil' AND approver_role_key IS NOT NULL)
    OR approver_type IN ('gestor_imediato','responsavel_do_setor_do_solicitante')
  );

-- completion_action: incluir 'concluir' (Admissões E3, Desligamentos E3)
ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_completion_action;
ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT chk_completion_action
  CHECK (completion_action IS NULL OR completion_action IN (
    'aprovar','concluir_revisao','confirmar_horas','pagar',
    'concluir_triagem','concluir_processamento_rh','concluir'
  ));

-- next_step_activation: 'immediate' (sequencial) ou ação operacional
ALTER TABLE public.approval_flow_steps DROP CONSTRAINT IF EXISTS chk_next_step_activation;
ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT chk_next_step_activation
  CHECK (next_step_activation IS NULL OR next_step_activation IN ('immediate','enviar_comprovantes'));

-- 2. Semeadura dos 6 flows V2 (active = false) e das 17 etapas fixas
DO $seed$
DECLARE
  v_mod uuid;
  v_flow uuid;
  r record;
  s record;
BEGIN
  PERFORM set_config('app.v2_template_migration','on', true);

  FOR r IN
    SELECT * FROM (VALUES
      ('compras',       'Compras V2'),
      ('abastecimento', 'Abastecimento V2'),
      ('diaria',        'Diária V2'),
      ('reembolso',     'Reembolso V2'),
      ('admissoes',     'Admissões V2'),
      ('desligamentos', 'Desligamentos V2')
    ) AS t(code, flow_name)
  LOOP
    SELECT id INTO v_mod FROM public.approval_modules WHERE code = r.code;
    IF v_mod IS NULL THEN
      RAISE EXCEPTION 'Módulo canônico ausente: %', r.code;
    END IF;

    SELECT f.id INTO v_flow
      FROM public.approval_flows f
     WHERE f.module_id = v_mod AND f.version = 'v2'
     LIMIT 1;

    IF v_flow IS NULL THEN
      INSERT INTO public.approval_flows (
        module_id, name, approval_type, active, version,
        require_rejection_reason, allow_return_for_adjustment, notify_next_approver, return_mode
      ) VALUES (
        v_mod, r.flow_name, 'sequential', false, 'v2',
        true, true, true, 'requester'
      ) RETURNING id INTO v_flow;
    END IF;

    FOR s IN
      SELECT * FROM (VALUES
        -- module, order, code, name, kind, completion_action, next_activation,
        -- req_status_after, entity_on_entry, entity_on_success, return_entity, reject_entity, closes
        ('compras',1,'aprovacao_necessidade','Aprovação da necessidade','approval','aprovar','immediate','awaiting_step','em_aprovacao',NULL,'retornado','reprovado',false),
        ('compras',2,'aprovacao_financeira','Aprovação financeira','approval','aprovar',NULL,'completed',NULL,'aguardando_oc','retornado','reprovado',true),

        ('abastecimento',1,'autorizacao_abastecimento','Autorização do abastecimento','approval','aprovar','immediate','awaiting_step','em_aprovacao',NULL,'retornado','reprovado',false),
        ('abastecimento',2,'pagamento_abastecimento','Pagamento do abastecimento','payment','pagar','enviar_comprovantes','waiting_operational',NULL,'aguardando_fotos','retornado','reprovado',false),
        ('abastecimento',3,'conferencia_abastecimento','Conferência do abastecimento','review','concluir_revisao',NULL,'completed','em_revisao_admin','concluido','aguardando_fotos','reprovado',true),

        ('diaria',1,'autorizacao_diaria','Autorização da diária','approval','aprovar','enviar_comprovantes','waiting_operational','em_aprovacao','ativa','retornado','reprovado',false),
        ('diaria',2,'verificacao_diaria','Verificação da diária','verification','confirmar_horas','immediate','awaiting_step','em_revisao','aguardando_pagamento','ativa','reprovado',false),
        ('diaria',3,'pagamento_diaria','Pagamento da diária','payment','pagar',NULL,'completed',NULL,'concluido','aguardando_pagamento','reprovado',true),

        ('reembolso',1,'aprovacao_reembolso','Aprovação do reembolso','approval','aprovar','immediate','awaiting_step','em_aprovacao',NULL,'retornado','reprovado',false),
        ('reembolso',2,'revisao_financeira','Revisão financeira','review','concluir_revisao','immediate','awaiting_step',NULL,'aguardando_pagamento','retornado','reprovado',false),
        ('reembolso',3,'pagamento_reembolso','Pagamento do reembolso','payment','pagar',NULL,'completed',NULL,'pago','aguardando_pagamento','reprovado',true),

        ('admissoes',1,'aprovacao_vaga','Aprovação da vaga','approval','aprovar','immediate','awaiting_step','em_aprovacao',NULL,'rascunho','cancelado',false),
        ('admissoes',2,'processamento_rh','Processamento RH','hr_processing','concluir_triagem','immediate','awaiting_step',NULL,NULL,'rascunho','cancelado',false),
        ('admissoes',3,'validacao_final_rh','Validação final RH','review','concluir',NULL,'completed',NULL,'aguardando_documentos','rascunho','cancelado',true),

        ('desligamentos',1,'autorizacao_desligamento','Autorização do desligamento','approval','aprovar','immediate','awaiting_step','em_aprovacao',NULL,'retornado','reprovado',false),
        ('desligamentos',2,'processamento_rh','Processamento RH','hr_processing','concluir_processamento_rh','immediate','awaiting_step',NULL,NULL,'retornado','reprovado',false),
        ('desligamentos',3,'checklist_offboarding','Checklist de offboarding','review','concluir',NULL,'completed',NULL,'desligamento_concluido','retornado','reprovado',true)
      ) AS t(mod_code, step_order, step_code, step_name, step_kind, completion_action,
             next_step_activation, req_status_after, entity_on_entry, entity_on_success,
             return_entity, reject_entity, closes)
      WHERE t.mod_code = r.code
      ORDER BY t.step_order
    LOOP
      INSERT INTO public.approval_flow_steps (
        flow_id, step_order, step_code, step_name, step_kind, completion_action,
        next_step_activation, approval_request_status_after,
        entity_status_on_entry, entity_status_on_success,
        return_entity_status, rejection_entity_status, closes_workflow,
        approver_type, assignment_mode, default_sla_hours, is_required, active
      ) VALUES (
        v_flow, s.step_order, s.step_code, s.step_name, s.step_kind, s.completion_action,
        s.next_step_activation, s.req_status_after,
        s.entity_on_entry, s.entity_on_success,
        s.return_entity, s.reject_entity, s.closes,
        'person', 'person', 48, true, true
      )
      ON CONFLICT (flow_id, step_order) DO UPDATE SET
        step_code = EXCLUDED.step_code,
        step_name = EXCLUDED.step_name,
        step_kind = EXCLUDED.step_kind,
        completion_action = EXCLUDED.completion_action,
        next_step_activation = EXCLUDED.next_step_activation,
        approval_request_status_after = EXCLUDED.approval_request_status_after,
        entity_status_on_entry = EXCLUDED.entity_status_on_entry,
        entity_status_on_success = EXCLUDED.entity_status_on_success,
        return_entity_status = EXCLUDED.return_entity_status,
        rejection_entity_status = EXCLUDED.rejection_entity_status,
        closes_workflow = EXCLUDED.closes_workflow;
    END LOOP;
  END LOOP;
END
$seed$;

-- 3. Imutabilidade do template V2
CREATE OR REPLACE FUNCTION public.enforce_v2_template_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version text;
  v_bypass  boolean := coalesce(current_setting('app.v2_template_migration', true) = 'on', false);
BEGIN
  IF v_bypass THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT f.version INTO v_version
    FROM public.approval_flows f
   WHERE f.id = coalesce(NEW.flow_id, OLD.flow_id);

  IF v_version IS DISTINCT FROM 'v2' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'TEMPLATE_IMMUTABLE: não é permitido adicionar etapas a um fluxo V2';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TEMPLATE_IMMUTABLE: não é permitido remover etapas de um fluxo V2';
  END IF;

  IF NEW.step_order IS DISTINCT FROM OLD.step_order
     OR NEW.step_code IS DISTINCT FROM OLD.step_code
     OR NEW.step_name IS DISTINCT FROM OLD.step_name
     OR NEW.step_kind IS DISTINCT FROM OLD.step_kind
     OR NEW.completion_action IS DISTINCT FROM OLD.completion_action
     OR NEW.next_step_activation IS DISTINCT FROM OLD.next_step_activation
     OR NEW.approval_request_status_after IS DISTINCT FROM OLD.approval_request_status_after
     OR NEW.entity_status_on_entry IS DISTINCT FROM OLD.entity_status_on_entry
     OR NEW.entity_status_on_success IS DISTINCT FROM OLD.entity_status_on_success
     OR NEW.return_entity_status IS DISTINCT FROM OLD.return_entity_status
     OR NEW.rejection_entity_status IS DISTINCT FROM OLD.rejection_entity_status
     OR NEW.closes_workflow IS DISTINCT FROM OLD.closes_workflow
     OR NEW.flow_id IS DISTINCT FROM OLD.flow_id
  THEN
    RAISE EXCEPTION 'TEMPLATE_IMMUTABLE: a semântica das etapas V2 só pode mudar por migration';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_v2_template_immutability ON public.approval_flow_steps;
CREATE TRIGGER trg_v2_template_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.approval_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_v2_template_immutability();