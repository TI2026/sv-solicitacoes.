-- Requester must always be able to read his own fleet requests.
-- Previously the only SELECT policy relied on entity_action_context_can_read(),
-- which cannot see the row being inserted in the same statement, so
-- INSERT ... RETURNING failed with a 42501 RLS error.
CREATE POLICY "Requester can view own fuel requests"
ON public.fuel_requests
FOR SELECT
TO authenticated
USING (requester_user_id = auth.uid());

CREATE POLICY "Requester can view own fuel attachments"
ON public.fuel_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.fuel_requests fr
    WHERE fr.id = fuel_attachments.fuel_request_id
      AND fr.requester_user_id = auth.uid()
  )
);

DELETE FROM public.fuel_requests WHERE notes = 'teste rls diagnostico';