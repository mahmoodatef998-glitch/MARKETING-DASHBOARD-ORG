-- Enable RLS on expenses and financial_settings tables
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.expenses FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.financial_settings FOR ALL USING (auth.role() = 'authenticated');
