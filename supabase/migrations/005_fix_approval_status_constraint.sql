-- Drop and recreate the approval_status CHECK constraint to include 'none'
-- The original constraint may have been created without 'none', causing import failures

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_approval_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_approval_status_check
  CHECK (approval_status IN ('none', 'pending', 'client_approved', 'admin_approved', 'revision_requested'));

-- Ensure the column has the correct default
ALTER TABLE public.tasks
  ALTER COLUMN approval_status SET DEFAULT 'none';
