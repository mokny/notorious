import type { ModuleSdk } from "../manifest.js";
import { roundToCents } from "@notorious/shared";
import type { FakturaBookingRow, FakturaBookingStatus, FakturaBookingSourceType, FakturaTaxRateBasisPoints } from "../db/types.js";
import { getAccountByPurpose, type AccountPurpose } from "./accounts.js";
import { getChartOfAccounts } from "./companySettings.js";
import type { DocumentDto } from "./documents.js";
import type { PaymentDto } from "./payments.js";
import type { ExpenseDto } from "./expenses.js";
import type { FakturaPaymentMethod, FakturaExpensePaymentMethod } from "../db/types.js";

export interface BookingDto {
  id: string;
  bookingDate: string;
  debitAccountId: string;
  creditAccountId: string;
  amountCents: number;
  description: string;
  taxRateBasisPoints: FakturaTaxRateBasisPoints | null;
  status: FakturaBookingStatus;
  sourceEntityType: FakturaBookingSourceType;
  sourceEntityId: string;
  reversesBookingId: string | null;
  createdBy: string;
  createdAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

function rowToDto(row: FakturaBookingRow): BookingDto {
  return {
    id: row.id,
    bookingDate: row.booking_date,
    debitAccountId: row.debit_account_id,
    creditAccountId: row.credit_account_id,
    amountCents: row.amount_cents,
    description: row.description,
    taxRateBasisPoints: row.tax_rate_basis_points,
    status: row.status,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    reversesBookingId: row.reverses_booking_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  };
}

function insertBooking(
  sdk: ModuleSdk,
  workspaceId: string,
  actorId: string,
  params: {
    bookingDate: string;
    debitAccountId: string;
    creditAccountId: string;
    amountCents: number;
    description: string;
    taxRateBasisPoints?: FakturaTaxRateBasisPoints | null;
    sourceEntityType: FakturaBookingSourceType;
    sourceEntityId: string;
  },
): void {
  if (params.amountCents <= 0) return;
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_bookings (id, workspace_id, booking_date, debit_account_id, credit_account_id, amount_cents, description, tax_rate_basis_points, status, source_entity_type, source_entity_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?)`,
    )
    .run(
      sdk.newId(),
      workspaceId,
      params.bookingDate,
      params.debitAccountId,
      params.creditAccountId,
      params.amountCents,
      params.description,
      params.taxRateBasisPoints ?? null,
      params.sourceEntityType,
      params.sourceEntityId,
      actorId,
      sdk.nowIso(),
    );
}

function revenuePurposeForRate(rate: FakturaTaxRateBasisPoints): AccountPurpose {
  return `revenue_${rate}`;
}
function vatPurposeForRate(rate: 1900 | 700): AccountPurpose {
  return `vat_${rate}`;
}

/**
 * Proposes booking lines for an issued invoice or credit note: one
 * net-revenue line and (if the rate is non-zero) one tax line per tax-rate
 * group from the document's stored tax breakdown - together they sum to
 * the document's gross total on the receivables side. A credit note is the
 * mirror image (debit/credit swapped) since it reduces revenue/receivables
 * rather than creating them. See the phase plan's "Buchungslogik" section
 * for the rationale behind this two-line-per-rate simplification instead
 * of a single BU-Schlüssel-coded posting.
 */
export function proposeSalesDocumentBookings(sdk: ModuleSdk, workspaceId: string, actorId: string, document: DocumentDto): void {
  if (document.taxBreakdown.length === 0) return;
  const tx = sdk.sqlite.transaction(() => proposeSalesDocumentBookingsUnwrapped(sdk, workspaceId, actorId, document));
  tx();
}

function proposeSalesDocumentBookingsUnwrapped(sdk: ModuleSdk, workspaceId: string, actorId: string, document: DocumentDto): void {
  const chart = getChartOfAccounts(sdk, workspaceId);
  const receivables = getAccountByPurpose(sdk, workspaceId, chart, "receivables");
  const isCreditNote = document.type === "credit_note";
  const bookingDate = document.issueDate ?? sdk.nowIso().slice(0, 10);
  // faktura_bookings.source_entity_type only allows 'invoice'/'credit_note'/
  // 'payment'/'expense' - a POS receipt is tagged 'invoice' too (it's the
  // same kind of revenue booking), the actual document type is still
  // reachable via source_entity_id for anyone who needs to distinguish them.
  const sourceType: FakturaBookingSourceType = isCreditNote ? "credit_note" : "invoice";
  const label = isCreditNote ? "Gutschrift" : document.type === "pos_receipt" ? "Kassenbon" : "Rechnung";

  for (const entry of document.taxBreakdown) {
    const revenueAccount = getAccountByPurpose(sdk, workspaceId, chart, revenuePurposeForRate(entry.taxRateBasisPoints));
    const revenueDebit = isCreditNote ? revenueAccount.id : receivables.id;
    const revenueCredit = isCreditNote ? receivables.id : revenueAccount.id;
    insertBooking(sdk, workspaceId, actorId, {
      bookingDate,
      debitAccountId: revenueDebit,
      creditAccountId: revenueCredit,
      amountCents: entry.netTotalCents,
      description: `${label} ${document.number ?? document.id} - Erlös ${entry.taxRateBasisPoints / 100}%`,
      taxRateBasisPoints: entry.taxRateBasisPoints,
      sourceEntityType: sourceType,
      sourceEntityId: document.id,
    });

    if (entry.taxRateBasisPoints > 0 && entry.taxTotalCents > 0) {
      const vatAccount = getAccountByPurpose(sdk, workspaceId, chart, vatPurposeForRate(entry.taxRateBasisPoints as 1900 | 700));
      const vatDebit = isCreditNote ? vatAccount.id : receivables.id;
      const vatCredit = isCreditNote ? receivables.id : vatAccount.id;
      insertBooking(sdk, workspaceId, actorId, {
        bookingDate,
        debitAccountId: vatDebit,
        creditAccountId: vatCredit,
        amountCents: entry.taxTotalCents,
        description: `${label} ${document.number ?? document.id} - USt. ${entry.taxRateBasisPoints / 100}%`,
        taxRateBasisPoints: entry.taxRateBasisPoints,
        sourceEntityType: sourceType,
        sourceEntityId: document.id,
      });
    }
  }
}

function bankOrCashPurpose(method: FakturaPaymentMethod | FakturaExpensePaymentMethod): AccountPurpose {
  return method === "cash" ? "cash" : "bank";
}

/** Proposes the booking for a manually recorded payment: Soll Bank/Kasse (by method), Haben Forderungen. */
export function proposePaymentBooking(sdk: ModuleSdk, workspaceId: string, actorId: string, payment: PaymentDto): void {
  const chart = getChartOfAccounts(sdk, workspaceId);
  const bankOrCash = getAccountByPurpose(sdk, workspaceId, chart, bankOrCashPurpose(payment.method));
  const receivables = getAccountByPurpose(sdk, workspaceId, chart, "receivables");
  insertBooking(sdk, workspaceId, actorId, {
    bookingDate: payment.paidAt.slice(0, 10),
    debitAccountId: bankOrCash.id,
    creditAccountId: receivables.id,
    amountCents: payment.amountCents,
    description: `Zahlungseingang zu Rechnung ${payment.invoiceId}`,
    sourceEntityType: "payment",
    sourceEntityId: payment.id,
  });
}

/** Splits a gross amount into net/tax so net+tax sums exactly back to gross (no rounding drift), same convention as documents.ts::computeDocumentTotals. */
function splitGrossAmount(grossCents: number, ratePercent: number): { netCents: number; taxCents: number } {
  if (ratePercent === 0) return { netCents: grossCents, taxCents: 0 };
  const netCents = roundToCents(grossCents / (1 + ratePercent / 100));
  return { netCents, taxCents: grossCents - netCents };
}

/** Proposes the booking(s) for a manually recorded expense: Soll Aufwandskonto (netto) + Soll Vorsteuer (falls Satz > 0), Haben Bank/Kasse (sofort bezahlt) oder Verbindlichkeiten (offen). */
export function proposeExpenseBookings(sdk: ModuleSdk, workspaceId: string, actorId: string, expense: ExpenseDto): void {
  const chart = getChartOfAccounts(sdk, workspaceId);
  const creditAccount = getAccountByPurpose(sdk, workspaceId, chart, expense.paymentMethod === "open" ? "payables" : bankOrCashPurpose(expense.paymentMethod));
  const { netCents, taxCents } = splitGrossAmount(expense.amountCents, expense.taxRateBasisPoints / 100);

  insertBooking(sdk, workspaceId, actorId, {
    bookingDate: expense.expenseDate,
    debitAccountId: expense.expenseAccountId,
    creditAccountId: creditAccount.id,
    amountCents: netCents,
    description: `Ausgabe: ${expense.description}`,
    taxRateBasisPoints: expense.taxRateBasisPoints,
    sourceEntityType: "expense",
    sourceEntityId: expense.id,
  });

  if (taxCents > 0) {
    const inputVat = getAccountByPurpose(sdk, workspaceId, chart, `input_vat_${expense.taxRateBasisPoints as 1900 | 700}`);
    insertBooking(sdk, workspaceId, actorId, {
      bookingDate: expense.expenseDate,
      debitAccountId: inputVat.id,
      creditAccountId: creditAccount.id,
      amountCents: taxCents,
      description: `Ausgabe: ${expense.description} - Vorsteuer ${expense.taxRateBasisPoints / 100}%`,
      taxRateBasisPoints: expense.taxRateBasisPoints,
      sourceEntityType: "expense",
      sourceEntityId: expense.id,
    });
  }
}

export function listBookings(sdk: ModuleSdk, workspaceId: string, status?: FakturaBookingStatus): BookingDto[] {
  const rows = (
    status
      ? sdk.sqlite.prepare("SELECT * FROM faktura_bookings WHERE workspace_id = ? AND status = ? ORDER BY booking_date DESC, created_at DESC").all(workspaceId, status)
      : sdk.sqlite.prepare("SELECT * FROM faktura_bookings WHERE workspace_id = ? ORDER BY booking_date DESC, created_at DESC").all(workspaceId)
  ) as FakturaBookingRow[];
  return rows.map(rowToDto);
}

export function getBooking(sdk: ModuleSdk, workspaceId: string, id: string): BookingDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM faktura_bookings WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | FakturaBookingRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export function confirmBooking(sdk: ModuleSdk, workspaceId: string, actorId: string, id: string): BookingDto {
  const row = sdk.sqlite.prepare("SELECT status FROM faktura_bookings WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | Pick<FakturaBookingRow, "status">
    | undefined;
  if (!row) throw new Error("Booking not found");
  if (row.status !== "proposed") throw new Error("Only proposed bookings can be confirmed");
  sdk.sqlite
    .prepare("UPDATE faktura_bookings SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE id = ? AND workspace_id = ?")
    .run(actorId, sdk.nowIso(), id, workspaceId);
  return getBooking(sdk, workspaceId, id)!;
}

export function confirmBookings(sdk: ModuleSdk, workspaceId: string, actorId: string, ids: string[]): BookingDto[] {
  return ids.map((id) => confirmBooking(sdk, workspaceId, actorId, id));
}

/** Hard-deletes a proposed booking (no GoBD binding yet - only confirmed bookings are immutable). */
export function rejectProposedBooking(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const row = sdk.sqlite.prepare("SELECT status FROM faktura_bookings WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | Pick<FakturaBookingRow, "status">
    | undefined;
  if (!row) return false;
  if (row.status !== "proposed") throw new Error("Only proposed bookings can be rejected");
  sdk.sqlite.prepare("DELETE FROM faktura_bookings WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return true;
}

/** Corrects a confirmed booking via a reversal (Storno): a new confirmed booking with debit/credit swapped, `reverses_booking_id` pointing back; the original flips to `reversed` but is never deleted or edited (GoBD). */
export function createReversalBooking(sdk: ModuleSdk, workspaceId: string, actorId: string, id: string): BookingDto {
  const original = sdk.sqlite.prepare("SELECT * FROM faktura_bookings WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | FakturaBookingRow
    | undefined;
  if (!original) throw new Error("Booking not found");
  if (original.status !== "confirmed") throw new Error("Only confirmed bookings can be reversed");

  const reversalId = sdk.newId();
  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare(
        `INSERT INTO faktura_bookings (id, workspace_id, booking_date, debit_account_id, credit_account_id, amount_cents, description, tax_rate_basis_points, status, source_entity_type, source_entity_id, reverses_booking_id, created_by, created_at, confirmed_by, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reversalId,
        workspaceId,
        now.slice(0, 10),
        original.credit_account_id,
        original.debit_account_id,
        original.amount_cents,
        `Storno: ${original.description}`,
        original.tax_rate_basis_points,
        original.source_entity_type,
        original.source_entity_id,
        original.id,
        actorId,
        now,
        actorId,
        now,
      );
    sdk.sqlite.prepare("UPDATE faktura_bookings SET status = 'reversed' WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  });
  tx();

  return getBooking(sdk, workspaceId, reversalId)!;
}
