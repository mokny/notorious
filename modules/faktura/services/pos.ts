import type { ModuleSdk } from "../manifest.js";
import type { FakturaPaymentMethod } from "../db/types.js";
import { createDraftDocument, requireDocument, type DocumentDto } from "./documents.js";
import { issueDocument, cancelDocument } from "./numbering.js";
import { recordPayment, listPayments, deletePayment, type PaymentDto } from "./payments.js";
import { requireProduct } from "./products.js";
import { requireActiveShift } from "./posShifts.js";
import { undoBookingsForSource } from "./bookings.js";

const WALK_IN_CUSTOMER_NAME = "Laufkundschaft (Kasse)";

/** Lazily creates (once per workspace) the fixed anonymous customer every POS sale is booked against, since `faktura_documents.customer_id` is `NOT NULL` and a walk-up sale has no real customer. Idempotent - reuses the existing one if already created. */
export function ensureWalkInCustomer(sdk: ModuleSdk, workspaceId: string): string {
  const existing = sdk.sqlite
    .prepare("SELECT id FROM faktura_customers WHERE workspace_id = ? AND display_name = ? LIMIT 1")
    .get(workspaceId, WALK_IN_CUSTOMER_NAME) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_customers (id, workspace_id, kind, display_name, tax_treatment, vat_id, country, notes, created_at, updated_at)
       VALUES (?, ?, 'person', ?, 'standard', '', 'DE', 'Automatisch angelegt für Kassenverkäufe.', ?, ?)`,
    )
    .run(id, workspaceId, WALK_IN_CUSTOMER_NAME, now, now);
  return id;
}

export interface PosSaleLineInput {
  productId: string;
  quantity: number;
}

export interface PosSaleResult {
  document: DocumentDto;
  payment: PaymentDto;
}

/**
 * Creates, issues and immediately pays a POS sale in one step: builds a
 * `pos_receipt` document from the tapped products (reusing the same
 * draft-create -> issue -> record-payment services the rest of the module
 * uses, no duplicate logic), links it to the open cash shift, and records
 * full payment right away since a walk-up sale is never an open item.
 */
export function createPosSale(
  sdk: ModuleSdk,
  workspaceId: string,
  actorId: string,
  input: { lines: PosSaleLineInput[]; paymentMethod: FakturaPaymentMethod },
): PosSaleResult {
  if (input.lines.length === 0) throw new Error("Cannot create an empty sale");
  const shift = requireActiveShift(sdk, workspaceId);
  const customerId = ensureWalkInCustomer(sdk, workspaceId);

  const lines = input.lines.map((line) => {
    const product = requireProduct(sdk, workspaceId, line.productId);
    return {
      productId: product.id,
      description: product.name,
      quantity: line.quantity,
      unit: product.unit,
      unitPriceCents: product.base_price_cents,
      taxRateBasisPoints: product.tax_rate_basis_points,
    };
  });

  const draft = createDraftDocument(sdk, workspaceId, actorId, { type: "pos_receipt", customerId, lines });
  sdk.sqlite.prepare("UPDATE faktura_documents SET pos_shift_id = ? WHERE id = ? AND workspace_id = ?").run(shift.id, draft.id, workspaceId);

  const document = issueDocument(sdk, workspaceId, draft.id, actorId);
  const payment = recordPayment(sdk, workspaceId, document.id, actorId, {
    amountCents: document.totalCents,
    paidAt: sdk.nowIso(),
    method: input.paymentMethod,
  });

  return { document, payment };
}

/**
 * Voids a POS sale (Storno): unlike a plain "cancel" on an ordinary invoice
 * (where a payment may be partial/absent and reversing it isn't
 * automatically correct), a POS receipt is always paid in full at the time
 * of sale, so voiding it can safely and automatically undo everything it
 * caused -
 *   1. the payment record itself (payments carry no GoBD binding, plain
 *      delete - see services/payments.ts),
 *   2. every booking proposed/confirmed from that payment,
 *   3. every booking proposed/confirmed from the receipt document itself
 *      (the revenue/tax lines),
 *   4. finally the document is marked `cancelled` (never deleted - GoBD).
 * This keeps the cash shift's expected-cash calculation
 * (services/posShifts.ts::closeShift, which sums live `faktura_payments`
 * rows) and the accounting journal correct without any manual cleanup.
 */
export function cancelPosSale(sdk: ModuleSdk, workspaceId: string, actorId: string, documentId: string): DocumentDto {
  const document = requireDocument(sdk, workspaceId, documentId);
  if (document.type !== "pos_receipt") throw new Error("Only POS receipts can be voided this way");
  if (document.status !== "issued") throw new Error("Only an issued receipt can be voided");

  for (const payment of listPayments(sdk, workspaceId, documentId)) {
    undoBookingsForSource(sdk, workspaceId, actorId, "payment", payment.id);
    deletePayment(sdk, workspaceId, payment.id);
  }
  undoBookingsForSource(sdk, workspaceId, actorId, "invoice", documentId);

  return cancelDocument(sdk, workspaceId, documentId);
}
