-- Add hook field for reel_video and ai_video tasks
-- Stores the creative hook/angle for the content piece
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hook text;
