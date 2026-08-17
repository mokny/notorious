import type { ModuleSdk } from "../manifest.js";
import { percentOf } from "@notorious/shared";
import type {
  FakturaDocumentRow,
  FakturaDocumentLineRow,
  FakturaDocumentTaxBreakdownRow,
  FakturaDocumentType,
  FakturaDocumentStatus,
  FakturaTaxTreatment,
  FakturaTaxRateBasisPoints,
} from "../db/types.js";
import { requireCustomer } from "./customers.js";
import { getCompanyTaxFlags } from "./companySettings.js";

export interface DocumentLineInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent?: number;
  /** Nominal rate before Kleinunternehmer/Reverse-Charge overrides are applied - usually the product's own default rate. */
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
}

export interface DocumentLineDto {
  id: string;
  productId: string | null;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
}

export interface TaxBreakdownDto {
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  netTotalCents: number;
  taxTotalCents: number;
}

export interface AddressSnapshot {
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface DocumentDto {
  id: string;
  type: FakturaDocumentType;
  status: FakturaDocumentStatus;
  number: string | null;
  customerId: string;
  sourceDocumentId: string | null;
  billingAddress: AddressSnapshot;
  shippingAddress: AddressSnapshot;
  issueDate: string | null;
  dueDate: string | null;
  taxTreatment: FakturaTaxTreatment;
  currency: string;
  subtotalCents: number;
  taxTotalCents: number;
  totalCents: number;
  notes: string;
  legalDisclaimerText: string;
  pdfStoragePath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  lines: DocumentLineDto[];
  taxBreakdown: TaxBreakdownDto[];
}

export interface DocumentListItemDto {
  id: string;
  type: FakturaDocumentType;
  status: FakturaDocumentStatus;
  number: string | null;
  customerId: string;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
}

/**
 * Resolves the legal disclaimer text mandatory on the document, in
 * precedence order: company-wide Kleinunternehmer (§19 UStG) beats
 * customer-specific Reverse-Charge (§13b UStG) - see the phase plan's tax
 * modeling decision. Empty string when neither applies (standard-rate
 * document).
 */
export function resolveDisclaimerText(isKleinunternehmer: boolean, taxTreatment: FakturaTaxTreatment): string {
  if (isKleinunternehmer) {
    return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";
  }
  if (taxTreatment === "reverse_charge") {
    return "Steuerschuldnerschaft des Leistungsempfängers gem. § 13b UStG (Reverse-Charge-Verfahren).";
  }
  return "";
}

type ComputedLine = DocumentLineDto;

interface ComputedTotals {
  lines: ComputedLine[];
  taxBreakdown: TaxBreakdownDto[];
  subtotalCents: number;
  taxTotalCents: number;
  totalCents: number;
}

/**
 * Pure computation, shared by draft save, issue, and chain-conversion
 * (quote->order->invoice->credit note): applies the Kleinunternehmer/
 * Reverse-Charge override to each line's effective tax rate, rounds each
 * line's tax to the nearest cent individually (kaufmännische Rundung), then
 * sums already-rounded cents - never sums floats/fractional cents. Never
 * trusts client-submitted totals; this is the only place totals are ever
 * computed.
 */
export function computeDocumentTotals(lines: DocumentLineInput[], isKleinunternehmer: boolean, taxTreatment: FakturaTaxTreatment): ComputedTotals {
  const computedLines: ComputedLine[] = lines.map((line, index) => {
    const effectiveRate: FakturaTaxRateBasisPoints = isKleinunternehmer || taxTreatment === "reverse_charge" ? 0 : line.taxRateBasisPoints;
    const rawSubtotal = line.quantity * line.unitPriceCents;
    const discountPercent = line.discountPercent ?? 0;
    const lineSubtotalCents = rawSubtotal - percentOf(rawSubtotal, discountPercent);
    const lineTaxCents = percentOf(lineSubtotalCents, effectiveRate / 100);
    return {
      id: "",
      productId: line.productId ?? null,
      position: index,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      discountPercent,
      taxRateBasisPoints: effectiveRate,
      lineSubtotalCents,
      lineTaxCents,
      lineTotalCents: lineSubtotalCents + lineTaxCents,
    };
  });

  const breakdownMap = new Map<FakturaTaxRateBasisPoints, { net: number; tax: number }>();
  for (const line of computedLines) {
    const entry = breakdownMap.get(line.taxRateBasisPoints) ?? { net: 0, tax: 0 };
    entry.net += line.lineSubtotalCents;
    entry.tax += line.lineTaxCents;
    breakdownMap.set(line.taxRateBasisPoints, entry);
  }
  const taxBreakdown: TaxBreakdownDto[] = Array.from(breakdownMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, sums]) => ({ taxRateBasisPoints: rate, netTotalCents: sums.net, taxTotalCents: sums.tax }));

  const subtotalCents = computedLines.reduce((sum, l) => sum + l.lineSubtotalCents, 0);
  const taxTotalCents = computedLines.reduce((sum, l) => sum + l.lineTaxCents, 0);

  return { lines: computedLines, taxBreakdown, subtotalCents, taxTotalCents, totalCents: subtotalCents + taxTotalCents };
}

