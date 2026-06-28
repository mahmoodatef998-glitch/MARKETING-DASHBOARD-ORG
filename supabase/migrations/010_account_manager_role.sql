-- Add 'account_manager' to the role constraint on profiles
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role IN ('admin', 'media_buyer', 'account_manager', 'video_maker', 'designer', 'ai_video', 'client')
  );
