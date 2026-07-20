-- Link partners to users + mark payouts as partner draws vs team salary
ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS partner1_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner2_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner3_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.team_payouts
  ADD COLUMN IF NOT EXISTS payout_type text NOT NULL DEFAULT 'team_salary'
  CHECK (payout_type IN ('team_salary', 'partner_draw'));

CREATE INDEX IF NOT EXISTS idx_team_payouts_type ON public.team_payouts(payout_type);
CREATE INDEX IF NOT EXISTS idx_team_payouts_member_type ON public.team_payouts(member_id, payout_type);
