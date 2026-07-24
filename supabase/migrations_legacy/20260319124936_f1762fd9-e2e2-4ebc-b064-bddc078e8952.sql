
-- Make approver_user_id nullable for dynamic approver types
ALTER TABLE public.approval_flow_steps ALTER COLUMN approver_user_id DROP NOT NULL;

-- Add return_mode to approval_flows for Devolver action
ALTER TABLE public.approval_flows ADD COLUMN IF NOT EXISTS return_mode text DEFAULT 'requester';