function rowToDto(sdk: ModuleSdk, row: FakturaDocumentRow): DocumentDto {
  const lineRows = sdk.sqlite
    .prepare("SELECT * FROM faktura_document_lines WHERE document_id = ? ORDER BY position ASC")
    .all(row.id) as FakturaDocumentLineRow[];
  const breakdownRows = sdk.sqlite
    .prepare("SELECT * FROM faktura_document_tax_breakdown WHERE document_id = ? ORDER BY tax_rate_basis_points ASC")
    .all(row.id) as FakturaDocumentTaxBreakdownRow[];

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    number: row.number,
    customerId: row.customer_id,
    sourceDocumentId: row.source_document_id,
    billingAddress: { street: row.billing_street, postalCode: row.billing_postal_code, city: row.billing_city, country: row.billing_country },
    shippingAddress: { street: row.shipping_street, postalCode: row.shipping_postal_code, city: row.shipping_city, country: row.shipping_country },
    issueDate: row.issue_date,
    dueDate: row.due_date,
    taxTreatment: row.tax_treatment,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    taxTotalCents: row.tax_total_cents,
    totalCents: row.total_cents,
    notes: row.notes,
    legalDisclaimerText: row.legal_disclaimer_text,
    pdfStoragePath: row.pdf_storage_path,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    issuedAt: row.issued_at,
    lines: lineRows.map((l) => ({
      id: l.id,
      productId: l.product_id,
      position: l.position,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unit_price_cents,
      discountPercent: l.discount_percent,
      taxRateBasisPoints: l.tax_rate_basis_points,
      lineSubtotalCents: l.line_subtotal_cents,
      lineTaxCents: l.line_tax_cents,
      lineTotalCents: l.line_total_cents,
    })),
    taxBreakdown: breakdownRows.map((b) => ({
      taxRateBasisPoints: b.tax_rate_basis_points,
      netTotalCents: b.net_total_cents,
      taxTotalCents: b.tax_total_cents,
    })),
  };
}

export function getDocument(sdk: ModuleSdk, workspaceId: string, documentId: string): DocumentDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as FakturaDocumentRow | undefined;
  return row ? rowToDto(sdk, row) : null;
}

/** Throws if the document doesn't belong to this workspace - used by numbering/issue/chain-conversion services. */
export function requireDocument(sdk: ModuleSdk, workspaceId: string, documentId: string): FakturaDocumentRow {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as FakturaDocumentRow | undefined;
  if (!row) throw new Error("Document not found");
  return row;
}

export function listDocuments(sdk: ModuleSdk, workspaceId: string, type?: FakturaDocumentType): DocumentListItemDto[] {
  const rows = (
    type
      ? sdk.sqlite.prepare("SELECT * FROM faktura_documents WHERE workspace_id = ? AND type = ? ORDER BY created_at DESC").all(workspaceId, type)
      : sdk.sqlite.prepare("SELECT * FROM faktura_documents WHERE workspace_id = ? ORDER BY created_at DESC").all(workspaceId)
  ) as FakturaDocumentRow[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    number: row.number,
    customerId: row.customer_id,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    totalCents: row.total_cents,
  }));
}

export interface DocumentInput {
  type: FakturaDocumentType;
  customerId: string;
  sourceDocumentId?: string | null;
  billingAddress?: Partial<AddressSnapshot>;
  shippingAddress?: Partial<AddressSnapshot>;
  dueDate?: string | null;
  notes?: string;
  lines: DocumentLineInput[];
}

