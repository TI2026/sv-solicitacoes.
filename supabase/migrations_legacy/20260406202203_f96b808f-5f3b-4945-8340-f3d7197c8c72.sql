
CREATE TABLE public.request_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL,
  request_type text NOT NULL,
  daily_limit integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (role, request_type)
);

ALTER TABLE public.request_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view request_limits"
  ON public.request_limits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage request_limits"
  ON public.request_limits FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'diretoria'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'diretoria'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE TRIGGER update_request_limits_updated_at
  BEFORE UPDATE ON public.request_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
