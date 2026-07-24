
UPDATE public.roles SET name = 'Diretoria', description = 'Acesso total ao sistema, gestão de permissões, usuários e aprovações' WHERE key = 'diretoria';
UPDATE public.roles SET name = 'Administrativo', description = 'Revisão e operação de processos internos, solicitações e acompanhamento geral' WHERE key = 'administrativo';
UPDATE public.roles SET name = 'Recursos Humanos', description = 'Gestão de admissões, candidatos, documentos, EPIs e exames médicos' WHERE key = 'rh';
UPDATE public.roles SET name = 'Supervisor', description = 'Supervisão de equipes, aprovações operacionais e acompanhamento de atividades' WHERE key = 'supervisor';
UPDATE public.roles SET name = 'Colaborador', description = 'Acesso básico para criar solicitações e acompanhar seus próprios processos' WHERE key = 'colaborador';
UPDATE public.roles SET name = 'Compras', description = 'Gestão de ordens de compra, cotações e controle de materiais' WHERE key = 'compras';
UPDATE public.roles SET name = 'Financeiro', description = 'Controle de pagamentos, conferência financeira e gestão de despesas' WHERE key = 'financeiro';
UPDATE public.roles SET name = 'Master', description = 'Superadministrador com acesso irrestrito a todos os módulos e configurações' WHERE key = 'master';
