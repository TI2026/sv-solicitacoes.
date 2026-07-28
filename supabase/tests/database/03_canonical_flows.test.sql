BEGIN;
SELECT plan(13);

-- 1. Verifica se existem 6 módulos
SELECT is(
  (SELECT count(*)::int FROM public.approval_modules WHERE active = true),
  6,
  'Existem exatamente 6 módulos ativos'
);

-- 2. Verifica fluxos canônicos
SELECT is(
  (SELECT count(*)::int FROM public.approval_flows WHERE active = true),
  6,
  'Existe exatamente um fluxo ativo por módulo'
);

-- 3. Verifica se a versão canônica está definida
SELECT is(
  (SELECT count(*)::int FROM public.approval_flows WHERE active = true AND version = 'v1'),
  6,
  'Todos os fluxos ativos estão na versão v1'
);

-- 4. Verifica quantidade de etapas
-- Justificativa: A matriz canônica documentada no SPRINT15_FONTE_UNICA_VERDADE.md define explicitamente 12 etapas no total.
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id WHERE af.active = true),
  12,
  'Quantidade total de etapas dos fluxos canônicos é 12'
);

-- 5. Compras tem 1 etapa
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'compras'),
  1,
  'Compras possui 1 etapa'
);

-- 6. Abastecimento tem 2 etapas
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'abastecimento'),
  2,
  'Abastecimento possui 2 etapas'
);

-- 7. Diária tem 3 etapas
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'diaria'),
  3,
  'Diária possui 3 etapas'
);

-- 8. Reembolso tem 2 etapas
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'reembolso'),
  2,
  'Reembolso possui 2 etapas'
);

-- 9. Admissões tem 2 etapas
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'admissoes'),
  2,
  'Admissões possui 2 etapas'
);

-- 10. Desligamentos tem 2 etapas
SELECT is(
  (SELECT count(*)::int FROM public.approval_flow_steps afs JOIN public.approval_flows af ON af.id = afs.flow_id JOIN public.approval_modules am ON am.id = af.module_id WHERE af.active = true AND am.code = 'desligamentos'),
  2,
  'Desligamentos possui 2 etapas'
);

-- 11. Validações de unique funcionam (Inserir fluxo duplicado falha)
SELECT throws_ok(
  'INSERT INTO public.approval_flows (module_id, name, approval_type, active) SELECT module_id, ''Teste Duplicado'', ''sequential'', true FROM public.approval_flows LIMIT 1',
  'P0001',
  NULL,
  'Tentativa de criar segundo fluxo ativo é bloqueada pela constraint'
);

-- 12. Validações de unique funcionam (Inserir step_order duplicado falha)
SELECT throws_ok(
  'INSERT INTO public.approval_flow_steps (flow_id, step_order, step_code, approver_type, approver_role_key) SELECT flow_id, step_order, ''dup_step'', ''cargo_perfil'', ''master'' FROM public.approval_flow_steps WHERE approver_type = ''cargo_perfil'' LIMIT 1',
  '23505',
  NULL,
  'Tentativa de criar step_order duplicado é bloqueada'
);

-- 13. Validações de unique funcionam (Inserir step_code duplicado falha)
SELECT throws_ok(
  'INSERT INTO public.approval_flow_steps (flow_id, step_order, step_code, approver_type, approver_role_key) SELECT flow_id, 999, step_code, ''cargo_perfil'', ''master'' FROM public.approval_flow_steps WHERE approver_type = ''cargo_perfil'' LIMIT 1',
  '23505',
  NULL,
  'Tentativa de criar step_code duplicado é bloqueada'
);

SELECT * FROM finish();
ROLLBACK;
