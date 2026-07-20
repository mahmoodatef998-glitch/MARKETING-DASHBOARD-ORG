-- Manual income entries (non-invoice cash in)
CREATE TABLE IF NOT EXISTS public.income_entries (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text          NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  category    text          CHECK (category IN ('services','refund','grant','investment','other')),
  date        date          NOT NULL DEFAULT CURRENT_DATE,
  notes       text,
  client_id   uuid          REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_income_entries_date ON public.income_entries(date DESC);

ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.income_entries;
CREATE POLICY "auth_all" ON public.income_entries FOR ALL USING (auth.role() = 'authenticated');
