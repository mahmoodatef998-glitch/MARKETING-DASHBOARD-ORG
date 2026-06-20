-- Agent Memory: persistent key-value store for AI agent context across sessions
-- Apply in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS agent_memory (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
