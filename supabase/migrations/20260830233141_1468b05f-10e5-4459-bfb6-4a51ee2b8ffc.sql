
CREATE OR REPLACE FUNCTION public.can_view_approval_flow_step(p_step_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'diretoria'::app_role)
      OR public.has_role(auth.uid(), 'administrativo'::app_role)
      OR public.is_master(auth.uid())
      OR EXISTS (
        SELECT 1
          FROM public.approval_request_steps ars
          JOIN public.approval_requests ar ON ar.id = ars.approval_request_id
         WHERE ars.flow_step_id = p_step_id
           AND (
             ar.requester_user_id = auth.uid()
             OR ars.approver_user_id = auth.uid()
             OR ars.primary_user_id = auth.uid()
             OR ars.substitute_user_id = auth.uid()
           )
      )
      OR EXISTS (
        SELECT 1
          FROM public.approval_flow_steps afs
         WHERE afs.id = p_step_id
           AND (
             afs.approver_user_id = auth.uid()
             OR afs.substitute_user_id = auth.uid()
             OR EXISTS (
               SELECT 1 FROM public.sectors s
                WHERE s.id = afs.fixed_sector_id
                  AND (s.responsible_user_id = auth.uid()
                       OR s.substitute_user_id = auth.uid())
             )
           )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.can_view_approval_flow_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_approval_flow_step(uuid) TO authenticated;
