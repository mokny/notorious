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
  posReceiptNumberPrefix: string;
  dunningNumberPrefix: string;
  dunningLevel1Days: number;
  dunningLevel2Days: number;
  dunningLevel3Days: number;
  dunningLevel1FeeCents: number;
  dunningLevel2FeeCents: number;
  dunningLevel3FeeCents: number;
  dunningInterestRatePercent: number;
  chartOfAccounts: "skr03" | "skr04";
  /** When true, every rendered PDF gets a prominent "TESTMODUS" banner (see pdf/testBanner.ts) - lets users try out the module without producing documents that look like real, legally-issued paperwork. */
  testMode: boolean;
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
  posReceiptNumberPrefix: "BON",
  dunningNumberPrefix: "MA",
  dunningLevel1Days: 7,
  dunningLevel2Days: 14,
  dunningLevel3Days: 28,
  dunningLevel1FeeCents: 0,
  dunningLevel2FeeCents: 500,
  dunningLevel3FeeCents: 1000,
  dunningInterestRatePercent: 9.89,
  chartOfAccounts: "skr04",
  testMode: false,
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
    posReceiptNumberPrefix: row.pos_receipt_number_prefix,
    dunningNumberPrefix: row.dunning_number_prefix,
    dunningLevel1Days: row.dunning_level_1_days,
    dunningLevel2Days: row.dunning_level_2_days,
    dunningLevel3Days: row.dunning_level_3_days,
    dunningLevel1FeeCents: row.dunning_level_1_fee_cents,
    dunningLevel2FeeCents: row.dunning_level_2_fee_cents,
    dunningLevel3FeeCents: row.dunning_level_3_fee_cents,
    dunningInterestRatePercent: row.dunning_interest_rate_percent,
    chartOfAccounts: row.chart_of_accounts,
    testMode: row.test_mode === 1,
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

/** Reads the active chart of accounts without pulling in the whole DTO - used by services/accounts.ts::getAccountByPurpose and services/bookings.ts. */
export function getChartOfAccounts(sdk: ModuleSdk, workspaceId: string): "skr03" | "skr04" {
  const row = sdk.sqlite
    .prepare("SELECT chart_of_accounts FROM faktura_company_settings WHERE workspace_id = ?")
    .get(workspaceId) as Pick<FakturaCompanySettingsRow, "chart_of_accounts"> | undefined;
  return row?.chart_of_accounts ?? DEFAULTS.chartOfAccounts;
}

export function getNumberPrefixes(
  sdk: ModuleSdk,
  workspaceId: string,
): { quote: string; order: string; invoice: string; credit_note: string; pos_receipt: string } {
  const row = sdk.sqlite
    .prepare(
      "SELECT quote_number_prefix, order_number_prefix, invoice_number_prefix, credit_note_number_prefix, pos_receipt_number_prefix FROM faktura_company_settings WHERE workspace_id = ?",
    )
    .get(workspaceId) as
    | Pick<
        FakturaCompanySettingsRow,
        "quote_number_prefix" | "order_number_prefix" | "invoice_number_prefix" | "credit_note_number_prefix" | "pos_receipt_number_prefix"
      >
    | undefined;
  return {
    quote: row?.quote_number_prefix ?? DEFAULTS.quoteNumberPrefix,
    order: row?.order_number_prefix ?? DEFAULTS.orderNumberPrefix,
    invoice: row?.invoice_number_prefix ?? DEFAULTS.invoiceNumberPrefix,
    credit_note: row?.credit_note_number_prefix ?? DEFAULTS.creditNoteNumberPrefix,
    pos_receipt: row?.pos_receipt_number_prefix ?? DEFAULTS.posReceiptNumberPrefix,
  };
}

