
-- Drop FKs pointing to auth.users (PostgREST can't resolve cross-schema joins)
ALTER TABLE public.fuel_requests DROP CONSTRAINT fuel_requests_requester_user_id_fkey;
ALTER TABLE public.admission_requests DROP CONSTRAINT admission_requests_requester_user_id_fkey;
ALTER TABLE public.fuel_reviews DROP CONSTRAINT fuel_reviews_reviewer_user_id_fkey;

-- Recreate FKs pointing to public.profiles so PostgREST can resolve joins
ALTER TABLE public.fuel_requests
  ADD CONSTRAINT fuel_requests_requester_user_id_fkey
  FOREIGN KEY (requester_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.admission_requests
  ADD CONSTRAINT admission_requests_requester_user_id_fkey
  FOREIGN KEY (requester_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.fuel_reviews
  ADD CONSTRAINT fuel_reviews_reviewer_user_id_fkey
  FOREIGN KEY (reviewer_user_id) REFERENCES public.profiles(id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_fuel_requests_status ON public.fuel_requests(status);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_requester ON public.fuel_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_fuel_requests_created ON public.fuel_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_requests_status ON public.admission_requests(status);
CREATE INDEX IF NOT EXISTS idx_admission_requests_requester ON public.admission_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_admission_requests_created ON public.admission_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_entity ON public.status_history(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.fuel_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admission_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- RH can view admission status history
CREATE POLICY "RH can view admission status history"
  ON public.status_history FOR SELECT
  USING (module = 'admissions' AND has_role(auth.uid(), 'rh'::app_role));

-- Allow any authenticated user to insert their own admission request
CREATE POLICY "Requester can insert own admission"
  ON public.admission_requests FOR INSERT
  WITH CHECK (requester_user_id = auth.uid());
