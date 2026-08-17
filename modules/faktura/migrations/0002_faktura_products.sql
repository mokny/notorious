-- Faktura module - products/services and pricing.
CREATE TABLE faktura_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'hour', 'day', 'flat', 'kg', 'custom')),
  unit_label TEXT NOT NULL DEFAULT '',
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  -- Tax rate in basis points (0 / 700 / 1900) - the rate a document line
  -- inherits by default; actual effective rate at issue time may be
  -- overridden to 0 by the issuing company's Kleinunternehmer flag or the
  -- customer's reverse-charge treatment (see faktura_document_lines).
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 1900 CHECK (tax_rate_basis_points IN (0, 700, 1900)),
  sku TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_faktura_products_workspace_id ON faktura_products(workspace_id);

CREATE TABLE faktura_product_price_tiers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  min_quantity INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_product_price_tiers_product_id ON faktura_product_price_tiers(product_id);

CREATE TABLE faktura_customer_product_prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_customer_product_prices_product_id ON faktura_customer_product_prices(product_id);
CREATE INDEX idx_faktura_customer_product_prices_customer_id ON faktura_customer_product_prices(customer_id);

-- Append-only price change log, shared by default-price changes
-- (customer_id NULL) and customer-specific override changes (customer_id
-- set) - "a price changed" is one concept regardless of scope.
CREATE TABLE faktura_price_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  customer_id TEXT,
  price_cents INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_price_history_product_id ON faktura_price_history(product_id);
