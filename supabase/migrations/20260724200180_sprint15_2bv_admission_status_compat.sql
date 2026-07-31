-- =======================================================================================
-- MIGRATION: sprint15_2bv_admission_status_compat.sql
-- DESCRIÇÃO: Resolve a falta do estado 'em_aprovacao' no enum admission_status,
-- necessário para a consolidação unificada do approval engine.
-- =======================================================================================

ALTER TYPE public.admission_status ADD VALUE IF NOT EXISTS 'em_aprovacao';
