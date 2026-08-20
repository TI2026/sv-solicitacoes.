-- ============================================================
-- ONDA G — Homologação do núcleo do Motor V2
-- Cobertura: contrato de contexto, grants, snapshot, roteamento
-- V1/V2, semântica de etapas e invariantes de encerramento.
-- ============================================================
BEGIN;
SELECT plan(24);

-- 1..4 Contrato do action context ampliado
SELECT has_type('public', 'entity_action_context', 'tipo de contexto existe');
SELECT ok(
  (SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.typrelid = a.attrelid
    WHERE t.typname = 'entity_action_context'
      AND a.attname IN ('approval_request_id','flow_id','current_step_code',
                        'current_step_kind','next_step_code','can_edit')) = 6,
  'action context expõe os campos do contrato V2');
SELECT function_returns('public', 'get_entity_action_context',
  ARRAY['text','uuid'], 'entity_action_context', 'contexto retorna o tipo canônico');
SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE proname='get_entity_action_context'
     AND pronamespace='public'::regnamespace), true, 'contexto é security definer');

-- 5..10 Grants: apenas os 3 entry points são chamáveis por usuários
SELECT ok(has_function_privilege('authenticated', p.oid, 'execute'), 'authenticated executa ' || p.proname)
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('execute_entity_action','process_approval_action','get_entity_action_context');

SELECT ok(NOT has_function_privilege('anon', p.oid, 'execute'), 'anon NÃO executa ' || p.proname)
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('execute_entity_action','process_approval_action','get_entity_action_context');

-- 11..17 Funções internas do motor são privadas
SELECT ok(
  NOT has_function_privilege('authenticated', p.oid, 'execute')
  AND NOT has_function_privilege('anon', p.oid, 'execute'),
  p.proname || ' é interna ao motor')
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('_engine_process_v2','_engine_activate_next','_engine_reactivate_returned',
                    '_engine_sla_sweep','_engine_can_view','_engine_entity_read','_update_entity_status');

-- 18 V1 preservado
SELECT has_function('public', '_engine_process_v1', ARRAY['uuid','text','text'],
  'motor V1 preservado para requests legadas');

-- 19 Snapshot: colunas obrigatórias na instância
SELECT ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='approval_request_steps'
      AND column_name IN ('flow_version','step_code','step_kind','completion_action',
                          'next_step_activation','assignment_mode','primary_user_id',
                          'substitute_user_id','sla_hours','sla_deadline','activated_at','overdue')) = 12,
  'instância carrega o snapshot completo da etapa');

-- 20 Templates V2 continuam intactos e inativos
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps s
             JOIN public.approval_flows f ON f.id = s.flow_id
            WHERE f.version = 'v2'), 17, 'as 17 etapas canônicas V2 permanecem');
SELECT is((SELECT count(*)::int FROM public.approval_flows WHERE version='v2' AND active), 0,
  'nenhum fluxo V2 ativado (cutover bloqueado)');

-- 21 Toda etapa V2 tem ação canônica e destino de devolução/rejeição
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps s
             JOIN public.approval_flows f ON f.id = s.flow_id
            WHERE f.version='v2'
              AND (s.completion_action IS NULL OR s.return_entity_status IS NULL
                   OR s.rejection_entity_status IS NULL)), 0,
  'toda etapa V2 define ação canônica, devolução e rejeição');

-- 22 Exatamente uma etapa final por módulo V2
SELECT is((SELECT count(*)::int FROM (
        SELECT f.module_id FROM public.approval_flow_steps s
          JOIN public.approval_flows f ON f.id = s.flow_id
         WHERE f.version='v2' AND s.closes_workflow
         GROUP BY f.module_id HAVING count(*) <> 1) x), 0,
  'cada módulo V2 tem exatamente uma etapa de encerramento');

-- 23 Etapa que encerra nunca ativa próxima etapa
SELECT is((SELECT count(*)::int FROM public.approval_flow_steps s
             JOIN public.approval_flows f ON f.id = s.flow_id
            WHERE f.version='v2' AND s.closes_workflow
              AND s.next_step_activation IS NOT NULL), 0,
  'etapa final não encadeia próxima etapa');

-- 24 Fila só considera etapas realmente pendentes
SELECT ok((SELECT prosrc FROM pg_proc WHERE proname='get_my_approval_queue'
             AND pronamespace='public'::regnamespace) LIKE '%awaiting_step%',
  'fila filtra por awaiting_step');

SELECT * FROM finish();
ROLLBACK;
