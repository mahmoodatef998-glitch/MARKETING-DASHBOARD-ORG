-- Change default currency from USD to AED for billing_plans and campaigns
ALTER TABLE billing_plans ALTER COLUMN currency SET DEFAULT 'AED';
ALTER TABLE campaigns     ALTER COLUMN currency SET DEFAULT 'AED';
