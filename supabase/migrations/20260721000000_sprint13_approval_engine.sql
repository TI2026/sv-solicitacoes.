-- =========================================================================
-- SPRINT 13 - APROVAÇÕES (RC2)
-- Consolidando Motor de Aprovações para 2 Tipos Estritos: 'sector' e 'specific_user'
-- =========================================================================

-- 1) Preparar colunas novas
ALTER TABLE public.approval_flow_steps
  ADD COLUMN IF NOT EXISTS timeout_hours integer;

-- 2) Renomear fixed_sector_id se existir
DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='approval_flow_steps' and column_name='fixed_sector_id')
  THEN
      ALTER TABLE public.approval_flow_steps RENAME COLUMN fixed_sector_id TO sector_id;
  END IF;
  
  -- Para garantir caso já não exista
  IF NOT EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_name='approval_flow_steps' and column_name='sector_id')
  THEN
      ALTER TABLE public.approval_flow_steps ADD COLUMN sector_id uuid REFERENCES public.sectors(id);
  END IF;
END $$;

-- 3) Migração de Dados (Compatibilidade)
-- Converte 'usuario_fixo' -> 'specific_user'
UPDATE public.approval_flow_steps 
SET approver_type = 'specific_user' 
WHERE approver_type = 'usuario_fixo';

-- Converte 'responsavel_do_setor_especifico' -> 'sector'
UPDATE public.approval_flow_steps 
SET approver_type = 'sector' 
WHERE approver_type = 'responsavel_do_setor_especifico';

-- Converte demais lógicas abandonadas para 'specific_user' 
-- (para não quebrar a CONSTRAINT nova, mas idealmente o admin vai reconfigurar depois)
UPDATE public.approval_flow_steps 
SET approver_type = 'specific_user' 
WHERE approver_type IN ('gestor_imediato', 'responsavel_do_setor_do_solicitante', 'cargo_perfil');

-- Em casos que a tabela era null (se aplicável), setar specific_user
UPDATE public.approval_flow_steps 
SET approver_type = 'specific_user' 
WHERE approver_type IS NULL;

-- 4) Redefinir a Constraint de Tipos Permitidos
ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_approver_type_check;

ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_approver_type_check
  CHECK (approver_type IN ('sector', 'specific_user'));

-- 5) Redefinir a Constraint de Coerência (Campos Obrigatórios)
ALTER TABLE public.approval_flow_steps
  DROP CONSTRAINT IF EXISTS approval_flow_steps_required_fields_check;

ALTER TABLE public.approval_flow_steps
  ADD CONSTRAINT approval_flow_steps_required_fields_check CHECK (
    (approver_type = 'specific_user' AND approver_user_id IS NOT NULL)
    OR (approver_type = 'sector' AND sector_id IS NOT NULL)
  );

