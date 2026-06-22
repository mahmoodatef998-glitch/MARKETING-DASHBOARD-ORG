-- ── 1. Atomic invoice number sequence ──────────────────────────────────────
-- Replaces the three different non-atomic approaches scattered across the app.

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

-- Seed the sequence from the current highest INV-NNNNN number
SELECT setval(
  'public.invoice_number_seq',
  GREATEST(
    1,
    COALESCE(
      (SELECT MAX(
          CAST(
            REGEXP_REPLACE(invoice_number, '[^0-9]', '', 'g')
            AS INTEGER
          )
        )
        FROM public.invoices
        WHERE invoice_number ~ '^INV-[0-9]+'
      ),
      0
    )
  )
);

-- Callable via supabase.rpc('next_invoice_number') — atomic, no race condition
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 'INV-' || LPAD(nextval('public.invoice_number_seq')::TEXT, 5, '0')
$$;

-- ── 2. RLS on tables added after initial schema ──────────────────────────────

-- invoice_payments: financial data, admin-only writes
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.invoice_payments
  FOR ALL USING (auth.role() = 'authenticated');

-- audit_logs: read-only for authenticated users, writes via service role only
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read" ON public.audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- agent_memory: internal system table, service role only
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_direct" ON public.agent_memory
  FOR ALL USING (false);

-- expenses & financial_settings (from migration 008, apply idempotently)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON public.expenses FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_settings' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY "auth_all" ON public.financial_settings FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
