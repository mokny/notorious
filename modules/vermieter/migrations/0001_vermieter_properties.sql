-- Vermieter module - properties (Immobilien) and units (Einheiten).
-- No FK against core `workspaces` - module migrations run independently of
-- core migration ordering (see modules/example/migrations/0001_example.sql).
CREATE TABLE vermieter_properties (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  house_number TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'DE',
  purchase_date TEXT,
  purchase_price_cents INTEGER,
  building_year INTEGER,
  land_value_cents INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_vermieter_properties_workspace_id ON vermieter_properties(workspace_id);

CREATE TABLE vermieter_units (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  label TEXT NOT NULL,
  floor TEXT NOT NULL DEFAULT '',
  size_sqm REAL NOT NULL,
  rooms REAL,
  heating_type TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_vermieter_units_workspace_id ON vermieter_units(workspace_id);
CREATE INDEX idx_vermieter_units_property_id ON vermieter_units(property_id);
