import type { ModuleSdk } from "../manifest.js";
import type { VermieterLeaseRow, VermieterLeaseStatus, VermieterRentChangeRow } from "../db/types.js";
import { listTenantsForLease } from "./tenants.js";

export interface LeaseDto {
  id: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  coldRentCents: number;
  nkPrepaymentCents: number;
  depositCents: number | null;
  depositPaidDate: string | null;
  depositReturnedDate: string | null;
  status: VermieterLeaseStatus;
  notes: string;
  tenantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RentChangeDto {
  id: string;
  leaseId: string;
  effectiveDate: string;
  coldRentCents: number;
  nkPrepaymentCents: number;
  note: string;
  createdAt: string;
}

function rowToDto(sdk: ModuleSdk, row: VermieterLeaseRow): LeaseDto {
  const tenantRows = sdk.sqlite.prepare("SELECT tenant_id FROM vermieter_lease_tenants WHERE lease_id = ?").all(row.id) as {
    tenant_id: string;
  }[];
  return {
    id: row.id,
    unitId: row.unit_id,
    startDate: row.start_date,
    endDate: row.end_date,
    coldRentCents: row.cold_rent_cents,
    nkPrepaymentCents: row.nk_prepayment_cents,
    depositCents: row.deposit_cents,
    depositPaidDate: row.deposit_paid_date,
    depositReturnedDate: row.deposit_returned_date,
    status: row.status,
    notes: row.notes,
    tenantIds: tenantRows.map((t) => t.tenant_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rentChangeRowToDto(row: VermieterRentChangeRow): RentChangeDto {
  return {
    id: row.id,
    leaseId: row.lease_id,
    effectiveDate: row.effective_date,
    coldRentCents: row.cold_rent_cents,
    nkPrepaymentCents: row.nk_prepayment_cents,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function listLeases(sdk: ModuleSdk, workspaceId: string, unitId?: string): LeaseDto[] {
  const rows = sdk.sqlite
    .prepare(`SELECT * FROM vermieter_leases WHERE workspace_id = ? ${unitId ? "AND unit_id = ?" : ""} ORDER BY start_date DESC`)
    .all(...(unitId ? [workspaceId, unitId] : [workspaceId])) as VermieterLeaseRow[];
  return rows.map((row) => rowToDto(sdk, row));
}

export function getLease(sdk: ModuleSdk, workspaceId: string, leaseId: string): LeaseDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_leases WHERE id = ? AND workspace_id = ?").get(leaseId, workspaceId) as
    | VermieterLeaseRow
    | undefined;
  return row ? rowToDto(sdk, row) : null;
}

export function requireLeaseRow(sdk: ModuleSdk, workspaceId: string, leaseId: string): VermieterLeaseRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_leases WHERE id = ? AND workspace_id = ?").get(leaseId, workspaceId) as
    | VermieterLeaseRow
    | undefined;
  if (!row) throw new Error("Lease not found");
  return row;
}

/** All leases (any status) whose [startDate, endDate ?? open) interval overlaps [periodStart, periodEnd] for one unit - used by the statement engine to find every lease-segment covering the period. */
export function listLeasesOverlappingPeriod(sdk: ModuleSdk, workspaceId: string, unitId: string, periodStart: string, periodEnd: string): VermieterLeaseRow[] {
  return sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_leases
       WHERE workspace_id = ? AND unit_id = ?
         AND start_date <= ?
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY start_date ASC`,
    )
    .all(workspaceId, unitId, periodEnd, periodStart) as VermieterLeaseRow[];
}

export interface LeaseInput {
  unitId: string;
  startDate: string;
  endDate?: string | null;
  coldRentCents: number;
  nkPrepaymentCents: number;
  depositCents?: number | null;
  depositPaidDate?: string | null;
  depositReturnedDate?: string | null;
  status?: VermieterLeaseStatus;
  notes?: string;
  tenantIds: string[];
}

export function createLease(sdk: ModuleSdk, workspaceId: string, input: LeaseInput): LeaseDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare(
        `INSERT INTO vermieter_leases
         (id, workspace_id, unit_id, start_date, end_date, cold_rent_cents, nk_prepayment_cents, deposit_cents, deposit_paid_date, deposit_returned_date, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.unitId,
        input.startDate,
        input.endDate ?? null,
        input.coldRentCents,
        input.nkPrepaymentCents,
        input.depositCents ?? null,
        input.depositPaidDate ?? null,
        input.depositReturnedDate ?? null,
        input.status ?? "active",
        input.notes?.trim() ?? "",
        now,
        now,
      );
    for (const tenantId of input.tenantIds) {
      sdk.sqlite.prepare("INSERT OR IGNORE INTO vermieter_lease_tenants (lease_id, tenant_id) VALUES (?, ?)").run(id, tenantId);
    }
    // The initial rent is itself the first "rent change" entry, so
    // consumption-history lookups (listRentChangesUpToDate) always have at
    // least one row to fall back to.
    sdk.sqlite
      .prepare(
        `INSERT INTO vermieter_rent_changes (id, workspace_id, lease_id, effective_date, cold_rent_cents, nk_prepayment_cents, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sdk.newId(), workspaceId, id, input.startDate, input.coldRentCents, input.nkPrepaymentCents, "Vertragsbeginn", now);
  });
  tx();
  return getLease(sdk, workspaceId, id)!;
}

export function updateLease(
  sdk: ModuleSdk,
  workspaceId: string,
  leaseId: string,
  input: Partial<Omit<LeaseInput, "coldRentCents" | "nkPrepaymentCents">>,
): LeaseDto | null {
  const existing = getLease(sdk, workspaceId, leaseId);
  if (!existing) return null;
  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare(
        `UPDATE vermieter_leases SET
         unit_id = ?, start_date = ?, end_date = ?, deposit_cents = ?, deposit_paid_date = ?, deposit_returned_date = ?, status = ?, notes = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      )
      .run(
        input.unitId ?? existing.unitId,
        input.startDate ?? existing.startDate,
        input.endDate !== undefined ? input.endDate : existing.endDate,
        input.depositCents !== undefined ? input.depositCents : existing.depositCents,
        input.depositPaidDate !== undefined ? input.depositPaidDate : existing.depositPaidDate,
        input.depositReturnedDate !== undefined ? input.depositReturnedDate : existing.depositReturnedDate,
        input.status ?? existing.status,
        input.notes !== undefined ? input.notes.trim() : existing.notes,
        now,
        leaseId,
        workspaceId,
      );
    if (input.tenantIds) {
      sdk.sqlite.prepare("DELETE FROM vermieter_lease_tenants WHERE lease_id = ?").run(leaseId);
      for (const tenantId of input.tenantIds) {
        sdk.sqlite.prepare("INSERT OR IGNORE INTO vermieter_lease_tenants (lease_id, tenant_id) VALUES (?, ?)").run(leaseId, tenantId);
      }
    }
  });
  tx();
  return getLease(sdk, workspaceId, leaseId);
}

/**
 * Records a Mieterhöhung: inserts a `vermieter_rent_changes` row AND
 * updates the lease's own cold_rent_cents/nk_prepayment_cents in the same
 * transaction, so the two never drift apart. This is the *only* sanctioned
 * way to change a lease's rent - updateLease() deliberately excludes those
 * two fields.
 */
export function changeLeaseRent(
  sdk: ModuleSdk,
  workspaceId: string,
  leaseId: string,
  input: { effectiveDate: string; coldRentCents: number; nkPrepaymentCents: number; note?: string },
): LeaseDto | null {
  const existing = getLease(sdk, workspaceId, leaseId);
  if (!existing) return null;
  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare(
        `INSERT INTO vermieter_rent_changes (id, workspace_id, lease_id, effective_date, cold_rent_cents, nk_prepayment_cents, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(sdk.newId(), workspaceId, leaseId, input.effectiveDate, input.coldRentCents, input.nkPrepaymentCents, input.note?.trim() ?? "", now);
    sdk.sqlite
      .prepare("UPDATE vermieter_leases SET cold_rent_cents = ?, nk_prepayment_cents = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
      .run(input.coldRentCents, input.nkPrepaymentCents, now, leaseId, workspaceId);
  });
  tx();
  return getLease(sdk, workspaceId, leaseId);
}

export function listRentChanges(sdk: ModuleSdk, leaseId: string): RentChangeDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_rent_changes WHERE lease_id = ? ORDER BY effective_date ASC")
    .all(leaseId) as VermieterRentChangeRow[];
  return rows.map(rentChangeRowToDto);
}

/** The cold-rent/NK-prepayment amounts in effect on `date` for a lease, from its rent-change history (falls back to the lease's current values if no history row applies, which shouldn't happen since createLease always seeds one). */
export function rentInEffectOn(sdk: ModuleSdk, leaseId: string, date: string): { coldRentCents: number; nkPrepaymentCents: number } | null {
  const row = sdk.sqlite
    .prepare(
      "SELECT cold_rent_cents, nk_prepayment_cents FROM vermieter_rent_changes WHERE lease_id = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1",
    )
    .get(leaseId, date) as { cold_rent_cents: number; nk_prepayment_cents: number } | undefined;
  return row ? { coldRentCents: row.cold_rent_cents, nkPrepaymentCents: row.nk_prepayment_cents } : null;
}

export { listTenantsForLease };
