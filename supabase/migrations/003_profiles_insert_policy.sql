-- Allow users to insert their own profile row (required for first-time login)
-- Without this policy, RLS blocks the INSERT and team members get no profile on signup.
-- Note: the API already uses admin client for INSERT, but this policy provides
-- an extra safety layer for any direct client-side inserts.

CREATE POLICY IF NOT EXISTS "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());
