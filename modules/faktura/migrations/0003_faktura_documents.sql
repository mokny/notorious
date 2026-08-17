-- Faktura module - the sales document chain (quote/order/invoice/credit_note).
-- One shared table across all four types (see modules/faktura's design plan):
-- they share ~90% of columns and the conversion chain is a self-reference
-- (source_document_id), so numbering/PDF-rendering/issuing logic stays one
-- code path keyed on `type` instead of four near-duplicate tables.
CREATE TABLE faktura_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('quote', 'order', 'invoice', 'credit_note')),
  -- draft: fully editable. issued: number assigned, immutable (GoBD).
  -- cancelled: an issued document voided without deleting it.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
  -- NULL until issued - numbers are allocated at issue time, not creation
  -- time, to keep the per-type/per-year sequence gapless (see
  -- faktura_number_sequences).
  number TEXT,
  customer_id TEXT NOT NULL,
  -- Points at the quote an order was created from, or the invoice a credit
  -- note corrects, or the order an invoice was generated from.
  source_document_id TEXT,
  -- Billing/shipping address copied from faktura_customer_addresses at
  -- issue time (or at creation for a draft, refreshed until issued) rather
  -- than live-joined, so a later customer address edit never rewrites a
  -- legally issued document.
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
  -- Snapshot of the customer's tax_treatment at issue time (see
  -- faktura_customers.tax_treatment comment - same immutability reasoning).
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
  issued_at TEXT
);

CREATE INDEX idx_faktura_documents_workspace_id ON faktura_documents(workspace_id);
CREATE INDEX idx_faktura_documents_customer_id ON faktura_documents(customer_id);
CREATE INDEX idx_faktura_documents_source_document_id ON faktura_documents(source_document_id);
CREATE INDEX idx_faktura_documents_workspace_type ON faktura_documents(workspace_id, type);

CREATE TABLE faktura_document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  product_id TEXT,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  -- Per-line, not per-document: mixed rates on one document are legal and
  -- common (e.g. a 19% consulting line plus a 7% printed-materials line),
  -- and this is also the field the required per-rate breakdown groups by.
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 1900 CHECK (tax_rate_basis_points IN (0, 700, 1900)),
  line_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  line_tax_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_faktura_document_lines_document_id ON faktura_document_lines(document_id);

-- One row per tax rate present on a document, computed and stored at
-- save/issue time (not recomputed from lines on every read) so an issued
-- document's totals/PDF stay byte-reproducible even if product tax rates
-- change later. Also the exact shape XRechnung's mandatory per-rate
-- breakdown needs (Phase 4).
CREATE TABLE faktura_document_tax_breakdown (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  tax_rate_basis_points INTEGER NOT NULL,
  net_total_cents INTEGER NOT NULL,
  tax_total_cents INTEGER NOT NULL
);

CREATE INDEX idx_faktura_document_tax_breakdown_document_id ON faktura_document_tax_breakdown(document_id);

-- Per workspace/type/year counter. Incremented transactionally together
-- with a document's status -> issued transition (see services/numbering.ts)
-- to guarantee gapless numbering under concurrent issue attempts.
CREATE TABLE faktura_number_sequences (
  workspace_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, document_type, year)
);
