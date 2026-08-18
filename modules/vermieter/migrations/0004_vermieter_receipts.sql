-- Vermieter module - cost receipts (Belege). `cost_category_key` references
-- the fixed in-code category list (db/costCategories.ts), not a DB table.
-- `allocation_key_override`/`target_unit_id` let one receipt bypass its
-- category's default allocation key (see services/statementCalculation.ts's
-- 'fixed_manual' handling).
CREATE TABLE vermieter_receipts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  cost_category_key TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  receipt_date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allocation_key_override TEXT CHECK (allocation_key_override IN ('sqm', 'persons', 'units', 'consumption', 'fixed_manual')),
  target_unit_id TEXT,
  storage_path TEXT,
  ocr_raw_text TEXT,
  tax_deductible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_receipts_workspace_id ON vermieter_receipts(workspace_id);
CREATE INDEX idx_vermieter_receipts_property_id ON vermieter_receipts(property_id, receipt_date);
