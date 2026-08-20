
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('engine_sla_sweep_hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'engine_sla_sweep_hourly');

  PERFORM cron.schedule(
    'engine_sla_sweep_hourly',
    '0 * * * *',
    $cron$SELECT public._engine_sla_sweep();$cron$
  );
END;
$$;
