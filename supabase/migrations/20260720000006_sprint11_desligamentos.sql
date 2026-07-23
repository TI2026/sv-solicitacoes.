-- ============================================================
-- SPRINT 11: Módulo Desligamentos (Offboarding)
--
-- Cria a tabela termination_requests com FK para collaborators.
-- Registra o módulo no Approval Engine.
-- Integra process_approval_action e get_domain_status.
-- Segue exatamente o padrão de compras (Sprint 8) e admissions (Sprint 9).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
CREATE TYPE public.termination_type AS ENUM (
  'pedido_demissao',
  'demissao_sem_justa_causa',
  'demissao_por_justa_causa',
  'acordo',
  'termino_contrato',
  'experiencia',
  'aposentadoria',
  'falecimento',
  'outros'
);

CREATE TYPE public.termination_status AS ENUM (
  'rascunho',
  'em_aprovacao',
  'aprovado',
  'reprovado',
  'retornado',
  'desligamento_concluido',
  'cancelado'
);

-- ------------------------------------------------------------
-- 2. TABELA termination_requests
--    Referencia collaborators por FK — sem duplicar dados cadastrais.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.termination_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id       uuid NOT NULL REFERENCES public.collaborators(id),
  requester_user_id     uuid NOT NULL REFERENCES public.profiles(id) DEFAULT auth.uid(),
  tipo_desligamento     public.termination_type NOT NULL,
  motivo                text NOT NULL,
  data_prevista         date NOT NULL,
  ultimo_dia_trabalhado date,
  gestor_imediato       text,
  matricula             text,
  observacoes           text,
  status                public.termination_status NOT NULL DEFAULT 'rascunho',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.termination_requests ENABLE ROW LEVEL SECURITY;

-- RH, Diretoria e Administrativo gerenciam desligamentos
CREATE POLICY "RH manages termination_requests" ON public.termination_requests
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'rh') OR
    has_role(auth.uid(), 'diretoria') OR
    has_role(auth.uid(), 'administrativo')
  )
  WITH CHECK (
    has_role(auth.uid(), 'rh') OR
    has_role(auth.uid(), 'diretoria') OR
    has_role(auth.uid(), 'administrativo')
  );

-- Solicitante pode ver suas próprias solicitações
CREATE POLICY "Requester can view own termination_requests" ON public.termination_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE INDEX idx_termination_requests_collaborator ON public.termination_requests(collaborator_id);
CREATE INDEX idx_termination_requests_status ON public.termination_requests(status);
CREATE INDEX idx_termination_requests_requester ON public.termination_requests(requester_user_id);

CREATE TRIGGER set_termination_requests_updated_at
  BEFORE UPDATE ON public.termination_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 3. REGISTRO DO MÓDULO NO APPROVAL ENGINE
-- ------------------------------------------------------------
INSERT INTO public.approval_modules (code, name)
VALUES ('desligamentos', 'Desligamentos')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 4. RPC termination_set_status
--    Padrão idêntico ao admission_set_status.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.termination_set_status(
  _request_id   uuid,
  _to_status    public.termination_status,
  _reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req RECORD;
  _uid uuid := auth.uid();
  _allowed_transitions jsonb := '{
    "rascunho":              ["em_aprovacao", "cancelado"],
    "em_aprovacao":          ["aprovado", "reprovado", "retornado", "cancelado"],
    "retornado":             ["em_aprovacao", "cancelado"],
    "aprovado":              ["desligamento_concluido", "cancelado"],
    "reprovado":             ["cancelado"],
    "desligamento_concluido":["cancelado"],
    "cancelado":             []
  }'::jsonb;
  _valid_targets jsonb;