-- 6) Atualizar RPC start_approval_flow para simplificar e ler apenas os 2 tipos
CREATE OR REPLACE FUNCTION public.start_approval_flow(
  p_module_code text, p_reference_id uuid, p_requester_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _module_id uuid;
  _flow RECORD;
  _step RECORD;
  _request_id uuid;
  _resolved_user_id uuid;
  _resolved_sector_id uuid;
  _first_approver uuid := NULL;
  _first_order integer := NULL;
BEGIN
  SELECT id INTO _module_id FROM public.approval_modules WHERE code = p_module_code AND active LIMIT 1;
  IF _module_id IS NULL THEN RETURN jsonb_build_object('error', 'Módulo de aprovação não encontrado'); END IF;

  SELECT * INTO _flow FROM public.approval_flows WHERE module_id = _module_id AND active
    ORDER BY updated_at DESC, created_at DESC LIMIT 1;
  IF _flow.id IS NULL THEN RETURN jsonb_build_object('error', 'Nenhum fluxo de aprovação ativo'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_flow_steps WHERE flow_id = _flow.id AND active) THEN
    RETURN jsonb_build_object('error', 'Fluxo sem aprovadores');
  END IF;

  INSERT INTO public.approval_requests (module_id, flow_id, reference_id, requester_user_id, status)
  VALUES (_module_id, _flow.id, p_reference_id, p_requester_user_id, 'pending_resolution')
  RETURNING id INTO _request_id;

  FOR _step IN
    SELECT * FROM public.approval_flow_steps
    WHERE flow_id = _flow.id AND active
    ORDER BY step_order, created_at, id
  LOOP
    _resolved_user_id := NULL;
    _resolved_sector_id := NULL;

    CASE _step.approver_type
      WHEN 'specific_user' THEN
        _resolved_user_id := _step.approver_user_id;

      WHEN 'sector' THEN
        IF _step.sector_id IS NOT NULL THEN
          SELECT s.responsible_user_id INTO _resolved_user_id
            FROM public.sectors s
            JOIN public.profiles p ON p.id = s.responsible_user_id AND COALESCE(p.active,true)
            WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          
          -- Se o responsável não está ativo/existente, tenta o substituto logo na largada
          IF _resolved_user_id IS NULL THEN
            SELECT s.substitute_user_id INTO _resolved_user_id
              FROM public.sectors s
              JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
              WHERE s.id = _step.sector_id AND s.active LIMIT 1;
          END IF;
          _resolved_sector_id := _step.sector_id;
        END IF;
        
      ELSE
        -- Fallback de segurança para legados não previstos
        _resolved_user_id := _step.approver_user_id;
    END CASE;

    IF _resolved_user_id IS NOT NULL THEN
      INSERT INTO public.approval_request_steps (
        approval_request_id, flow_step_id, step_order, approver_user_id,
        is_required, status, timeout_hours
      ) VALUES (
        _request_id, _step.id, _step.step_order, _resolved_user_id,
        _step.is_required, 'pending', _step.timeout_hours
      );

      IF _first_approver IS NULL THEN
        _first_approver := _resolved_user_id;
        _first_order := _step.step_order;
      END IF;
    END IF;
  END LOOP;

  -- Se após todo o mapeamento não temos aprovador, quebra
  IF _first_approver IS NULL THEN
    DELETE FROM public.approval_requests WHERE id = _request_id;
    RETURN jsonb_build_object('error', 'Nenhum aprovador válido encontrado na resolução da cadeia');
  END IF;

  UPDATE public.approval_requests
  SET status = 'awaiting_step_' || _first_order,
      current_step_order = _first_order,
      current_approver_user_id = _first_approver
  WHERE id = _request_id;

  IF _flow.notify_next_approver THEN
    INSERT INTO public.notifications (user_id, title, message, metadata)
    VALUES (_first_approver, 'Nova aprovação pendente', 'Uma solicitação aguarda sua aprovação.',
      jsonb_build_object('entity_type', 'approval_request', 'entity_id', _request_id));
  END IF;

  RETURN jsonb_build_object('success', true, 'approval_request_id', _request_id);
END;
$function$;

-- 7) Criar RPC de checagem de Timeout
-- Esta RPC verifica se estourou o tempo de 'pending' ou 'awaiting'
-- e transfere a responsabilidade.
CREATE OR REPLACE FUNCTION public.check_and_escalate_timeouts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _req RECORD;
  _step RECORD;
  _new_approver uuid;
  _total_escalated integer := 0;
BEGIN
  -- Percorre todas as requisições ativas
  FOR _req IN 
    SELECT r.*, fs.timeout_hours, fs.approver_type, fs.sector_id
    FROM public.approval_requests r
    JOIN public.approval_request_steps rs ON rs.approval_request_id = r.id AND rs.step_order = r.current_step_order
    JOIN public.approval_flow_steps fs ON fs.id = rs.flow_step_id
    WHERE r.ended_at IS NULL 
      AND fs.timeout_hours IS NOT NULL
      AND fs.timeout_hours > 0
      AND rs.action_at IS NULL
  LOOP
    -- Se o tempo atual passou do (criado_em + timeout_hours) 
    -- usamos r.updated_at porque representa quando ele entrou naquele step
    IF now() > (_req.updated_at + (_req.timeout_hours || ' hours')::interval) THEN
      
      _new_approver := NULL;

      -- Apenas faz fallback para o substituto do setor no caso 'sector'
      IF _req.approver_type = 'sector' AND _req.sector_id IS NOT NULL THEN
        SELECT s.substitute_user_id INTO _new_approver
          FROM public.sectors s
          JOIN public.profiles p ON p.id = s.substitute_user_id AND COALESCE(p.active,true)
          WHERE s.id = _req.sector_id AND s.active LIMIT 1;
      END IF;

      -- Se existe um substituto viável E que é diferente do cara atual
      IF _new_approver IS NOT NULL AND _new_approver != _req.current_approver_user_id THEN
        -- Transfere a responsabilidade na aprovação atual e no request
        UPDATE public.approval_request_steps
          SET approver_user_id = _new_approver,
              comments = COALESCE(comments || ' ', '') || '[TIMEOUT ESCALATION] Passado automaticamente de ' || _req.current_approver_user_id || ' para substituto.'
          WHERE approval_request_id = _req.id AND step_order = _req.current_step_order;

        UPDATE public.approval_requests
          SET current_approver_user_id = _new_approver,
              updated_at = now()
          WHERE id = _req.id;
          
        -- Histórico  
        INSERT INTO public.approval_history (approval_request_id, action, action_by, step_order, comments, old_status, new_status)
        VALUES (_req.id, 'escalated', _req.current_approver_user_id, _req.current_step_order, 'Timeout expirado. Passado ao substituto.', _req.status, _req.status);

        _total_escalated := _total_escalated + 1;
      END IF;

    END IF;
  END LOOP;

  RETURN _total_escalated;
END;
$function$;