function writeLines(sdk: ModuleSdk, documentId: string, lines: ComputedLine[]): void {
  sdk.sqlite.prepare("DELETE FROM faktura_document_lines WHERE document_id = ?").run(documentId);
  const insert = sdk.sqlite.prepare(
    `INSERT INTO faktura_document_lines (id, document_id, product_id, position, description, quantity, unit, unit_price_cents, discount_percent, tax_rate_basis_points, line_subtotal_cents, line_tax_cents, line_total_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of lines) {
    insert.run(
      sdk.newId(),
      documentId,
      line.productId,
      line.position,
      line.description,
      line.quantity,
      line.unit,
      line.unitPriceCents,
      line.discountPercent,
      line.taxRateBasisPoints,
      line.lineSubtotalCents,
      line.lineTaxCents,
      line.lineTotalCents,
    );
  }
}

function writeTaxBreakdown(sdk: ModuleSdk, documentId: string, breakdown: TaxBreakdownDto[]): void {
  sdk.sqlite.prepare("DELETE FROM faktura_document_tax_breakdown WHERE document_id = ?").run(documentId);
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_document_tax_breakdown (id, document_id, tax_rate_basis_points, net_total_cents, tax_total_cents) VALUES (?, ?, ?, ?, ?)",
  );
  for (const entry of breakdown) {
    insert.run(sdk.newId(), documentId, entry.taxRateBasisPoints, entry.netTotalCents, entry.taxTotalCents);
  }
}

function defaultAddress(customerAddress: { street: string; postal_code: string; city: string; country: string } | undefined): AddressSnapshot {
  return customerAddress
    ? { street: customerAddress.street, postalCode: customerAddress.postal_code, city: customerAddress.city, country: customerAddress.country }
    : { street: "", postalCode: "", city: "", country: "" };
}

function lookupCustomerAddress(sdk: ModuleSdk, customerId: string, kind: "billing" | "shipping") {
  return sdk.sqlite
    .prepare("SELECT * FROM faktura_customer_addresses WHERE customer_id = ? AND kind = ? ORDER BY is_default DESC, created_at ASC LIMIT 1")
    .get(customerId, kind) as { street: string; postal_code: string; city: string; country: string } | undefined;
}

/**
 * Creates a new draft document. Address/tax-treatment are snapshotted from
 * the customer now (not live-joined) but remain refreshable via `updateDraftDocument`
 * while the document stays a draft - the immutability guarantee only kicks
 * in once `issueDocument` (numbering.ts, Phase 1 step 7) sets status='issued'.
 */
export function createDraftDocument(sdk: ModuleSdk, workspaceId: string, actorId: string, input: DocumentInput): DocumentDto {
  const customer = requireCustomer(sdk, workspaceId, input.customerId);
  const { isKleinunternehmer } = getCompanyTaxFlags(sdk, workspaceId);
  const totals = computeDocumentTotals(input.lines, isKleinunternehmer, customer.tax_treatment);

  const billing = { ...defaultAddress(lookupCustomerAddress(sdk, customer.id, "billing")), ...input.billingAddress };
  const shipping = { ...defaultAddress(lookupCustomerAddress(sdk, customer.id, "shipping")), ...input.shippingAddress };

  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_documents (
         id, workspace_id, type, status, number, customer_id, source_document_id,
         billing_street, billing_postal_code, billing_city, billing_country,
         shipping_street, shipping_postal_code, shipping_city, shipping_country,
         due_date, tax_treatment, currency, subtotal_cents, tax_total_cents, total_cents,
         notes, legal_disclaimer_text, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.type,
      customer.id,
      input.sourceDocumentId ?? null,
      billing.street,
      billing.postalCode,
      billing.city,
      billing.country,
      shipping.street,
      shipping.postalCode,
      shipping.city,
      shipping.country,
      input.dueDate ?? null,
      customer.tax_treatment,
      totals.subtotalCents,
      totals.taxTotalCents,
      totals.totalCents,
      input.notes ?? "",
      resolveDisclaimerText(isKleinunternehmer, customer.tax_treatment),
      actorId,
      now,
      now,
    );
  writeLines(sdk, id, totals.lines);
  writeTaxBreakdown(sdk, id, totals.taxBreakdown);
  return getDocument(sdk, workspaceId, id)!;
}

/** Recomputes and overwrites a draft document. Throws if the document is not in `draft` status - issued documents are immutable (GoBD). */
export function updateDraftDocument(sdk: ModuleSdk, workspaceId: string, documentId: string, input: DocumentInput): DocumentDto | null {
  const existing = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as FakturaDocumentRow | undefined;
  if (!existing) return null;
  if (existing.status !== "draft") throw new Error("Only draft documents can be edited");

  const customer = requireCustomer(sdk, workspaceId, input.customerId);
  const { isKleinunternehmer } = getCompanyTaxFlags(sdk, workspaceId);
  const totals = computeDocumentTotals(input.lines, isKleinunternehmer, customer.tax_treatment);

  const billing = { ...defaultAddress(lookupCustomerAddress(sdk, customer.id, "billing")), ...input.billingAddress };
  const shipping = { ...defaultAddress(lookupCustomerAddress(sdk, customer.id, "shipping")), ...input.shippingAddress };
  const now = sdk.nowIso();

  sdk.sqlite
    .prepare(
      `UPDATE faktura_documents SET
         customer_id = ?, source_document_id = ?,
         billing_street = ?, billing_postal_code = ?, billing_city = ?, billing_country = ?,
         shipping_street = ?, shipping_postal_code = ?, shipping_city = ?, shipping_country = ?,
         due_date = ?, tax_treatment = ?, subtotal_cents = ?, tax_total_cents = ?, total_cents = ?,
         notes = ?, legal_disclaimer_text = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      customer.id,
      input.sourceDocumentId ?? existing.source_document_id,
      billing.street,
      billing.postalCode,
      billing.city,
      billing.country,
      shipping.street,
      shipping.postalCode,
      shipping.city,
      shipping.country,
      input.dueDate ?? null,
      customer.tax_treatment,
      totals.subtotalCents,
      totals.taxTotalCents,
      totals.totalCents,
      input.notes ?? "",
      resolveDisclaimerText(isKleinunternehmer, customer.tax_treatment),
      now,
      documentId,
      workspaceId,
    );
  writeLines(sdk, documentId, totals.lines);
  writeTaxBreakdown(sdk, documentId, totals.taxBreakdown);
  return getDocument(sdk, workspaceId, documentId);
}

