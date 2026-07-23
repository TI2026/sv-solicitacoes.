-- Fix DB-003: Remover trigger de histórico duplicada em admission_requests
-- Mantemos a trigger 'trg_track_status_admission' (criada na migration 0304) e deletamos a antiga.

DROP TRIGGER IF EXISTS track_admission_status ON public.admission_requests;
