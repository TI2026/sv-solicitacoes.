-- Drop the self-referencing policy that causes infinite recursion
DROP POLICY IF EXISTS "Step approvers can view sibling steps" ON public.approval_request_steps;

-- Create a security definer function to check participation
CREATE OR REPLACE FUNCTION public.user_participates_in_approval(p_approval_request_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_request_steps
    WHERE approval_request_id = p_approval_request_id
      AND approver_user_id = p_user_id
  )
$$;

-- Re-create the policy using the safe function
CREATE POLICY "Step approvers can view sibling steps"
  ON public.approval_request_steps
  FOR SELECT
  TO authenticated
  USING (
    public.user_participates_in_approval(approval_request_id, auth.uid())
  );