/** Reads the dunning-relevant fields other services need without pulling in the whole DTO. */
export function getDunningSettings(
  sdk: ModuleSdk,
  workspaceId: string,
): {
  numberPrefix: string;
  levelDays: [number, number, number];
  levelFeeCents: [number, number, number];
  interestRatePercent: number;
} {
  const row = sdk.sqlite
    .prepare(
      `SELECT dunning_number_prefix, dunning_level_1_days, dunning_level_2_days, dunning_level_3_days,
              dunning_level_1_fee_cents, dunning_level_2_fee_cents, dunning_level_3_fee_cents, dunning_interest_rate_percent
       FROM faktura_company_settings WHERE workspace_id = ?`,
    )
    .get(workspaceId) as
    | Pick<
        FakturaCompanySettingsRow,
        | "dunning_number_prefix"
        | "dunning_level_1_days"
        | "dunning_level_2_days"
        | "dunning_level_3_days"
        | "dunning_level_1_fee_cents"
        | "dunning_level_2_fee_cents"
        | "dunning_level_3_fee_cents"
        | "dunning_interest_rate_percent"
      >
    | undefined;
  return {
    numberPrefix: row?.dunning_number_prefix ?? DEFAULTS.dunningNumberPrefix,
    levelDays: [row?.dunning_level_1_days ?? DEFAULTS.dunningLevel1Days, row?.dunning_level_2_days ?? DEFAULTS.dunningLevel2Days, row?.dunning_level_3_days ?? DEFAULTS.dunningLevel3Days],
    levelFeeCents: [
      row?.dunning_level_1_fee_cents ?? DEFAULTS.dunningLevel1FeeCents,
      row?.dunning_level_2_fee_cents ?? DEFAULTS.dunningLevel2FeeCents,
      row?.dunning_level_3_fee_cents ?? DEFAULTS.dunningLevel3FeeCents,
    ],
    interestRatePercent: row?.dunning_interest_rate_percent ?? DEFAULTS.dunningInterestRatePercent,
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
  posReceiptNumberPrefix: string;
  dunningNumberPrefix: string;
  dunningLevel1Days: number;
  dunningLevel2Days: number;
  dunningLevel3Days: number;
  dunningLevel1FeeCents: number;
  dunningLevel2FeeCents: number;
  dunningLevel3FeeCents: number;
  dunningInterestRatePercent: number;
  chartOfAccounts: "skr03" | "skr04";
  testMode: boolean;
}

export function upsertCompanySettings(sdk: ModuleSdk, workspaceId: string, input: UpdateCompanySettingsInput): CompanySettingsDto {
  const updatedAt = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_company_settings (
         workspace_id, legal_name, street, postal_code, city, country, tax_number, vat_id,
         is_kleinunternehmer, bank_name, iban, bic, default_payment_terms_days,
         quote_number_prefix, order_number_prefix, invoice_number_prefix, credit_note_number_prefix, pos_receipt_number_prefix,
         dunning_number_prefix, dunning_level_1_days, dunning_level_2_days, dunning_level_3_days,
         dunning_level_1_fee_cents, dunning_level_2_fee_cents, dunning_level_3_fee_cents, dunning_interest_rate_percent,
         chart_of_accounts, test_mode, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         pos_receipt_number_prefix = excluded.pos_receipt_number_prefix,
         dunning_number_prefix = excluded.dunning_number_prefix,
         dunning_level_1_days = excluded.dunning_level_1_days,
         dunning_level_2_days = excluded.dunning_level_2_days,
         dunning_level_3_days = excluded.dunning_level_3_days,
         dunning_level_1_fee_cents = excluded.dunning_level_1_fee_cents,
         dunning_level_2_fee_cents = excluded.dunning_level_2_fee_cents,
         dunning_level_3_fee_cents = excluded.dunning_level_3_fee_cents,
         dunning_interest_rate_percent = excluded.dunning_interest_rate_percent,
         chart_of_accounts = excluded.chart_of_accounts,
         test_mode = excluded.test_mode,
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
      input.posReceiptNumberPrefix.trim() || DEFAULTS.posReceiptNumberPrefix,
      input.dunningNumberPrefix.trim() || DEFAULTS.dunningNumberPrefix,
      input.dunningLevel1Days,
      input.dunningLevel2Days,
      input.dunningLevel3Days,
      input.dunningLevel1FeeCents,
      input.dunningLevel2FeeCents,
      input.dunningLevel3FeeCents,
      input.dunningInterestRatePercent,
      input.chartOfAccounts,
      input.testMode ? 1 : 0,
      updatedAt,
    );
  return getCompanySettings(sdk, workspaceId);
}
