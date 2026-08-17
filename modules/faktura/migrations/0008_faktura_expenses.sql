-- Faktura module - Phase 3: manual expense entries (Ausgaben).
-- Receipt photos use the existing faktura_attachments table with
-- entity_type='expense' - widen its CHECK constraint to allow that value.
-- SQLite can't alter a CHECK constraint in place, so recreate the table.
CREATE TABLE faktura_attachments_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'order', 'expense')),
  entity_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO faktura_attachments_new SELECT * FROM faktura_attachments;
DROP TABLE faktura_attachments;
ALTER TABLE faktura_attachments_new RENAME TO faktura_attachments;
CREATE INDEX idx_faktura_attachments_entity ON faktura_attachments(entity_type, entity_id);

CREATE TABLE faktura_expenses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  supplier_id TEXT,
  expense_account_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 1900 CHECK (tax_rate_basis_points IN (0, 700, 1900)),
  expense_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cash', 'direct_debit', 'other', 'open')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_expenses_workspace_id ON faktura_expenses(workspace_id);
CREATE INDEX idx_faktura_expenses_supplier_id ON faktura_expenses(supplier_id);
