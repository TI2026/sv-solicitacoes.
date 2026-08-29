import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Retired in Checkpoint B.
//
// This endpoint used to repair requests with a raw status UPDATE and a
// reference-only workflow lookup. Both behaviors violate the authoritative
// Motor V2 contract. SLA is owned exclusively by the pg_cron job that calls
// public._engine_sla_sweep().
serve(() => new Response(
  JSON.stringify({
    error: 'ENDPOINT_RETIRED',
    replacement: 'public._engine_sla_sweep() via pg_cron',
  }),
  {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  },
))
