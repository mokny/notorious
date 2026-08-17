-- Faktura module - Phase 3: chart of accounts (Kontenrahmen).
ALTER TABLE faktura_company_settings ADD COLUMN chart_of_accounts TEXT NOT NULL DEFAULT 'skr04';

CREATE TABLE faktura_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('revenue', 'expense', 'asset', 'liability', 'equity')),
  -- 1 = part of the seedable default chart (see services/accounts.ts's SKR03_SEED/SKR04_SEED),
  -- 0 = added by the user - informational only, no write restriction either way.
  is_system INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_faktura_accounts_workspace_code ON faktura_accounts(workspace_id, code);
