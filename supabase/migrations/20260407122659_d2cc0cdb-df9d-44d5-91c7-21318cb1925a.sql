
-- Remove BOTH duplicate triggers (the RPC fuel_set_status already inserts into status_history)
DROP TRIGGER IF EXISTS track_fuel_status ON public.fuel_requests;
DROP TRIGGER IF EXISTS trg_track_status_fuel ON public.fuel_requests;

-- Clean up existing duplicates: keep only the oldest row per (entity_id, to_status, created_at)
DELETE FROM public.status_history
WHERE id NOT IN (
  SELECT DISTINCT ON (entity_id, to_status, created_at) id
  FROM public.status_history
  ORDER BY entity_id, to_status, created_at, id
);
