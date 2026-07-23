# SPRINT 15: MATRIZ DE PERMISSÕES E RBAC DINÂMICO

## CONCEITO FUNDAMENTAL
A fonte de dados é **estritamente dinâmica** via `roles`, `permission_modules` e `role_permission_matrix`. Os métodos legados (`app_role`, `has_role`) são apenas adaptadores. O Frontend NUNCA acessa matriz bypassando as RLS ou RPCs.

## DEFINIÇÃO DE PERFIS E PRIVILÉGIOS POR MÓDULO

### MASTER
- Visualizar: ALL (Log de Auditoria Completo)
- Criar/Editar/Enviar: ALL
- Aprovar/Devolver/Rejeitar: ALL (com justificativa)
- Cancelar: ALL (inclusive operações irreversíveis por exceção)
- Administrar: Usuários, Perfis, Configurações, Parâmetros.

### DIRETORIA
- Visualizar: ALL no escopo corporativo.
- Criar/Editar/Enviar: Compras, Desligamentos, Diárias.
- Aprovar: Até Limite Máximo Financeiro.
- Administrar: Configurações Gerais.

### ADMINISTRATIVO
- Visualizar: Visão Global exceto Auditoria.
- Aprovar/Revisar: Abastecimento (Documentos finais), Admissão (Triagem).
- Administrar: Frota, Colaboradores básicos.

### RECURSOS HUMANOS
- Visualizar: Setor e Visão Global Pessoal.
- Criar/Administrar: Admissões, Desligamentos, EPIs, Férias/Colaboradores.
- Aprovar: Etapas de Gestão de Pessoas.

### FINANCEIRO
- Visualizar: Global nas etapas que envolvem custos.
- Aprovar/Revisar: Compras, Abastecimento (Financeiro), Diárias, Reembolsos.
- Confirmar Pagamentos: Exclusivo.

### COMPRAS
- Visualizar: Módulo de Compras (todas as etapas pós aprovação).
- Criar: Processar OC.
- Administrar: Fornecedores.

### SUPERVISOR
- Visualizar: Dados de seu Setor (Responsável ou Substituto).
- Aprovar: Demandas de colaboradores subordinados.
- Criar: Reembolsos, Diárias de equipe.

### COLABORADOR (Base)
- Visualizar: Apenas `self` (registros próprios).
- Criar/Enviar: Abastecimento, Reembolsos (apenas se liberado via config).
- Não edita aprovações, não altera histórico técnico e só vê o setor a ele designado. Nomes de aprovadores omitidos.
