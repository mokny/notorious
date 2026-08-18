-- Vermieter module - Instandhaltungsrücklage (maintenance reserve) ledger.
CREATE TABLE vermieter_reserve_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_reserve_transactions_workspace_id ON vermieter_reserve_transactions(workspace_id);
CREATE INDEX idx_vermieter_reserve_transactions_property_id ON vermieter_reserve_transactions(property_id, date);
