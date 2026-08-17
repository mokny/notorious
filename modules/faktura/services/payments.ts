import type { ModuleSdk } from "../manifest.js";
import type { FakturaPaymentRow, FakturaPaymentMethod } from "../db/types.js";
import { requireDocument } from "./documents.js";
import { proposePaymentBooking } from "./bookings.js";

export interface PaymentDto {
  id: string;
  invoiceId: string;
  amountCents: number;
  paidAt: string;
  method: FakturaPaymentMethod;
  reference: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface PaymentSummary {
  totalPaidCents: number;
  openAmountCents: number;
  isFullyPaid: boolean;
}

function rowToDto(row: FakturaPaymentRow): PaymentDto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function listPayments(sdk: ModuleSdk, workspaceId: string, invoiceId: string): PaymentDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_payments WHERE workspace_id = ? AND invoice_id = ? ORDER BY paid_at DESC, created_at DESC")
    .all(workspaceId, invoiceId) as FakturaPaymentRow[];
  return rows.map(rowToDto);
}

/**
 * Sums payments against an invoice's stored `total_cents` (immutable once
 * issued, see services/documents.ts) - never denormalized onto the
 * document row itself, since payments can be added/removed at any time
 * without touching the legally issued document.
 */
export function getInvoicePaymentSummary(sdk: ModuleSdk, workspaceId: string, invoiceId: string): PaymentSummary {
  const document = requireDocument(sdk, workspaceId, invoiceId);
  const { total } = sdk.sqlite
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) as total FROM faktura_payments WHERE workspace_id = ? AND invoice_id = ?")
    .get(workspaceId, invoiceId) as { total: number };
  const openAmountCents = Math.max(0, document.total_cents - total);
  return { totalPaidCents: total, openAmountCents, isFullyPaid: openAmountCents === 0 };
}

export interface PaymentInput {
  amountCents: number;
  paidAt: string;
  method: FakturaPaymentMethod;
  reference?: string;
  notes?: string;
}

export function recordPayment(sdk: ModuleSdk, workspaceId: string, invoiceId: string, actorId: string, input: PaymentInput): PaymentDto {
  const document = requireDocument(sdk, workspaceId, invoiceId);
  if (document.type !== "invoice" && document.type !== "pos_receipt") throw new Error("Payments can only be recorded against invoices or POS receipts");
  if (document.status !== "issued") throw new Error("Payments can only be recorded against issued invoices");

  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_payments (id, workspace_id, invoice_id, amount_cents, paid_at, method, reference, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, invoiceId, input.amountCents, input.paidAt, input.method, input.reference ?? "", input.notes ?? "", actorId, now);
  const payment = rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_payments WHERE id = ?").get(id) as FakturaPaymentRow);
  proposePaymentBooking(sdk, workspaceId, actorId, payment);
  return payment;
}

export function deletePayment(sdk: ModuleSdk, workspaceId: string, paymentId: string): boolean {
  const result = sdk.sqlite.prepare("DELETE FROM faktura_payments WHERE id = ? AND workspace_id = ?").run(paymentId, workspaceId);
  return result.changes > 0;
}
