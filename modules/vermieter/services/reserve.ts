import type { ModuleSdk } from "../manifest.js";
import type { VermieterReserveTransactionRow } from "../db/types.js";

export interface ReserveTransactionDto {
  id: string;
  propertyId: string;
  date: string;
  amountCents: number;
  note: string;
  createdAt: string;
}

function rowToDto(row: VermieterReserveTransactionRow): ReserveTransactionDto {
  return { id: row.id, propertyId: row.property_id, date: row.date, amountCents: row.amount_cents, note: row.note, createdAt: row.created_at };
}

export function listReserveTransactions(sdk: ModuleSdk, workspaceId: string, propertyId: string): ReserveTransactionDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_reserve_transactions WHERE workspace_id = ? AND property_id = ? ORDER BY date ASC")
    .all(workspaceId, propertyId) as VermieterReserveTransactionRow[];
  return rows.map(rowToDto);
}

export function getReserveBalance(sdk: ModuleSdk, workspaceId: string, propertyId: string): number {
  const row = sdk.sqlite
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM vermieter_reserve_transactions WHERE workspace_id = ? AND property_id = ?")
    .get(workspaceId, propertyId) as { total: number };
  return row.total;
}

export interface ReserveTransactionInput {
  propertyId: string;
  date: string;
  amountCents: number;
  note?: string;
}

export function createReserveTransaction(sdk: ModuleSdk, workspaceId: string, input: ReserveTransactionInput): ReserveTransactionDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_reserve_transactions (id, workspace_id, property_id, date, amount_cents, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, input.propertyId, input.date, input.amountCents, input.note?.trim() ?? "", now);
  return rowToDto(sdk.sqlite.prepare("SELECT * FROM vermieter_reserve_transactions WHERE id = ?").get(id) as VermieterReserveTransactionRow);
}

export function deleteReserveTransaction(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const result = sdk.sqlite.prepare("DELETE FROM vermieter_reserve_transactions WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return result.changes > 0;
}
