REVOKE EXECUTE ON FUNCTION public.status_history_normalize() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_requester_step_activated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_entity_delete_workflow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._engine_entity_table(text) FROM PUBLIC, anon;