/** Caches the rendered PDF's storage path on an issued document, so repeat downloads read the cached file instead of re-rendering (see routes/documentPdf.ts). */
export function setPdfStoragePath(sdk: ModuleSdk, workspaceId: string, documentId: string, storagePath: string): void {
  sdk.sqlite.prepare("UPDATE faktura_documents SET pdf_storage_path = ? WHERE id = ? AND workspace_id = ?").run(storagePath, documentId, workspaceId);
}

/** Returns (creating on first call) an opaque, unguessable token a customer can use to fetch this one document's PDF without logging in - see routes/documentPdf.ts's public route. Reuses `sdk.newId()` (a random UUID) as the token itself rather than minting a second random value. */
export function ensurePublicShareToken(sdk: ModuleSdk, workspaceId: string, documentId: string): string {
  const row = sdk.sqlite
    .prepare("SELECT public_share_token FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as Pick<FakturaDocumentRow, "public_share_token"> | undefined;
  if (!row) throw new Error("Document not found");
  if (row.public_share_token) return row.public_share_token;

  const token = sdk.newId();
  sdk.sqlite.prepare("UPDATE faktura_documents SET public_share_token = ? WHERE id = ? AND workspace_id = ?").run(token, documentId, workspaceId);
  return token;
}

/** Looks up a document by its public share token, across all workspaces (the token itself is the only "credential") - used only by the unauthenticated public receipt-download route, never anywhere a workspace is already known. */
export function getDocumentByPublicToken(sdk: ModuleSdk, token: string): { workspaceId: string; document: DocumentDto } | null {
  const row = sdk.sqlite.prepare("SELECT id, workspace_id FROM faktura_documents WHERE public_share_token = ?").get(token) as
    | Pick<FakturaDocumentRow, "id" | "workspace_id">
    | undefined;
  if (!row) return null;
  const document = getDocument(sdk, row.workspace_id, row.id);
  if (!document) return null;
  return { workspaceId: row.workspace_id, document };
}

/** Hard-deletes a draft document (never issued documents - those are cancelled, not deleted, see numbering.ts). */
export function deleteDraftDocument(sdk: ModuleSdk, workspaceId: string, documentId: string): boolean {
  const existing = sdk.sqlite
    .prepare("SELECT status FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as Pick<FakturaDocumentRow, "status"> | undefined;
  if (!existing) return false;
  if (existing.status !== "draft") throw new Error("Only draft documents can be deleted");

  sdk.sqlite.prepare("DELETE FROM faktura_document_tax_breakdown WHERE document_id = ?").run(documentId);
  sdk.sqlite.prepare("DELETE FROM faktura_document_lines WHERE document_id = ?").run(documentId);
  sdk.sqlite.prepare("DELETE FROM faktura_documents WHERE id = ? AND workspace_id = ?").run(documentId, workspaceId);
  return true;
}
