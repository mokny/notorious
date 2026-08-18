-- Vermieter module - per-workspace override of a cost category's default
-- allocation key (see db/costCategories.ts's VERMIETER_COST_CATEGORIES,
-- whose `defaultAllocationKey` is load-bearing: services/statementCalculation.ts
-- reads it for any receipt without an explicit `allocation_key_override`).
-- A landlord's specific building may want e.g. Müllabfuhr allocated 'persons'
-- instead of the built-in default - this table lets them override that
-- per (workspace, category) without touching the hardcoded constant, which
-- stays the fallback whenever no override row exists here.
--
-- 'external_provider' is deliberately NOT a valid value here - that's opted
-- into per (cost circuit, cost category) via vermieter_circuit_category_settings
-- (migrations/0012), not a category-level default.
--
-- No FK constraints - same module convention as every other table here (see
-- migrations/0001's doc comment).
CREATE TABLE vermieter_category_allocation_defaults (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  cost_category_key TEXT NOT NULL,
  allocation_key TEXT NOT NULL CHECK (allocation_key IN ('sqm', 'persons', 'units', 'consumption', 'fixed_manual')),
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_vermieter_category_allocation_defaults_unique ON vermieter_category_allocation_defaults(workspace_id, cost_category_key);
