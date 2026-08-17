-- Faktura module - Phase 3: booking entries (Buchungssätze / journal).
-- `proposed` rows are plain suggestions (deletable); once `confirmed` a
-- booking is immutable (GoBD) - correction only via a reversal booking
-- (see services/bookings.ts::createReversalBooking), which flips the
-- original to `reversed` but never deletes it.
CREATE TABLE faktura_bookings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  booking_date TEXT NOT NULL,
  debit_account_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  tax_rate_basis_points INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'reversed')),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('invoice', 'credit_note', 'payment', 'expense')),
  source_entity_id TEXT NOT NULL,
  reverses_booking_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT
);

CREATE INDEX idx_faktura_bookings_workspace_id ON faktura_bookings(workspace_id);
CREATE INDEX idx_faktura_bookings_status ON faktura_bookings(workspace_id, status);
CREATE INDEX idx_faktura_bookings_source ON faktura_bookings(source_entity_type, source_entity_id);
