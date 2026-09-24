# MVP final alignment — technical design

## Acceptance criteria
- Responsible and substitute selectors remain usable within desktop and mobile viewport bounds.
- A saved step assignment becomes visible across open sessions without a page reload.
- Approve, reject, and return actions render only when Action Context says the signed-in user is the current actor.
- Operational batch actions stay attached to their content instead of following the entire page ambiguously.
- Re-entering a previously activated step creates one new requester notification for that activation, while duplicate processing of the same activation remains idempotent.
- Motor status reflects backend truth; no forced activation or frontend-derived workflow state.

## Frontend
Reuse Approval V2 configuration, global workflow Realtime, Action Context, queue, and shared controls. Bound long lists to the viewport, invalidate configuration and action caches on assignment changes, and remove any action surface not gated by current Action Context.

## Backend
Reuse save_approval_step_assignment, get_my_approval_queue, get_entity_action_context, and execute_entity_action. Add only an incremental notification-idempotency correction if database evidence confirms the defect.

## Security
Authorization remains server-side. The frontend only mirrors allowed_actions and is_current_actor. No service key, direct status update, template rewrite, destructive operation, or production activation is introduced.

## Verification
Run focused frontend tests, the existing test suite, database tests where available, and authenticated browser checks at desktop and mobile sizes. Any unavailable staging, multi-persona, backup/restore, or CI evidence remains UNVERIFIED and blocks GO.
