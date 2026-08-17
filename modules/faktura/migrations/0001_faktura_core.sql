-- Faktura module - core master data (company settings, customers, suppliers).
-- Deliberately no FK against core `workspaces`/`users`: module migrations run
-- independently of core ones (tracked in `module_migrations`, see
-- packages/server/src/db/migrate.ts), so a strict FK here would depend on
-- ordering guarantees the module system doesn't make.

-- One row per workspace (the Faktura "Mandant"). Enforced as a singleton by
-- the service layer (upsert on workspace_id), not by a UNIQUE constraint
-- alone, so an empty-state read never has to special-case "no row yet".
CREATE TABLE faktura_company_settings (
  workspace_id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  tax_number TEXT NOT NULL DEFAULT '',
  vat_id TEXT NOT NULL DEFAULT '',
  is_kleinunternehmer INTEGER NOT NULL DEFAULT 0,
  bank_name TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT '',
  logo_storage_path TEXT,
  default_payment_terms_days INTEGER NOT NULL DEFAULT 14,
  quote_number_prefix TEXT NOT NULL DEFAULT 'AN',
  order_number_prefix TEXT NOT NULL DEFAULT 'AB',
  invoice_number_prefix TEXT NOT NULL DEFAULT 'RE',
  credit_note_number_prefix TEXT NOT NULL DEFAULT 'GS',
  updated_at TEXT NOT NULL
);

CREATE TABLE faktura_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('company', 'person')),
  display_name TEXT NOT NULL,
  -- Derived from country + vat_id + B2B-ness at data-entry time, but stored
  -- explicitly rather than recomputed per-document: a later edit to a
  -- customer's country/VAT-ID must never silently change the tax treatment
  -- of a document already issued against a snapshot of this value.
  tax_treatment TEXT NOT NULL DEFAULT 'standard' CHECK (tax_treatment IN ('standard', 'reverse_charge')),
  vat_id TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  default_payment_terms_days INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_faktura_customers_workspace_id ON faktura_customers(workspace_id);

CREATE TABLE faktura_customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_customer_contacts_customer_id ON faktura_customer_contacts(customer_id);

CREATE TABLE faktura_customer_addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('billing', 'shipping')),
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_customer_addresses_customer_id ON faktura_customer_addresses(customer_id);

CREATE TABLE faktura_suppliers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'DE',
  vat_id TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_faktura_suppliers_workspace_id ON faktura_suppliers(workspace_id);
