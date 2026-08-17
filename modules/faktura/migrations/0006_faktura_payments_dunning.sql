-- Faktura module - Phase 2: manual payment tracking and dunning letters.

-- Unlike faktura_documents, payments are plain bookkeeping notes, not
-- legal documents - no issue/immutability gate, correctable via delete,
-- traceability comes from faktura_audit_log instead.
CREATE TABLE faktura_payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'cash', 'direct_debit', 'other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_payments_invoice_id ON faktura_payments(invoice_id);
CREATE INDEX idx_faktura_payments_workspace_id ON faktura_payments(workspace_id);

-- Dunning letters are their own entity, not a faktura_documents type: they
-- carry no tax-relevant line items, just a reference to the overdue
-- invoice plus a fee/interest snapshot - a lighter-weight numbering scheme
-- (see services/dunning.ts) reuses faktura_number_sequences with
-- document_type='dunning' (that column is plain TEXT, no CHECK constraint
-- tying it to the four sales-document types).
CREATE TABLE faktura_dunning_letters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  -- NULL until sent - allocated together with status='sent' in one step
  -- (services/dunning.ts::sendDunningLetter), same gapless-numbering
  -- reasoning as faktura_documents.number.
  number TEXT,
  open_amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  interest_cents INTEGER NOT NULL,
  total_due_cents INTEGER NOT NULL,
  days_overdue INTEGER NOT NULL,
  issue_date TEXT,
  pdf_storage_path TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX idx_faktura_dunning_letters_invoice_id ON faktura_dunning_letters(invoice_id);
CREATE INDEX idx_faktura_dunning_letters_workspace_id ON faktura_dunning_letters(workspace_id);
