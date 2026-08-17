import type { ModuleSdk } from "../manifest.js";
import type { FakturaPosShiftRow } from "../db/types.js";

export interface PosShiftDto {
  id: string;
  openedBy: string;
  openedAt: string;
  openingBalanceCents: number;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  countedCashCents: number | null;
  expectedCashCents: number | null;
  differenceCents: number | null;
}

function rowToDto(row: FakturaPosShiftRow): PosShiftDto {
  return {
    id: row.id,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
    openingBalanceCents: row.opening_balance_cents,
    status: row.status,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    countedCashCents: row.counted_cash_cents,
    expectedCashCents: row.expected_cash_cents,
    differenceCents: row.difference_cents,
  };
}

export function getActiveShift(sdk: ModuleSdk, workspaceId: string): PosShiftDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_pos_shifts WHERE workspace_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
    .get(workspaceId) as FakturaPosShiftRow | undefined;
  return row ? rowToDto(row) : null;
}

export function listShifts(sdk: ModuleSdk, workspaceId: string): PosShiftDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_pos_shifts WHERE workspace_id = ? ORDER BY opened_at DESC")
    .all(workspaceId) as FakturaPosShiftRow[];
  return rows.map(rowToDto);
}

export function openShift(sdk: ModuleSdk, workspaceId: string, actorId: string, openingBalanceCents: number): PosShiftDto {
  if (getActiveShift(sdk, workspaceId)) throw new Error("A shift is already open - close it before opening a new one");
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare("INSERT INTO faktura_pos_shifts (id, workspace_id, opened_by, opened_at, opening_balance_cents, status) VALUES (?, ?, ?, ?, ?, 'open')")
    .run(id, workspaceId, actorId, now, openingBalanceCents);
  return rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_pos_shifts WHERE id = ?").get(id) as FakturaPosShiftRow);
}

/** Requires an open shift for POS sales to attach to - see services/pos.ts::createPosSale. */
export function requireActiveShift(sdk: ModuleSdk, workspaceId: string): FakturaPosShiftRow {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_pos_shifts WHERE workspace_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1")
    .get(workspaceId) as FakturaPosShiftRow | undefined;
  if (!row) throw new Error("No open cash shift - open one before selling (Kasse öffnen)");
  return row;
}

/** Closes the shift and computes Soll (opening balance + cash payments recorded during the shift) vs. Ist (the counted amount). */
export function closeShift(sdk: ModuleSdk, workspaceId: string, actorId: string, shiftId: string, countedCashCents: number): PosShiftDto {
  const shift = sdk.sqlite.prepare("SELECT * FROM faktura_pos_shifts WHERE id = ? AND workspace_id = ?").get(shiftId, workspaceId) as
    | FakturaPosShiftRow
    | undefined;
  if (!shift) throw new Error("Shift not found");
  if (shift.status !== "open") throw new Error("Shift is already closed");

  const { total } = sdk.sqlite
    .prepare(
      `SELECT COALESCE(SUM(p.amount_cents), 0) as total
       FROM faktura_payments p
       JOIN faktura_documents d ON d.id = p.invoice_id
       WHERE d.pos_shift_id = ? AND p.method = 'cash'`,
    )
    .get(shiftId) as { total: number };

  const expectedCashCents = shift.opening_balance_cents + total;
  const differenceCents = countedCashCents - expectedCashCents;
  const now = sdk.nowIso();

  sdk.sqlite
    .prepare(
      `UPDATE faktura_pos_shifts SET status = 'closed', closed_by = ?, closed_at = ?, counted_cash_cents = ?, expected_cash_cents = ?, difference_cents = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(actorId, now, countedCashCents, expectedCashCents, differenceCents, shiftId, workspaceId);

  return rowToDto(sdk.sqlite.prepare("SELECT * FROM faktura_pos_shifts WHERE id = ?").get(shiftId) as FakturaPosShiftRow);
}
