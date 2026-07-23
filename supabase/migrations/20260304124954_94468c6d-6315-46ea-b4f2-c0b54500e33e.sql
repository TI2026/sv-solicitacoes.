
-- Add new enum values to fuel_status
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'concluido';
ALTER TYPE public.fuel_status ADD VALUE IF NOT EXISTS 'ativa';
