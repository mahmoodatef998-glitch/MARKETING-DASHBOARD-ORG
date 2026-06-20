-- Agent Notifications: persistent notifications written by the AI agent
-- Apply in Supabase Dashboard → SQL Editor, or via: supabase db push

CREATE TABLE IF NOT EXISTS agent_notifications (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info',   -- info | warning | urgent | action_required
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_user_unread
  ON agent_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Users read only their own notifications; service role bypasses RLS
ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_agent_notifications"
  ON agent_notifications FOR SELECT
  USING (auth.uid() = user_id);
