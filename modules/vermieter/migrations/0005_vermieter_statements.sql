-- Vermieter module - Nebenkostenabrechnung runs. A statement is a point-in-
-- time legal document: its lines/tenant-summaries are a computed snapshot
-- written once at generation time, never recomputed live (see
-- services/statementCalculation.ts's doc comment).
CREATE TABLE vermieter_statements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'final')),
  heating_consumption_share_percent INTEGER NOT NULL DEFAULT 70,
  pdf_storage_path TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE INDEX idx_vermieter_statements_workspace_id ON vermieter_statements(workspace_id);
CREATE INDEX idx_vermieter_statements_property_id ON vermieter_statements(property_id);

CREATE TABLE vermieter_statement_lines (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  lease_id TEXT,
  cost_category_key TEXT NOT NULL,
  allocation_key_used TEXT NOT NULL,
  total_property_cost_cents INTEGER NOT NULL,
  unit_share_cents INTEGER NOT NULL,
  vacancy_share_cents INTEGER NOT NULL DEFAULT 0,
  days_occupied INTEGER NOT NULL,
  days_total INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_statement_lines_statement_id ON vermieter_statement_lines(statement_id);
CREATE INDEX idx_vermieter_statement_lines_unit_id ON vermieter_statement_lines(unit_id);

-- One row per unit per lease-segment covering (part of) the statement
-- period - a mid-period Mieterwechsel produces two rows for the same unit.
CREATE TABLE vermieter_statement_tenant_summaries (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  segment_start TEXT NOT NULL,
  segment_end TEXT NOT NULL,
  total_allocated_cost_cents INTEGER NOT NULL,
  total_prepayments_cents INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_statement_tenant_summaries_statement_id ON vermieter_statement_tenant_summaries(statement_id);