BEGIN
  SELECT * INTO _req FROM public.termination_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Solicitação não encontrada');
  END IF;

  _valid_targets := _allowed_transitions -> _req.status::text;
  IF _valid_targets IS NULL OR NOT _valid_targets ? _to_status::text THEN
    RETURN jsonb_build_object('error', format('Transição de %s para %s não permitida', _req.status, _to_status));
  END IF;

  -- Verificação de permissão
  IF NOT (has_role(_uid, 'diretoria') OR has_role(_uid, 'administrativo') OR has_role(_uid, 'rh')) THEN
    -- Exceção: o solicitante pode enviar para aprovação
    IF NOT (_req.requester_user_id = _uid AND _req.status = 'rascunho' AND _to_status = 'em_aprovacao') THEN
      RETURN jsonb_build_object('error', 'Sem permissão para esta operação');
    END IF;
  END IF;

  UPDATE public.termination_requests SET status = _to_status WHERE id = _request_id;

  INSERT INTO public.status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
  VALUES ('desligamentos', 'termination_requests', _request_id, _req.status::text, _to_status::text, _uid);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (_uid, 'status_change', 'termination_requests', _request_id::text,
    jsonb_build_object('from', _req.status, 'to', _to_status, 'reason', _reason));

  -- Notifica o solicitante se a ação foi feita por outro usuário
  IF _req.requester_user_id != _uid THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_req.requester_user_id,
      CASE _to_status::text
        WHEN 'cancelado' THEN 'Desligamento cancelado'
        ELSE 'Desligamento atualizado'
      END,
      format('Processo de desligamento movido para: %s', _to_status::text),
      jsonb_build_object('entity_type', 'termination_requests', 'entity_id', _request_id, 'status', _to_status));
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _to_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.termination_set_status(uuid, public.termination_status, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. ATUALIZAÇÃO DO get_domain_status
--    Adiciona suporte ao domínio desligamentos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_domain_status(
  p_module_code   text,
  p_reference_id  uuid
)
RETURNS TABLE(domain_status text, domain_requester_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE
    WHEN p_module_code IN ('abastecimento', 'diaria', 'reembolso') THEN
      RETURN QUERY
        SELECT fr.status::text, fr.requester_user_id
        FROM   public.fuel_requests fr
        WHERE  fr.id = p_reference_id
        LIMIT  1;

    WHEN p_module_code = 'admissions' THEN
      RETURN QUERY
        SELECT ar.status::text, ar.requester_user_id
        FROM   public.admission_requests ar
        WHERE  ar.id = p_reference_id
        LIMIT  1;

    WHEN p_module_code = 'compras' THEN
      RETURN QUERY
        SELECT c.status::text, c.requester_user_id
        FROM   public.purchases c
        WHERE  c.id = p_reference_id
        LIMIT  1;

    WHEN p_module_code = 'desligamentos' THEN
      RETURN QUERY
        SELECT tr.status::text, tr.requester_user_id
        FROM   public.termination_requests tr
        WHERE  tr.id = p_reference_id
        LIMIT  1;

    ELSE
      RETURN;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_domain_status(text, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6. ATUALIZAÇÃO DO process_approval_action
--    Adiciona bloco ELSIF para desligamentos.
--    Preserva integralmente todos os blocos existentes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_approval_action(
  p_approval_request_id uuid,
  p_action text,
  p_comments text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req RECORD;
  _flow RECORD;
  _next RECORD;
  _prev RECORD;
  _old text;
  _new text;
  _module_code text;
BEGIN
  IF p_action NOT IN ('approve','reject','return') THEN
    RETURN jsonb_build_object('code','ENGINE-400','message','Ação inválida');
  END IF;

  BEGIN
    SELECT * INTO STRICT _req FROM approval_requests WHERE id = p_approval_request_id FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('code','FLOW-008','message','Outra operação está processando esta solicitação.');
    WHEN no_data_found THEN
      RETURN jsonb_build_object('code','ENGINE-404','message','Solicitação não encontrada');
  END;

  IF _req.ended_at IS NOT NULL THEN 
    RETURN jsonb_build_object('code','ENGINE-403','message','Fluxo já encerrado'); 
  END IF;
  
  IF _req.current_approver_user_id != _uid THEN
    RETURN jsonb_build_object('code','AUTH-009','message','Você não é o aprovador da etapa atual');
  END IF;

  SELECT * INTO _flow FROM approval_flows WHERE id = _req.flow_id;
  _old := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments)='') THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da recusa');
    END IF;
    _new := 'rejected';
    UPDATE approval_request_steps SET status='rejected', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN
      RETURN jsonb_build_object('code','ENGINE-403','message','Este fluxo não permite devolução');
    END IF;
    IF p_comments IS NULL OR trim(p_comments)='' THEN
      RETURN jsonb_build_object('code','ENGINE-400','message','É obrigatório informar o motivo da devolução');
    END IF;

    IF COALESCE(_flow.return_mode,'requester') = 'previous_step' THEN
      SELECT * INTO _prev FROM approval_request_steps
        WHERE approval_request_id=p_approval_request_id AND step_order < _req.current_step_order
        ORDER BY step_order DESC LIMIT 1;
      IF _prev.id IS NOT NULL THEN
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_request_steps SET status='pending', action_at=NULL, comments=NULL
          WHERE id=_prev.id;
        _new := 'awaiting_step_'||_prev.step_order;
        UPDATE approval_requests
          SET current_step_order=_prev.step_order,
              current_approver_user_id=_prev.approver_user_id,
              status=_new
          WHERE id=p_approval_request_id;
        IF _flow.notify_next_approver THEN
          INSERT INTO notifications (user_id,title,message,metadata)
          VALUES (_prev.approver_user_id,'Solicitação devolvida para reanálise',
            COALESCE('Motivo: '||p_comments,'Devolvida'),
            jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
        END IF;
      ELSE
        _new := 'returned_to_requester';
        UPDATE approval_request_steps SET status='pending', action_at=NULL
          WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
      END IF;
    ELSE
      _new := 'returned_to_requester';
      UPDATE approval_request_steps SET status='pending', action_at=NULL
        WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
      UPDATE approval_requests SET status=_new WHERE id=p_approval_request_id;
    END IF;

  ELSIF p_action = 'approve' THEN
    UPDATE approval_request_steps SET status='approved', action_at=now(), comments=p_comments
      WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    SELECT * INTO _next FROM approval_request_steps
      WHERE approval_request_id=p_approval_request_id
        AND step_order > _req.current_step_order AND status='pending'
      ORDER BY step_order LIMIT 1;
    IF _next.id IS NOT NULL THEN
      _new := 'awaiting_step_'||_next.step_order;
      UPDATE approval_requests
        SET current_step_order=_next.step_order,
            current_approver_user_id=_next.approver_user_id,
            status=_new
        WHERE id=p_approval_request_id;
      IF _flow.notify_next_approver THEN
        INSERT INTO notifications (user_id,title,message,metadata)
        VALUES (_next.approver_user_id,'Nova aprovação pendente',
          'Solicitação aguardando sua aprovação',
          jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
      END IF;
    ELSE
      _new := 'approved';
      UPDATE approval_requests SET status=_new, ended_at=now() WHERE id=p_approval_request_id;
    END IF;
  END IF;

  INSERT INTO approval_history (approval_request_id,action,action_by,step_order,comments,old_status,new_status)
  VALUES (p_approval_request_id,p_action,_uid,_req.current_step_order,p_comments,_old,_new);

  INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details)
  VALUES (_uid,'approval_'||p_action,'approval_request',p_approval_request_id::text,
    jsonb_build_object('old_status',_old,'new_status',_new,'comments',p_comments));

  IF _req.requester_user_id != _uid THEN
    INSERT INTO notifications (user_id,title,message,metadata) VALUES (_req.requester_user_id,
      CASE p_action
        WHEN 'approve' THEN CASE WHEN _new='approved' THEN 'Solicitação aprovada' ELSE 'Etapa aprovada' END
        WHEN 'reject' THEN 'Solicitação recusada'
        WHEN 'return' THEN 'Solicitação devolvida para correção'
      END,
      CASE p_action
        WHEN 'approve' THEN 'Sua solicitação avançou no fluxo'
        WHEN 'reject' THEN COALESCE('Motivo: '||p_comments,'Recusada')
        WHEN 'return' THEN COALESCE('Motivo: '||p_comments||' — corrija e reenvie para retomar o fluxo','Devolvida para correção')
      END,
      jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
  END IF;

  SELECT am.code INTO _module_code FROM approval_modules am WHERE am.id = _req.module_id;

  IF _module_code IN ('abastecimento', 'reembolso', 'diaria') THEN
    IF _new = 'approved' THEN
      UPDATE fuel_requests SET status = 'aprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE fuel_requests SET status = 'reprovado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'reprovado', _uid);
    ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN
      UPDATE fuel_requests SET status = 'retornado'::fuel_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'compras' THEN
    IF _new = 'approved' THEN
      UPDATE purchases SET status = 'aprovado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE purchases SET status = 'rejeitado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'rejeitado', _uid);
    ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN
      UPDATE purchases SET status = 'retornado'
        WHERE id = _req.reference_id AND status = 'em_aprovacao';
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('compras', 'purchases', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;

  ELSIF _module_code = 'admissions' THEN
    IF _new = 'approved' THEN
      UPDATE admission_requests SET status = 'registros_concluidos'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'registros_concluidos', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE admission_requests SET status = 'cancelado'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'cancelado', _uid);
    ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN
      UPDATE admission_requests SET status = 'rascunho'::admission_status
        WHERE id = _req.reference_id;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('admissions', 'admission_requests', _req.reference_id, 'aguardando_triagem', 'rascunho', _uid);
    END IF;

  ELSIF _module_code = 'desligamentos' THEN
    IF _new = 'approved' THEN
      UPDATE termination_requests SET status = 'aprovado'::termination_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::termination_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('desligamentos', 'termination_requests', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE termination_requests SET status = 'reprovado'::termination_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::termination_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('desligamentos', 'termination_requests', _req.reference_id, 'em_aprovacao', 'reprovado', _uid);
    ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN
      UPDATE termination_requests SET status = 'retornado'::termination_status
        WHERE id = _req.reference_id AND status = 'em_aprovacao'::termination_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
        VALUES ('desligamentos', 'termination_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'status',_new);
END;
$$;
