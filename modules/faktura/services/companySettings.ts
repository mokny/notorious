import type { ModuleSdk } from "../manifest.js";
import type { FakturaCompanySettingsRow } from "../db/types.js";

export interface CompanySettingsDto {
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  isKleinunternehmer: boolean;
  bankName: string;
  iban: string;
  bic: string;
  logoStoragePath: string | null;
  defaultPaymentTermsDays: number;
  quoteNumberPrefix: string;
  orderNumberPrefix: string;
  invoiceNumberPrefix: string;
  creditNoteNumberPrefix: string;
  updatedAt: string | null;
}

const DEFAULTS: Omit<CompanySettingsDto, "updatedAt"> = {
  legalName: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  taxNumber: "",
  vatId: "",
  isKleinunternehmer: false,
  bankName: "",
  iban: "",
  bic: "",
  logoStoragePath: null,
  defaultPaymentTermsDays: 14,
  quoteNumberPrefix: "AN",
  orderNumberPrefix: "AB",
  invoiceNumberPrefix: "RE",
  creditNoteNumberPrefix: "GS",
};

function toDto(row: FakturaCompanySettingsRow): CompanySettingsDto {
  return {
    legalName: row.legal_name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    taxNumber: row.tax_number,
    vatId: row.vat_id,
    isKleinunternehmer: row.is_kleinunternehmer === 1,
    bankName: row.bank_name,
    iban: row.iban,
    bic: row.bic,
    logoStoragePath: row.logo_storage_path,
    defaultPaymentTermsDays: row.default_payment_terms_days,
    quoteNumberPrefix: row.quote_number_prefix,
    orderNumberPrefix: row.order_number_prefix,
    invoiceNumberPrefix: row.invoice_number_prefix,
    creditNoteNumberPrefix: row.credit_note_number_prefix,
    updatedAt: row.updated_at,
  };
}

/** Returns the workspace's company settings, or in-memory defaults if never saved - never null, so callers/UI don't have to special-case "not configured yet". */
export function getCompanySettings(sdk: ModuleSdk, workspaceId: string): CompanySettingsDto {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_company_settings WHERE workspace_id = ?")
    .get(workspaceId) as FakturaCompanySettingsRow | undefined;
  return row ? toDto(row) : { ...DEFAULTS, updatedAt: null };
}

/** Reads the tax-relevant fields other services need without pulling in the whole DTO. */
export function getCompanyTaxFlags(sdk: ModuleSdk, workspaceId: string): { isKleinunternehmer: boolean } {
  const row = sdk.sqlite
    .prepare("SELECT is_kleinunternehmer FROM faktura_company_settings WHERE workspace_id = ?")
    .get(workspaceId) as Pick<FakturaCompanySettingsRow, "is_kleinunternehmer"> | undefined;
  return { isKleinunternehmer: row ? row.is_kleinunternehmer === 1 : false };
}

export function getNumberPrefixes(
  sdk: ModuleSdk,
  workspaceId: string,
): { quote: string; order: string; invoice: string; credit_note: string } {
  const row = sdk.sqlite
    .prepare(
      "SELECT quote_number_prefix, order_number_prefix, invoice_number_prefix, credit_note_number_prefix FROM faktura_company_settings WHERE workspace_id = ?",
    )
    .get(workspaceId) as
    | Pick<FakturaCompanySettingsRow, "quote_number_prefix" | "order_number_prefix" | "invoice_number_prefix" | "credit_note_number_prefix">
    | undefined;
  return {
    quote: row?.quote_number_prefix ?? DEFAULTS.quoteNumberPrefix,
    order: row?.order_number_prefix ?? DEFAULTS.orderNumberPrefix,
    invoice: row?.invoice_number_prefix ?? DEFAULTS.invoiceNumberPrefix,
    credit_note: row?.credit_note_number_prefix ?? DEFAULTS.creditNoteNumberPrefix,
  };
}

export interface UpdateCompanySettingsInput {
  legalName: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  isKleinunternehmer: boolean;
  bankName: string;
  iban: string;
  bic: string;
  defaultPaymentTermsDays: number;
  quoteNumberPrefix: string;
  orderNumberPrefix: string;
  invoiceNumberPrefix: string;
  creditNoteNumberPrefix: string;
}

export function upsertCompanySettings(sdk: ModuleSdk, workspaceId: string, input: UpdateCompanySettingsInput): CompanySettingsDto {
  const updatedAt = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_company_settings (
         workspace_id, legal_name, street, postal_code, city, country, tax_number, vat_id,
         is_kleinunternehmer, bank_name, iban, bic, default_payment_terms_days,
         quote_number_prefix, order_number_prefix, invoice_number_prefix, credit_note_number_prefix,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         legal_name = excluded.legal_name,
         street = excluded.street,
         postal_code = excluded.postal_code,
         city = excluded.city,
         country = excluded.country,
         tax_number = excluded.tax_number,
         vat_id = excluded.vat_id,
         is_kleinunternehmer = excluded.is_kleinunternehmer,
         bank_name = excluded.bank_name,
         iban = excluded.iban,
         bic = excluded.bic,
         default_payment_terms_days = excluded.default_payment_terms_days,
         quote_number_prefix = excluded.quote_number_prefix,
         order_number_prefix = excluded.order_number_prefix,
         invoice_number_prefix = excluded.invoice_number_prefix,
         credit_note_number_prefix = excluded.credit_note_number_prefix,
         updated_at = excluded.updated_at`,
    )
    .run(
      workspaceId,
      input.legalName.trim(),
      input.street.trim(),
      input.postalCode.trim(),
      input.city.trim(),
      input.country.trim() || "DE",
      input.taxNumber.trim(),
      input.vatId.trim(),
      input.isKleinunternehmer ? 1 : 0,
      input.bankName.trim(),
      input.iban.trim(),
      input.bic.trim(),
      input.defaultPaymentTermsDays,
      input.quoteNumberPrefix.trim() || DEFAULTS.quoteNumberPrefix,
      input.orderNumberPrefix.trim() || DEFAULTS.orderNumberPrefix,
      input.invoiceNumberPrefix.trim() || DEFAULTS.invoiceNumberPrefix,
      input.creditNoteNumberPrefix.trim() || DEFAULTS.creditNoteNumberPrefix,
      updatedAt,
    );
  return getCompanySettings(sdk, workspaceId);
}
