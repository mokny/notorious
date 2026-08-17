/** Row shapes for modules/faktura's own SQLite tables (see ../migrations). */

export interface FakturaCompanySettingsRow {
  workspace_id: string;
  legal_name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  tax_number: string;
  vat_id: string;
  is_kleinunternehmer: 0 | 1;
  bank_name: string;
  iban: string;
  bic: string;
  logo_storage_path: string | null;
  default_payment_terms_days: number;
  quote_number_prefix: string;
  order_number_prefix: string;
  invoice_number_prefix: string;
  credit_note_number_prefix: string;
  dunning_number_prefix: string;
  dunning_level_1_days: number;
  dunning_level_2_days: number;
  dunning_level_3_days: number;
  dunning_level_1_fee_cents: number;
  dunning_level_2_fee_cents: number;
  dunning_level_3_fee_cents: number;
  dunning_interest_rate_percent: number;
  chart_of_accounts: "skr03" | "skr04";
  pos_receipt_number_prefix: string;
  updated_at: string;
}

export type FakturaCustomerKind = "company" | "person";
export type FakturaTaxTreatment = "standard" | "reverse_charge";

export interface FakturaCustomerRow {
  id: string;
  workspace_id: string;
  kind: FakturaCustomerKind;
  display_name: string;
  tax_treatment: FakturaTaxTreatment;
  vat_id: string;
  country: string;
  default_payment_terms_days: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface FakturaCustomerContactRow {
  id: string;
  customer_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: 0 | 1;
  created_at: string;
}

export type FakturaAddressKind = "billing" | "shipping";

export interface FakturaCustomerAddressRow {
  id: string;
  customer_id: string;
  kind: FakturaAddressKind;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  is_default: 0 | 1;
  created_at: string;
}

export interface FakturaSupplierRow {
  id: string;
  workspace_id: string;
  name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  vat_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type FakturaProductUnit = "piece" | "hour" | "day" | "flat" | "kg" | "custom";
export type FakturaTaxRateBasisPoints = 0 | 700 | 1900;

export interface FakturaProductRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  unit: FakturaProductUnit;
  unit_label: string;
  base_price_cents: number;
  tax_rate_basis_points: FakturaTaxRateBasisPoints;
  sku: string;
  pos_enabled: 0 | 1;
  pos_category: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface FakturaProductPriceTierRow {
  id: string;
  product_id: string;
  min_quantity: number;
  price_cents: number;
  created_at: string;
}

export interface FakturaCustomerProductPriceRow {
  id: string;
  product_id: string;
  customer_id: string;
  price_cents: number;
  effective_from: string;
  created_at: string;
}

export interface FakturaPriceHistoryRow {
  id: string;
  product_id: string;
  customer_id: string | null;
  price_cents: number;
  effective_from: string;
  created_by: string;
  created_at: string;
}

export type FakturaDocumentType = "quote" | "order" | "invoice" | "credit_note" | "pos_receipt";
export type FakturaDocumentStatus = "draft" | "issued" | "cancelled";

export interface FakturaDocumentRow {
  id: string;
  workspace_id: string;
  type: FakturaDocumentType;
  status: FakturaDocumentStatus;
  number: string | null;
  customer_id: string;
  source_document_id: string | null;
  billing_street: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  shipping_street: string;
  shipping_postal_code: string;
  shipping_city: string;
  shipping_country: string;
  issue_date: string | null;
  due_date: string | null;
  tax_treatment: FakturaTaxTreatment;
  currency: string;
  subtotal_cents: number;
  tax_total_cents: number;
  total_cents: number;
  notes: string;
  legal_disclaimer_text: string;
  pdf_storage_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  issued_at: string | null;
  pos_shift_id: string | null;
  /** Unused placeholder for a future real TSE (Kassensicherungsverordnung) integration - see migrations/0010. */
  tse_signature: string | null;
  tse_transaction_number: string | null;
}

export interface FakturaDocumentLineRow {
  id: string;
  document_id: string;
  product_id: string | null;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  discount_percent: number;
  tax_rate_basis_points: FakturaTaxRateBasisPoints;
  line_subtotal_cents: number;
  line_tax_cents: number;
  line_total_cents: number;
}

export interface FakturaDocumentTaxBreakdownRow {
  id: string;
  document_id: string;
  tax_rate_basis_points: FakturaTaxRateBasisPoints;
  net_total_cents: number;
  tax_total_cents: number;
}

/** `document_type` also holds the literal `"dunning"` for the Mahnung numbering sequence (see services/dunning.ts) - the column itself has no CHECK constraint tying it to the four sales-document types. */
export interface FakturaNumberSequenceRow {
  workspace_id: string;
  document_type: FakturaDocumentType | "dunning";
  year: number;
  next_number: number;
}

export type FakturaAttachmentEntityType = "customer" | "order" | "expense";

export interface FakturaAttachmentRow {
  id: string;
  workspace_id: string;
  entity_type: FakturaAttachmentEntityType;
  entity_id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface FakturaAuditLogRow {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  summary: string;
  diff_json: string | null;
  created_at: string;
}

export type FakturaPaymentMethod = "bank_transfer" | "cash" | "direct_debit" | "other";

export interface FakturaPaymentRow {
  id: string;
  workspace_id: string;
  invoice_id: string;
  amount_cents: number;
  paid_at: string;
  method: FakturaPaymentMethod;
  reference: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export type FakturaDunningStatus = "draft" | "sent";

export interface FakturaDunningLetterRow {
  id: string;
  workspace_id: string;
  invoice_id: string;
  level: 1 | 2 | 3;
  status: FakturaDunningStatus;
  number: string | null;
  open_amount_cents: number;
  fee_cents: number;
  interest_cents: number;
  total_due_cents: number;
  days_overdue: number;
  issue_date: string | null;
  pdf_storage_path: string | null;
  created_by: string;
  created_at: string;
  sent_at: string | null;
}

export type FakturaAccountType = "revenue" | "expense" | "asset" | "liability" | "equity";

export interface FakturaAccountRow {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  account_type: FakturaAccountType;
  is_system: 0 | 1;
  archived_at: string | null;
  created_at: string;
}

export type FakturaExpensePaymentMethod = "bank_transfer" | "cash" | "direct_debit" | "other" | "open";

export interface FakturaExpenseRow {
  id: string;
  workspace_id: string;
  supplier_id: string | null;
  expense_account_id: string;
  description: string;
  amount_cents: number;
  tax_rate_basis_points: FakturaTaxRateBasisPoints;
  expense_date: string;
  payment_method: FakturaExpensePaymentMethod;
  created_by: string;
  created_at: string;
}

export type FakturaBookingStatus = "proposed" | "confirmed" | "reversed";
export type FakturaBookingSourceType = "invoice" | "credit_note" | "payment" | "expense";

export interface FakturaBookingRow {
  id: string;
  workspace_id: string;
  booking_date: string;
  debit_account_id: string;
  credit_account_id: string;
  amount_cents: number;
  description: string;
  tax_rate_basis_points: FakturaTaxRateBasisPoints | null;
  status: FakturaBookingStatus;
  source_entity_type: FakturaBookingSourceType;
  source_entity_id: string;
  reverses_booking_id: string | null;
  created_by: string;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export type FakturaPosShiftStatus = "open" | "closed";

export interface FakturaPosShiftRow {
  id: string;
  workspace_id: string;
  opened_by: string;
  opened_at: string;
  opening_balance_cents: number;
  status: FakturaPosShiftStatus;
  closed_by: string | null;
  closed_at: string | null;
  counted_cash_cents: number | null;
  expected_cash_cents: number | null;
  difference_cents: number | null;
}
