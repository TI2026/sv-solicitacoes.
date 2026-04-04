
CREATE OR REPLACE FUNCTION public.process_approval_action(p_approval_request_id uuid, p_action text, p_comments text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid(); _req RECORD; _flow RECORD; _next RECORD; _prev RECORD;
  _old text; _new text;
  _module_code text;
  _fuel_req RECORD;
BEGIN
  IF p_action NOT IN ('approve','reject','return') THEN RETURN jsonb_build_object('error','Ação inválida'); END IF;
  SELECT * INTO _req FROM approval_requests WHERE id = p_approval_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Solicitação não encontrada'); END IF;
  IF _req.ended_at IS NOT NULL THEN RETURN jsonb_build_object('error','Fluxo já encerrado'); END IF;
  IF _req.current_approver_user_id != _uid THEN RETURN jsonb_build_object('error','Você não é o aprovador da etapa atual'); END IF;
  SELECT * INTO _flow FROM approval_flows WHERE id = _req.flow_id;
  _old := _req.status;

  IF p_action = 'reject' THEN
    IF _flow.require_rejection_reason AND (p_comments IS NULL OR trim(p_comments)='') THEN RETURN jsonb_build_object('error','É obrigatório informar o motivo da recusa'); END IF;
    _new := 'rejected';
    UPDATE approval_request_steps SET status='rejected',action_at=now(),comments=p_comments WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    UPDATE approval_requests SET status=_new,ended_at=now() WHERE id=p_approval_request_id;

  ELSIF p_action = 'return' THEN
    IF NOT _flow.allow_return_for_adjustment THEN RETURN jsonb_build_object('error','Este fluxo não permite devolução'); END IF;
    IF p_comments IS NULL OR trim(p_comments)='' THEN RETURN jsonb_build_object('error','É obrigatório informar o motivo da devolução'); END IF;
    UPDATE approval_request_steps SET status='returned',action_at=now(),comments=p_comments WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    IF COALESCE(_flow.return_mode,'requester') = 'previous_step' THEN
      SELECT * INTO _prev FROM approval_request_steps WHERE approval_request_id=p_approval_request_id AND step_order < _req.current_step_order ORDER BY step_order DESC LIMIT 1;
      IF _prev.id IS NOT NULL THEN
        UPDATE approval_request_steps SET status='pending',action_at=NULL,comments=NULL WHERE id=_prev.id;
        UPDATE approval_request_steps SET status='pending',action_at=NULL WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        _new := 'awaiting_step_'||_prev.step_order;
        UPDATE approval_requests SET current_step_order=_prev.step_order,current_approver_user_id=_prev.approver_user_id,status=_new WHERE id=p_approval_request_id;
        IF _flow.notify_next_approver THEN INSERT INTO notifications (user_id,title,message,metadata) VALUES (_prev.approver_user_id,'Solicitação devolvida para reanálise',COALESCE('Motivo: '||p_comments,'Devolvida'),jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id)); END IF;
      ELSE
        _new := 'returned_to_requester';
        UPDATE approval_request_steps SET status='pending',action_at=NULL WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
        UPDATE approval_requests SET status=_new,current_approver_user_id=NULL WHERE id=p_approval_request_id;
      END IF;
    ELSE
      _new := 'returned_to_requester';
      UPDATE approval_request_steps SET status='pending',action_at=NULL WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
      UPDATE approval_requests SET status=_new,current_approver_user_id=NULL WHERE id=p_approval_request_id;
    END IF;

  ELSIF p_action = 'approve' THEN
    UPDATE approval_request_steps SET status='approved',action_at=now(),comments=p_comments WHERE approval_request_id=p_approval_request_id AND step_order=_req.current_step_order;
    SELECT * INTO _next FROM approval_request_steps WHERE approval_request_id=p_approval_request_id AND step_order > _req.current_step_order AND status='pending' ORDER BY step_order LIMIT 1;
    IF _next.id IS NOT NULL THEN
      _new := 'awaiting_step_'||_next.step_order;
      UPDATE approval_requests SET current_step_order=_next.step_order,current_approver_user_id=_next.approver_user_id,status=_new WHERE id=p_approval_request_id;
      IF _flow.notify_next_approver THEN INSERT INTO notifications (user_id,title,message,metadata) VALUES (_next.approver_user_id,'Nova aprovação pendente','Solicitação aguardando sua aprovação',jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id)); END IF;
    ELSE _new := 'approved'; UPDATE approval_requests SET status=_new,ended_at=now() WHERE id=p_approval_request_id;
    END IF;
  END IF;

  -- Record history and audit
  INSERT INTO approval_history (approval_request_id,action,action_by,step_order,comments,old_status,new_status) VALUES (p_approval_request_id,p_action,_uid,_req.current_step_order,p_comments,_old,_new);
  INSERT INTO audit_logs (user_id,action,entity_type,entity_id,details) VALUES (_uid,'approval_'||p_action,'approval_request',p_approval_request_id::text,jsonb_build_object('old_status',_old,'new_status',_new,'comments',p_comments));
  IF _req.requester_user_id != _uid THEN
    INSERT INTO notifications (user_id,title,message,metadata) VALUES (_req.requester_user_id,
      CASE p_action WHEN 'approve' THEN CASE WHEN _new='approved' THEN 'Solicitação aprovada' ELSE 'Etapa aprovada' END WHEN 'reject' THEN 'Solicitação recusada' WHEN 'return' THEN 'Solicitação devolvida' END,
      CASE p_action WHEN 'approve' THEN 'Sua solicitação avançou no fluxo' WHEN 'reject' THEN COALESCE('Motivo: '||p_comments,'Recusada') WHEN 'return' THEN COALESCE('Motivo: '||p_comments,'Devolvida') END,
      jsonb_build_object('entity_type','approval_request','entity_id',p_approval_request_id));
  END IF;

  -- ============================================================
  -- ATOMIC SYNC: fuel_requests status for fleet modules
  -- ============================================================
  SELECT am.code INTO _module_code
  FROM approval_modules am WHERE am.id = _req.module_id;

  IF _module_code IN ('abastecimento', 'reembolso', 'diaria') THEN
    -- Only sync on terminal/return statuses
    IF _new = 'approved' THEN
      UPDATE fuel_requests SET status = 'aprovado'::fuel_status WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
      VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'aprovado', _uid);
    ELSIF _new = 'rejected' THEN
      UPDATE fuel_requests SET status = 'reprovado'::fuel_status WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
      VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'reprovado', _uid);
    ELSIF _new LIKE 'returned%' THEN
      UPDATE fuel_requests SET status = 'retornado'::fuel_status WHERE id = _req.reference_id AND status = 'em_aprovacao'::fuel_status;
      INSERT INTO status_history (module, entity_type, entity_id, from_status, to_status, changed_by)
      VALUES ('fleet', 'fuel_requests', _req.reference_id, 'em_aprovacao', 'retornado', _uid);
    END IF;
  END IF;

  RETURN jsonb_build_object('success',true,'status',_new);
END;$function$;
