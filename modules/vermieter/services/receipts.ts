import type { ModuleSdk } from "../manifest.js";
import type { VermieterAllocationKey, VermieterReceiptRow } from "../db/types.js";
import { resolveCostCategory } from "./customCostCategories.js";
import { getDefaultCostCircuitId } from "./costCircuits.js";

export interface ReceiptDto {
  id: string;
  propertyId: string;
  costCategoryKey: string;
  vendor: string;
  amountCents: number;
  receiptDate: string;
  description: string;
  allocationKeyOverride: VermieterAllocationKey | null;
  targetUnitId: string | null;
  /** @deprecated Legacy single-document fields from before multi-document attachments (migrations/0010, services/receiptDocuments.ts). No longer written by createReceipt/updateReceipt - use listReceiptDocuments/GET .../receipts/:id/documents instead. Kept only so pre-migration data/DTO shape stays readable. */
  storagePath: string | null;
  /** @deprecated See storagePath. */
  ocrRawText: string | null;
  taxDeductible: boolean;
  /** The Abrechnungskreis this receipt's cost pool belongs to (see services/costCircuits.ts) - additive field, always resolved server-side (defaults to the property's default circuit) so it's never null in practice even though the DB column is nullable. */
  costCircuitId: string;
  createdAt: string;
  updatedAt: string;
}

function rowToDto(row: VermieterReceiptRow): ReceiptDto {
  return {
    id: row.id,
    propertyId: row.property_id,
    costCategoryKey: row.cost_category_key,
    vendor: row.vendor,
    amountCents: row.amount_cents,
    receiptDate: row.receipt_date,
    description: row.description,
    allocationKeyOverride: row.allocation_key_override,
    targetUnitId: row.target_unit_id,
    storagePath: row.storage_path,
    ocrRawText: row.ocr_raw_text,
    taxDeductible: row.tax_deductible === 1,
    costCircuitId: row.cost_circuit_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listReceipts(
  sdk: ModuleSdk,
  workspaceId: string,
  filters?: { propertyId?: string; from?: string; to?: string },
): ReceiptDto[] {
  const clauses = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (filters?.propertyId) {
    clauses.push("property_id = ?");
    params.push(filters.propertyId);
  }
  if (filters?.from) {
    clauses.push("receipt_date >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    clauses.push("receipt_date <= ?");
    params.push(filters.to);
  }
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_receipts WHERE ${clauses.join(" AND ")} ORDER BY receipt_date DESC`)
    .all(...params) as VermieterReceiptRow[];
  return rows.map(rowToDto);
}

export function getReceipt(sdk: ModuleSdk, workspaceId: string, id: string): ReceiptDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_receipts WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterReceiptRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export function requireReceiptRow(sdk: ModuleSdk, workspaceId: string, id: string): VermieterReceiptRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_receipts WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterReceiptRow
    | undefined;
  if (!row) throw new Error("Receipt not found");
  return row;
}

/** Every receipt for a property whose receipt_date falls in [periodStart, periodEnd] - used by the statement engine. */
export function listReceiptsInPeriod(sdk: ModuleSdk, workspaceId: string, propertyId: string, periodStart: string, periodEnd: string): VermieterReceiptRow[] {
  return sdk.sqlite
    .prepare(
      "SELECT * FROM vermieter_receipts WHERE workspace_id = ? AND property_id = ? AND receipt_date >= ? AND receipt_date <= ? ORDER BY receipt_date ASC",
    )
    .all(workspaceId, propertyId, periodStart, periodEnd) as VermieterReceiptRow[];
}

export interface ReceiptInput {
  propertyId: string;
  costCategoryKey: string;
  vendor?: string;
  amountCents: number;
  receiptDate: string;
  description?: string;
  allocationKeyOverride?: VermieterAllocationKey | null;
  targetUnitId?: string | null;
  /** @deprecated Ignored by createReceipt/updateReceipt - see ReceiptDto.storagePath's doc comment. Kept only so old API callers don't get a type error; the column is always written NULL now. */
  storagePath?: string | null;
  /** @deprecated See storagePath. */
  ocrRawText?: string | null;
  taxDeductible?: boolean;
  /** Which Abrechnungskreis the cost belongs to. Omitted/null -> the property's default circuit ("Gesamtes Objekt"). */
  costCircuitId?: string | null;
}

export function createReceipt(sdk: ModuleSdk, workspaceId: string, input: ReceiptInput): ReceiptDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  const category = resolveCostCategory(sdk, workspaceId, input.costCategoryKey);
  const taxDeductible = input.taxDeductible ?? category?.taxDeductibleDefault ?? false;
  const costCircuitId = input.costCircuitId ?? getDefaultCostCircuitId(sdk, workspaceId, input.propertyId);
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_receipts
       (id, workspace_id, property_id, cost_category_key, vendor, amount_cents, receipt_date, description, allocation_key_override, target_unit_id, storage_path, ocr_raw_text, tax_deductible, cost_circuit_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.propertyId,
      input.costCategoryKey,
      input.vendor?.trim() ?? "",
      input.amountCents,
      input.receiptDate,
      input.description?.trim() ?? "",
      input.allocationKeyOverride ?? null,
      input.targetUnitId ?? null,
      // storage_path/ocr_raw_text are always NULL for new rows now - see
      // ReceiptInput.storagePath's doc comment and migrations/0010.
      null,
      null,
      taxDeductible ? 1 : 0,
      costCircuitId,
      now,
      now,
    );
  return getReceipt(sdk, workspaceId, id)!;
}

export function updateReceipt(sdk: ModuleSdk, workspaceId: string, id: string, input: Partial<ReceiptInput>): ReceiptDto | null {
  const existing = getReceipt(sdk, workspaceId, id);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_receipts SET
       cost_category_key = ?, vendor = ?, amount_cents = ?, receipt_date = ?, description = ?,
       allocation_key_override = ?, target_unit_id = ?, tax_deductible = ?, cost_circuit_id = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.costCategoryKey ?? existing.costCategoryKey,
      input.vendor !== undefined ? input.vendor.trim() : existing.vendor,
      input.amountCents ?? existing.amountCents,
      input.receiptDate ?? existing.receiptDate,
      input.description !== undefined ? input.description.trim() : existing.description,
      input.allocationKeyOverride !== undefined ? input.allocationKeyOverride : existing.allocationKeyOverride,
      input.targetUnitId !== undefined ? input.targetUnitId : existing.targetUnitId,
      (input.taxDeductible ?? existing.taxDeductible) ? 1 : 0,
      input.costCircuitId !== undefined && input.costCircuitId !== null ? input.costCircuitId : existing.costCircuitId,
      now,
      id,
      workspaceId,
    );
  return getReceipt(sdk, workspaceId, id);
}

export function deleteReceipt(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const result = sdk.sqlite.prepare("DELETE FROM vermieter_receipts WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return result.changes > 0;
}
