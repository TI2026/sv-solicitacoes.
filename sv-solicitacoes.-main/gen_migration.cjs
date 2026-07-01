const fs = require('fs');
let s = fs.readFileSync('temp_start.sql', 'utf8');
let p = fs.readFileSync('temp_process.sql', 'utf8');

const sInsert = `BEGIN
  -- [P1-04] Correção: validar IDOR — IP-PLAN Onda 2
  IF p_requester_user_id != auth.uid() AND NOT (has_role(auth.uid(), 'diretoria') OR has_role(auth.uid(), 'administrativo')) THEN
    RETURN jsonb_build_object('error', 'Sem permissão para iniciar fluxo em nome de outro usuário');
  END IF;

  -- [P1-03] Correção: evitar fluxo duplicado (race condition) — IP-PLAN Onda 2
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE reference_id = p_reference_id
      AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('error', 'Já existe um fluxo de aprovação ativo para esta solicitação.');
  END IF;`;

s = s.replace(/BEGIN/, sInsert);

const pInsert = `-- [P1-05] Correção: precedência de operadores OR e AND — IP-PLAN Onda 2
    ELSIF (_new LIKE 'returned%' OR (_new LIKE 'awaiting_step_%' AND p_action = 'return')) THEN`;

p = p.replace(/ELSIF _new LIKE 'returned%' OR _new LIKE 'awaiting_step_%' AND p_action = 'return' THEN/, pInsert);

const final = `-- [P1-03] Correção: UNIQUE INDEX para garantir consistência no banco
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_one_active_per_reference
  ON public.approval_requests(reference_id)
  WHERE ended_at IS NULL;

${s}

${p}

-- === ROLLBACK ===
-- DROP INDEX IF EXISTS public.idx_approval_requests_one_active_per_reference;
-- Reverter as funções start_approval_flow e process_approval_action para as versões anteriores (presentes nas migrations 20260623181031 e 20260622163923 respectivamente).
-- Precondição para rollback: Nenhuma
`;

fs.writeFileSync('supabase/migrations/20260630133918_fix_P1-03_P1-04_P1-05_atomicidade.sql', final);
