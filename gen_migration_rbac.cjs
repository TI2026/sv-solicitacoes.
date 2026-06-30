const fs = require('fs');
let s = fs.readFileSync('temp_fuel.sql', 'utf8');

const sInsert1 = `    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.key IN ('diretoria', 'administrativo') AND ura.user_id != _uid;`;

s = s.replace(/FROM public\.user_roles ur\s+WHERE ur\.role IN \('diretoria', 'administrativo'\) AND ur\.user_id != _uid;/g, sInsert1);

const sInsert2 = `    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.key = 'diretoria' AND ura.user_id != _uid;`;

s = s.replace(/FROM public\.user_roles ur WHERE ur\.role = 'diretoria' AND ur\.user_id != _uid;/g, sInsert2);

const final = `-- [P1-01] Correção: Notificações com RBAC Atualizado — IP-PLAN Onda 4
${s}

-- === ROLLBACK ===
-- Reverter a função fuel_set_status para a versão anterior (presente na migration 20260622163923).
-- Precondição para rollback: Nenhuma
`;

fs.writeFileSync('supabase/migrations/20260630135238_fix_P1-01_rbac_notifications.sql', final);
