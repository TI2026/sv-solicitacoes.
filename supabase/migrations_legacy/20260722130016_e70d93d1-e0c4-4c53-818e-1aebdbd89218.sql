
-- 1) Módulos (idempotente)
INSERT INTO public.permission_modules (code, name, active) VALUES
  ('desligamentos', 'Desligamentos', true),
  ('epis',          'EPIs',          true),
  ('colaboradores', 'Colaboradores', true),
  ('setores',       'Setores',       true)
ON CONFLICT (code) DO NOTHING;

-- 2) Matriz por papel × módulo × ação (idempotente, sem revogar nada)
-- Master + Diretoria: acesso total aos 4 novos módulos
INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, m.id, a.id, true
FROM public.roles r
CROSS JOIN public.permission_modules m
CROSS JOIN public.permission_actions a
WHERE r.key IN ('master','diretoria')
  AND m.code IN ('desligamentos','epis','colaboradores','setores')
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;

-- Regras específicas por papel (grants pontuais)
WITH grants(role_key, module_code, action_code) AS (
  VALUES
    -- Colaboradores (cadastro mestre): RH opera; Admin/Supervisor apenas leitura
    ('rh',             'colaboradores', 'view'),
    ('rh',             'colaboradores', 'create'),
    ('rh',             'colaboradores', 'edit'),
    ('rh',             'colaboradores', 'export'),
    ('administrativo', 'colaboradores', 'view'),
    ('supervisor',     'colaboradores', 'view'),

    -- Desligamentos: RH conduz; Financeiro precisa ver p/ rescisão; Admin/Supervisor leitura
    ('rh',             'desligamentos', 'view'),
    ('rh',             'desligamentos', 'create'),
    ('rh',             'desligamentos', 'edit'),
    ('rh',             'desligamentos', 'export'),
    ('administrativo', 'desligamentos', 'view'),
    ('supervisor',     'desligamentos', 'view'),
    ('financeiro',     'desligamentos', 'view'),

    -- EPIs: Administrativo opera catálogo/entregas; RH e Supervisor acompanham; Compras vê
    ('administrativo', 'epis', 'view'),
    ('administrativo', 'epis', 'create'),
    ('administrativo', 'epis', 'edit'),
    ('administrativo', 'epis', 'export'),
    ('rh',             'epis', 'view'),
    ('supervisor',     'epis', 'view'),
    ('compras',        'epis', 'view'),

    -- Setores: apenas leitura para papéis que dependem de contexto setorial
    ('administrativo', 'setores', 'view'),
    ('rh',             'setores', 'view'),
    ('supervisor',     'setores', 'view')
    -- Financeiro, Compras e Colaborador: sem acesso padrão aos 4 módulos
)
INSERT INTO public.role_permission_matrix (role_id, module_id, action_id, allowed)
SELECT r.id, m.id, a.id, true
FROM grants g
JOIN public.roles r             ON r.key  = g.role_key
JOIN public.permission_modules m ON m.code = g.module_code
JOIN public.permission_actions a ON a.code = g.action_code
ON CONFLICT (role_id, module_id, action_id) DO NOTHING;
