-- Vermieter module - tenants (Mieter), leases (Mietverträge), the lease<->
-- tenant join (WG/couples), rent-change history (Mieterhöhungen) and
-- rent-payment tracking (Zahlungseingänge).
CREATE TABLE vermieter_tenants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_tenants_workspace_id ON vermieter_tenants(workspace_id);

CREATE TABLE vermieter_leases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  cold_rent_cents INTEGER NOT NULL,
  nk_prepayment_cents INTEGER NOT NULL,
  deposit_cents INTEGER,
  deposit_paid_date TEXT,
  deposit_returned_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_leases_workspace_id ON vermieter_leases(workspace_id);
CREATE INDEX idx_vermieter_leases_unit_id ON vermieter_leases(unit_id);

-- N:M - a lease can have several tenants (WG/couple), a tenant can (over
-- time) be party to several leases.
CREATE TABLE vermieter_lease_tenants (
  lease_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  PRIMARY KEY (lease_id, tenant_id)
);

CREATE INDEX idx_vermieter_lease_tenants_tenant_id ON vermieter_lease_tenants(tenant_id);

-- One row per rent change (Mieterhöhung); the lease's own cold_rent_cents/
-- nk_prepayment_cents always reflects the latest entry here - see
-- services/leases.ts::changeLeaseRent(), which writes both atomically.
-- Historical amounts for a given date come from here, never from diffing
-- the lease row over time.
CREATE TABLE vermieter_rent_changes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  cold_rent_cents INTEGER NOT NULL,
  nk_prepayment_cents INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_rent_changes_lease_id ON vermieter_rent_changes(lease_id, effective_date);

CREATE TABLE vermieter_rent_payments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  cold_rent_due_cents INTEGER NOT NULL,
  nk_prepayment_due_cents INTEGER NOT NULL,
  paid_amount_cents INTEGER,
  paid_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'partial', 'paid')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_rent_payments_workspace_id ON vermieter_rent_payments(workspace_id);
CREATE INDEX idx_vermieter_rent_payments_lease_id ON vermieter_rent_payments(lease_id, period_year, period_month);
