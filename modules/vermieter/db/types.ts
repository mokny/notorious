/** Row shapes for modules/vermieter's own SQLite tables (see ../migrations). */

export interface VermieterPropertyRow {
  id: string;
  workspace_id: string;
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  purchase_date: string | null;
  purchase_price_cents: number | null;
  building_year: number | null;
  land_value_cents: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface VermieterUnitRow {
  id: string;
  workspace_id: string;
  property_id: string;
  label: string;
  floor: string;
  size_sqm: number;
  rooms: number | null;
  heating_type: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type VermieterMeterType = "heating" | "cold_water" | "hot_water" | "electricity" | "other";

export interface VermieterMeterRow {
  id: string;
  workspace_id: string;
  unit_id: string;
  type: VermieterMeterType;
  label: string;
  unit_of_measure: string;
  created_at: string;
  updated_at: string;
}

export interface VermieterMeterReadingRow {
  id: string;
  workspace_id: string;
  meter_id: string;
  reading_date: string;
  value: number;
  note: string;
  created_at: string;
}

export interface VermieterTenantRow {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type VermieterLeaseStatus = "active" | "ended";

export interface VermieterLeaseRow {
  id: string;
  workspace_id: string;
  unit_id: string;
  start_date: string;
  end_date: string | null;
  cold_rent_cents: number;
  nk_prepayment_cents: number;
  deposit_cents: number | null;
  deposit_paid_date: string | null;
  deposit_returned_date: string | null;
  status: VermieterLeaseStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface VermieterLeaseTenantRow {
  lease_id: string;
  tenant_id: string;
}

export interface VermieterRentChangeRow {
  id: string;
  workspace_id: string;
  lease_id: string;
  effective_date: string;
  cold_rent_cents: number;
  nk_prepayment_cents: number;
  note: string;
  created_at: string;
}

export type VermieterRentPaymentStatus = "open" | "partial" | "paid";

export interface VermieterRentPaymentRow {
  id: string;
  workspace_id: string;
  lease_id: string;
  period_year: number;
  period_month: number;
  cold_rent_due_cents: number;
  nk_prepayment_due_cents: number;
  paid_amount_cents: number | null;
  paid_date: string | null;
  status: VermieterRentPaymentStatus;
  note: string;
  created_at: string;
  updated_at: string;
}

export type VermieterAllocationKey = "sqm" | "persons" | "units" | "consumption" | "fixed_manual";

export interface VermieterReceiptRow {
  id: string;
  workspace_id: string;
  property_id: string;
  cost_category_key: string;
  vendor: string;
  amount_cents: number;
  receipt_date: string;
  description: string;
  allocation_key_override: VermieterAllocationKey | null;
  target_unit_id: string | null;
  storage_path: string | null;
  ocr_raw_text: string | null;
  tax_deductible: 0 | 1;
  created_at: string;
  updated_at: string;
}

export type VermieterStatementStatus = "draft" | "final";

export interface VermieterStatementRow {
  id: string;
  workspace_id: string;
  property_id: string;
  period_start: string;
  period_end: string;
  status: VermieterStatementStatus;
  heating_consumption_share_percent: number;
  pdf_storage_path: string | null;
  created_by: string;
  created_at: string;
  finalized_at: string | null;
}

export interface VermieterStatementLineRow {
  id: string;
  statement_id: string;
  unit_id: string;
  lease_id: string | null;
  cost_category_key: string;
  allocation_key_used: VermieterAllocationKey;
  total_property_cost_cents: number;
  unit_share_cents: number;
  vacancy_share_cents: number;
  days_occupied: number;
  days_total: number;
  created_at: string;
}

export interface VermieterStatementTenantSummaryRow {
  id: string;
  statement_id: string;
  unit_id: string;
  lease_id: string;
  segment_start: string;
  segment_end: string;
  total_allocated_cost_cents: number;
  total_prepayments_cents: number;
  balance_cents: number;
  created_at: string;
}

export interface VermieterReserveTransactionRow {
  id: string;
  workspace_id: string;
  property_id: string;
  date: string;
  amount_cents: number;
  note: string;
  created_at: string;
}

export interface VermieterLandlordProfileRow {
  workspace_id: string;
  name: string;
  street: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  iban: string;
  updated_at: string;
}
