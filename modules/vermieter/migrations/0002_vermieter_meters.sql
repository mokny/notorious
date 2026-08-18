-- Vermieter module - meters (Zähler) and their readings, per unit.
CREATE TABLE vermieter_meters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('heating', 'cold_water', 'hot_water', 'electricity', 'other')),
  label TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_meters_workspace_id ON vermieter_meters(workspace_id);
CREATE INDEX idx_vermieter_meters_unit_id ON vermieter_meters(unit_id);

CREATE TABLE vermieter_meter_readings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  meter_id TEXT NOT NULL,
  reading_date TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_meter_readings_workspace_id ON vermieter_meter_readings(workspace_id);
CREATE INDEX idx_vermieter_meter_readings_meter_id ON vermieter_meter_readings(meter_id, reading_date);
