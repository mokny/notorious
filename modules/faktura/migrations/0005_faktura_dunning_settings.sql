-- Faktura module - Phase 2: dunning (Mahnwesen) configuration on the
-- existing per-workspace company settings singleton.
ALTER TABLE faktura_company_settings ADD COLUMN dunning_number_prefix TEXT NOT NULL DEFAULT 'MA';
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_1_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_2_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_3_days INTEGER NOT NULL DEFAULT 28;
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_1_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_2_fee_cents INTEGER NOT NULL DEFAULT 500;
ALTER TABLE faktura_company_settings ADD COLUMN dunning_level_3_fee_cents INTEGER NOT NULL DEFAULT 1000;
-- Percent, e.g. 9.89 - the current statutory B2B default-interest rate
-- (Basiszinssatz + 9 percentage points per §288 BGB) is not tracked
-- automatically (it changes twice a year and would need an external data
-- source); this is a plain operator-maintained value.
ALTER TABLE faktura_company_settings ADD COLUMN dunning_interest_rate_percent REAL NOT NULL DEFAULT 9.89;
