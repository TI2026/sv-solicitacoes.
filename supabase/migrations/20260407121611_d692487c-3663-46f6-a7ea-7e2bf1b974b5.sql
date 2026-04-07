
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'diretoria'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'diretoria'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
);
