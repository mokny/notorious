import type { ModuleSdk } from "../manifest.js";
import type { VermieterRentPaymentRow, VermieterRentPaymentStatus } from "../db/types.js";

export interface RentPaymentDto {
  id: string;
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  coldRentDueCents: number;
  nkPrepaymentDueCents: number;
  paidAmountCents: number | null;
  paidDate: string | null;
  status: VermieterRentPaymentStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

function rowToDto(row: VermieterRentPaymentRow): RentPaymentDto {
  return {
    id: row.id,
    leaseId: row.lease_id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    coldRentDueCents: row.cold_rent_due_cents,
    nkPrepaymentDueCents: row.nk_prepayment_due_cents,
    paidAmountCents: row.paid_amount_cents,
    paidDate: row.paid_date,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listRentPayments(sdk: ModuleSdk, workspaceId: string, leaseId?: string): RentPaymentDto[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_rent_payments WHERE workspace_id = ? ${leaseId ? "AND lease_id = ?" : ""} ORDER BY period_year DESC, period_month DESC`,
    )
    .all(...(leaseId ? [workspaceId, leaseId] : [workspaceId])) as VermieterRentPaymentRow[];
  return rows.map(rowToDto);
}

export function getRentPayment(sdk: ModuleSdk, workspaceId: string, id: string): RentPaymentDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_rent_payments WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterRentPaymentRow
    | undefined;
  return row ? rowToDto(row) : null;
}

/** All rent-payment rows for a lease whose (year, month) falls within [periodStart, periodEnd] - used by the statement engine as the preferred source for prepayments actually received (see statementCalculation.ts). */
export function listRentPaymentsInPeriod(sdk: ModuleSdk, workspaceId: string, leaseId: string, periodStart: string, periodEnd: string): VermieterRentPaymentRow[] {
  const startKey = periodStart.slice(0, 7); // "YYYY-MM"
  const endKey = periodEnd.slice(0, 7);
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_rent_payments WHERE workspace_id = ? AND lease_id = ?")
    .all(workspaceId, leaseId) as VermieterRentPaymentRow[];
  return rows.filter((row) => {
    const key = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
    return key >= startKey && key <= endKey;
  });
}

export interface RentPaymentInput {
  leaseId: string;
  periodYear: number;
  periodMonth: number;
  coldRentDueCents: number;
  nkPrepaymentDueCents: number;
  paidAmountCents?: number | null;
  paidDate?: string | null;
  note?: string;
}

function deriveStatus(dueCents: number, paidCents: number | null | undefined): VermieterRentPaymentStatus {
  if (!paidCents || paidCents <= 0) return "open";
  if (paidCents >= dueCents) return "paid";
  return "partial";
}

export function createRentPayment(sdk: ModuleSdk, workspaceId: string, input: RentPaymentInput): RentPaymentDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  const dueTotal = input.coldRentDueCents + input.nkPrepaymentDueCents;
  const status = deriveStatus(dueTotal, input.paidAmountCents);
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_rent_payments
       (id, workspace_id, lease_id, period_year, period_month, cold_rent_due_cents, nk_prepayment_due_cents, paid_amount_cents, paid_date, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.leaseId,
      input.periodYear,
      input.periodMonth,
      input.coldRentDueCents,
      input.nkPrepaymentDueCents,
      input.paidAmountCents ?? null,
      input.paidDate ?? null,
      status,
      input.note?.trim() ?? "",
      now,
      now,
    );
  return getRentPayment(sdk, workspaceId, id)!;
}

export function recordPayment(sdk: ModuleSdk, workspaceId: string, id: string, paidAmountCents: number, paidDate: string): RentPaymentDto | null {
  const existing = getRentPayment(sdk, workspaceId, id);
  if (!existing) return null;
  const now = sdk.nowIso();
  const status = deriveStatus(existing.coldRentDueCents + existing.nkPrepaymentDueCents, paidAmountCents);
  sdk.sqlite
    .prepare("UPDATE vermieter_rent_payments SET paid_amount_cents = ?, paid_date = ?, status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(paidAmountCents, paidDate, status, now, id, workspaceId);
  return getRentPayment(sdk, workspaceId, id);
}
