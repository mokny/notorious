-- Vermieter module - external metering-service billing (Techem, ista, Minol,
-- ...): many landlords don't read their own heating/water meters at all - a
-- metering service visits annually and delivers a finished per-unit cost
-- breakdown (including its own HeizkostenV 70/30 split and mid-year-tenant-
-- change proration). Opting a (cost circuit, cost category) pair into
-- 'external_provider' billing mode makes the statement engine skip its own
-- allocation-key math for that pool entirely and use the landlord's
-- transcribed per-unit amounts below instead - see
-- services/statementCalculation.ts and services/externalBilling.ts.
--
-- No FK constraints against vermieter_cost_circuits/vermieter_units - same
-- module convention as every other table here (see migrations/0001's doc
-- comment).

-- One row per (circuit, category) that has been explicitly opted into
-- external billing - absence of a row means the default, 'calculated' mode
-- (today's existing allocation-key behavior, unaffected).
CREATE TABLE vermieter_circuit_category_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  cost_circuit_id TEXT NOT NULL,
  cost_category_key TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'calculated' CHECK (billing_mode IN ('calculated', 'external_provider')),
  provider_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_vermieter_circuit_category_settings_unique ON vermieter_circuit_category_settings(cost_circuit_id, cost_category_key);
CREATE INDEX idx_vermieter_circuit_category_settings_workspace_id ON vermieter_circuit_category_settings(workspace_id);

-- Landlord-transcribed per-unit amounts from a provider's own finished
-- statement, for one (circuit, category) pool and a specific provider
-- period. A statement's own period is typically an exact match, but can
-- partially overlap (e.g. a mid-year provider read cycle) - see
-- services/statementCalculation.ts's day-overlap proration.
CREATE TABLE vermieter_external_cost_allocations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  cost_circuit_id TEXT NOT NULL,
  cost_category_key TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  provider_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_external_cost_allocations_lookup ON vermieter_external_cost_allocations(cost_circuit_id, cost_category_key, unit_id);
CREATE INDEX idx_vermieter_external_cost_allocations_workspace_id ON vermieter_external_cost_allocations(workspace_id);
