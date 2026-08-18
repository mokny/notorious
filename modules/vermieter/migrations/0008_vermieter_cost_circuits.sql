-- Vermieter module - Abrechnungskreise (cost circuits). A property's costs
-- don't always apply uniformly across all its units (e.g. some units have
-- their own electric Durchlauferhitzer and never draw on the shared
-- Zentralheizung/Warmwasser costs at all) - a cost circuit groups the subset
-- of a property's units that actually share a given cost pool. Every
-- property always has exactly one `is_default = 1` circuit ("Gesamtes
-- Objekt") containing all of its units; additional circuits are opt-in. See
-- services/costCircuits.ts and the re-scoped statement-calculation engine
-- (services/statementCalculation.ts) for how these are consumed.
--
-- No FK constraints against vermieter_properties/vermieter_units - same
-- module convention as every other table here (see migrations/0001's doc
-- comment): module migrations run independently of each other's ordering
-- guarantees and SQLite FKs would only add friction, not safety, in a
-- single-process embedded-SQLite deployment.
CREATE TABLE vermieter_cost_circuits (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_cost_circuits_workspace_property ON vermieter_cost_circuits(workspace_id, property_id);

-- N:M membership - which units participate in which circuit. The default
-- circuit's membership is kept auto-synced with a property's unit list by
-- application code (services/properties.ts::createProperty,
-- services/units.ts::createUnit) rather than by a trigger, so it stays easy
-- to reason about from services/costCircuits.ts alone.
CREATE TABLE vermieter_cost_circuit_units (
  circuit_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  PRIMARY KEY (circuit_id, unit_id)
);

CREATE INDEX idx_vermieter_cost_circuit_units_unit_id ON vermieter_cost_circuit_units(unit_id);

-- Which circuit a receipt's cost pool belongs to. Nullable at the column
-- level (existing rows are backfilled below; new rows are always given an
-- explicit value by services/receipts.ts, defaulting to the property's
-- default circuit when the caller doesn't specify one) - see that service's
-- doc comment.
ALTER TABLE vermieter_receipts ADD COLUMN cost_circuit_id TEXT;

-- Backfill: every existing property (this module already has real test data
-- in the dev DB from earlier sessions) gets a default circuit containing all
-- of its existing units, and every existing receipt is pointed at its
-- property's default circuit.
INSERT INTO vermieter_cost_circuits (id, workspace_id, property_id, name, is_default, created_at, updated_at)
SELECT lower(hex(randomblob(16))), p.workspace_id, p.id, 'Gesamtes Objekt', 1, datetime('now'), datetime('now')
FROM vermieter_properties p
WHERE NOT EXISTS (
  SELECT 1 FROM vermieter_cost_circuits c WHERE c.property_id = p.id AND c.is_default = 1
);

INSERT INTO vermieter_cost_circuit_units (circuit_id, unit_id)
SELECT c.id, u.id
FROM vermieter_units u
JOIN vermieter_cost_circuits c ON c.property_id = u.property_id AND c.is_default = 1
WHERE NOT EXISTS (
  SELECT 1 FROM vermieter_cost_circuit_units cu WHERE cu.circuit_id = c.id AND cu.unit_id = u.id
);

UPDATE vermieter_receipts
SET cost_circuit_id = (
  SELECT c.id FROM vermieter_cost_circuits c WHERE c.property_id = vermieter_receipts.property_id AND c.is_default = 1
)
WHERE cost_circuit_id IS NULL;
