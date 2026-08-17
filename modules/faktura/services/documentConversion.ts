import type { ModuleSdk } from "../manifest.js";
import type { FakturaDocumentRow, FakturaDocumentLineRow, FakturaDocumentType } from "../db/types.js";
import { createDraftDocument, getDocument, type DocumentDto, type DocumentLineInput } from "./documents.js";

/**
 * Allowed conversions in the sales document chain (see the phase plan):
 * Angebot -> Auftrag -> Rechnung -> Gutschrift. The source document must be
 * `issued` - conversion turns a confirmed document into the next stage, not
 * a draft-to-draft copy. `order -> invoice` can be called repeatedly against
 * the same order (partial/multiple invoices): each call produces a fresh
 * editable draft pre-filled with the order's current lines, which the user
 * can trim down before issuing to invoice only part of an order.
 */
const ALLOWED_CONVERSIONS: Record<FakturaDocumentType, FakturaDocumentType> = {
  quote: "order",
  order: "invoice",
  invoice: "credit_note",
  credit_note: "credit_note", // unreachable - credit notes have no further conversion target
};

function toLineInput(line: FakturaDocumentLineRow): DocumentLineInput {
  return {
    productId: line.product_id,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceCents: line.unit_price_cents,
    discountPercent: line.discount_percent,
    taxRateBasisPoints: line.tax_rate_basis_points,
  };
}

/**
 * Creates a new draft document of the next type in the chain, pre-filled
 * from `sourceDocumentId`'s customer and lines, with `source_document_id`
 * pointing back at it. The new draft is fully editable (quantities can be
 * trimmed for a partial invoice, a credit note's amounts adjusted down)
 * before the user issues it - conversion only pre-fills, it never
 * auto-issues.
 */
export function convertDocument(sdk: ModuleSdk, workspaceId: string, actorId: string, sourceDocumentId: string, targetType: FakturaDocumentType): DocumentDto {
  const source = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(sourceDocumentId, workspaceId) as FakturaDocumentRow | undefined;
  if (!source) throw new Error("Source document not found");
  if (source.status !== "issued") throw new Error("Only issued documents can be converted to the next document type");
  if (ALLOWED_CONVERSIONS[source.type] !== targetType) {
    throw new Error(`Cannot convert a ${source.type} into a ${targetType}`);
  }

  const lineRows = sdk.sqlite
    .prepare("SELECT * FROM faktura_document_lines WHERE document_id = ? ORDER BY position ASC")
    .all(sourceDocumentId) as FakturaDocumentLineRow[];

  const notes = targetType === "credit_note" ? `Gutschrift zu ${source.number ?? sourceDocumentId}` : "";

  return createDraftDocument(sdk, workspaceId, actorId, {
    type: targetType,
    customerId: source.customer_id,
    sourceDocumentId,
    dueDate: null,
    notes,
    lines: lineRows.map(toLineInput),
  });
}

/** All documents created from `documentId` (e.g. every invoice generated from one order) - used to show the chain in the UI. */
export function listDerivedDocuments(sdk: ModuleSdk, workspaceId: string, documentId: string) {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE workspace_id = ? AND source_document_id = ? ORDER BY created_at ASC")
    .all(workspaceId, documentId) as FakturaDocumentRow[];
  return rows.map((row) => getDocument(sdk, workspaceId, row.id)!);
}
