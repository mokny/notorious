-- Faktura module - Phase 3: point-of-sale (Kassensystem) for on-site touch
-- checkout (e.g. a tablet at a market stand). NOT KassenSichV-compliant as
-- shipped - the tse_signature/tse_transaction_number columns are unused
-- placeholders for a later real TSE (Technische Sicherheitseinrichtung)
-- integration; do not use this for real, audit-relevant cash sales without
-- one. See the phase plan's "Kassensystem (POS)" section.

ALTER TABLE faktura_products ADD COLUMN pos_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE faktura_products ADD COLUMN pos_category TEXT NOT NULL DEFAULT '';

ALTER TABLE faktura_company_settings ADD COLUMN pos_receipt_number_prefix TEXT NOT NULL DEFAULT 'BON';

-- Widen faktura_documents.type to include 'pos_receipt' and add POS-related
-- columns. SQLite can't alter a CHECK constraint in place, so recreate the
-- table (same technique as migrations/0008 for faktura_attachments).
CREATE TABLE faktura_documents_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('quote', 'order', 'invoice', 'credit_note', 'pos_receipt')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  number TEXT,
  customer_id TEXT NOT NULL,
  source_document_id TEXT,
  billing_street TEXT NOT NULL DEFAULT '',
  billing_postal_code TEXT NOT NULL DEFAULT '',
  billing_city TEXT NOT NULL DEFAULT '',
  billing_country TEXT NOT NULL DEFAULT '',
  shipping_street TEXT NOT NULL DEFAULT '',
  shipping_postal_code TEXT NOT NULL DEFAULT '',
  shipping_city TEXT NOT NULL DEFAULT '',
  shipping_country TEXT NOT NULL DEFAULT '',
  issue_date TEXT,
  due_date TEXT,
  tax_treatment TEXT NOT NULL DEFAULT 'standard' CHECK (tax_treatment IN ('standard', 'reverse_charge')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_total_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  legal_disclaimer_text TEXT NOT NULL DEFAULT '',
  pdf_storage_path TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  issued_at TEXT,
  pos_shift_id TEXT,
  tse_signature TEXT,
  tse_transaction_number TEXT
);
INSERT INTO faktura_documents_new (
  id, workspace_id, type, status, number, customer_id, source_document_id,
  billing_street, billing_postal_code, billing_city, billing_country,
  shipping_street, shipping_postal_code, shipping_city, shipping_country,
  issue_date, due_date, tax_treatment, currency, subtotal_cents, tax_total_cents, total_cents,
  notes, legal_disclaimer_text, pdf_storage_path, created_by, created_at, updated_at, issued_at
)
SELECT
  id, workspace_id, type, status, number, customer_id, source_document_id,
  billing_street, billing_postal_code, billing_city, billing_country,
  shipping_street, shipping_postal_code, shipping_city, shipping_country,
  issue_date, due_date, tax_treatment, currency, subtotal_cents, tax_total_cents, total_cents,
  notes, legal_disclaimer_text, pdf_storage_path, created_by, created_at, updated_at, issued_at
FROM faktura_documents;
DROP TABLE faktura_documents;
ALTER TABLE faktura_documents_new RENAME TO faktura_documents;

CREATE INDEX idx_faktura_documents_workspace_id ON faktura_documents(workspace_id);
CREATE INDEX idx_faktura_documents_customer_id ON faktura_documents(customer_id);
CREATE INDEX idx_faktura_documents_source_document_id ON faktura_documents(source_document_id);
CREATE INDEX idx_faktura_documents_workspace_type ON faktura_documents(workspace_id, type);
CREATE INDEX idx_faktura_documents_pos_shift_id ON faktura_documents(pos_shift_id);

CREATE TABLE faktura_pos_shifts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by TEXT,
  closed_at TEXT,
  counted_cash_cents INTEGER,
  expected_cash_cents INTEGER,
  difference_cents INTEGER
);

CREATE INDEX idx_faktura_pos_shifts_workspace_id ON faktura_pos_shifts(workspace_id, status);
