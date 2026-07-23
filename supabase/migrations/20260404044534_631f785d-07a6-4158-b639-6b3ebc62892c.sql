-- Allow requesters to see steps of their own approval requests
CREATE POLICY "Requester can view own request steps"
  ON public.approval_request_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = approval_request_steps.approval_request_id
        AND ar.requester_user_id = auth.uid()
    )
  );

-- Also allow any step approver to see all steps in requests they participate in
CREATE POLICY "Step approvers can view sibling steps"
  ON public.approval_request_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_request_steps sibling
      WHERE sibling.approval_request_id = approval_request_steps.approval_request_id
        AND sibling.approver_user_id = auth.uid()
    )
  );