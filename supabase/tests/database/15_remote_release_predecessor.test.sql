-- Remote predecessor contract: only effective schema dependencies are added.
BEGIN;
SELECT * FROM no_plan();

SELECT is(
  (SELECT count(*)::integer
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchases'
      AND is_nullable = 'YES'
      AND (column_name, udt_name) IN (
        ('purchase_notes', 'text'),
        ('delivery_address', 'text'),
        ('delivery_date', 'date'),
        ('tracking_code', 'text'),
        ('confirmed_at', 'timestamptz'),
        ('confirmed_by', 'uuid')
      )),
  6,
  'predecessor garante as seis colunas nullable de Compras com tipos corretos'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.purchases'::regclass
       AND c.confrelid = 'public.profiles'::regclass
       AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (confirmed_by) REFERENCES profiles(id)%'
  ),
  'confirmed_by preserva FK para profiles'
);

SELECT ok(
  to_regprocedure('public.start_approval_flow(text,uuid)') IS NOT NULL,
  'overload de compatibilidade existe para o predecessor remoto'
);

SELECT is(
  has_function_privilege('authenticated', 'public.start_approval_flow(text,uuid)', 'EXECUTE'),
  false,
  'overload de compatibilidade não fica público para authenticated'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Admins and RH can read admissions files',
        'Admins and RH can upload admissions files',
        'Admins RH read epis',
        'Admins RH upload epis',
        'Admins RH update epis',
        'Admins RH delete epis',
        'Purchases bucket requires authentication'
      )),
  0,
  'policies Storage legadas incompatíveis foram removidas'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Admins and RH can view admissions files',
        'Admins and RH can insert admissions files',
        'Admins and RH can update admissions files',
        'Admins and RH can delete admissions files'
      )),
  4,
  'Admissions termina com policies explícitas por operação'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Authorized users can view epi files',
        'Authorized users can insert epi files',
        'Authorized users can update epi files',
        'Authorized users can delete epi files'
      )),
  4,
  'EPI termina com policies explícitas por operação'
);

SELECT is(
  (SELECT count(*)::integer
     FROM storage.buckets
    WHERE id IN ('admissions', 'purchases', 'purchase-attachments', 'epis')
      AND public),
  0,
  'buckets sensíveis existentes permanecem privados'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'notifications'
       AND indexname = 'uq_notifications_workflow_event'
  ),
  'cadeia final cria índice único de event_key'
);

SELECT is(
  (SELECT count(*)::integer
     FROM (
       SELECT metadata->>'event_key'
         FROM public.notifications
        WHERE nullif(metadata->>'event_key', '') IS NOT NULL
        GROUP BY metadata->>'event_key'
       HAVING count(*) > 1
     ) duplicate_events),
  0,
  'não existem event_key duplicados após a cadeia'
);

SELECT is(
  (SELECT count(*)::integer
     FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN (
        'approval_requests', 'approval_request_steps', 'notifications', 'status_history',
        'purchases', 'fuel_requests', 'admission_requests', 'termination_requests'
      )),
  8,
  'as oito tabelas operacionais permanecem na publication Realtime'
);

SELECT is(
  (SELECT count(*)::integer
     FROM cron.job
    WHERE command = 'SELECT public._engine_sla_sweep();'
      AND schedule = '*/15 * * * *'
      AND active),
  1,
  'cadeia final mantém exatamente um sweep SLA ativo a cada 15 minutos'
);

SELECT * FROM finish();
ROLLBACK;
