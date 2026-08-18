import type { ModuleSdk } from "../manifest.js";
import type { VermieterCostCircuitRow } from "../db/types.js";

/**
 * Abrechnungskreise (cost circuits) - see db/types.ts's doc comment on
 * `VermieterCostCircuitRow`. This service owns:
 *  - auto-creating a property's default circuit (called from
 *    services/properties.ts::createProperty) and keeping its membership in
 *    sync with the property's unit list (called from
 *    services/units.ts::createUnit),
 *  - CRUD for additional, opt-in circuits,
 *  - resolving "the default circuit id for a property", used by
 *    services/receipts.ts to fill in a receipt's `cost_circuit_id` when the
 *    caller doesn't specify one.
 *
 * A unit can never be removed from the default circuit through this
 * service's `setCircuitUnits` (every unit always belongs to it by
 * definition - it's "the whole property") - only from additional circuits.
 */

export interface CostCircuitDto {
  id: string;
  propertyId: string;
  name: string;
  isDefault: boolean;
  unitIds: string[];
  createdAt: string;
  updatedAt: string;
}

function rowToDto(row: VermieterCostCircuitRow, unitIds: string[]): CostCircuitDto {
  return {
    id: row.id,
    propertyId: row.property_id,
    name: row.name,
    isDefault: row.is_default === 1,
    unitIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function unitIdsForCircuit(sdk: ModuleSdk, circuitId: string): string[] {
  const rows = sdk.sqlite.prepare("SELECT unit_id FROM vermieter_cost_circuit_units WHERE circuit_id = ?").all(circuitId) as {
    unit_id: string;
  }[];
  return rows.map((r) => r.unit_id);
}

export function listCostCircuits(sdk: ModuleSdk, workspaceId: string, propertyId: string): CostCircuitDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_cost_circuits WHERE workspace_id = ? AND property_id = ? ORDER BY is_default DESC, name ASC")
    .all(workspaceId, propertyId) as VermieterCostCircuitRow[];
  return rows.map((row) => rowToDto(row, unitIdsForCircuit(sdk, row.id)));
}

export function getCostCircuit(sdk: ModuleSdk, workspaceId: string, id: string): CostCircuitDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_cost_circuits WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterCostCircuitRow
    | undefined;
  return row ? rowToDto(row, unitIdsForCircuit(sdk, row.id)) : null;
}

function requireCostCircuitRow(sdk: ModuleSdk, workspaceId: string, id: string): VermieterCostCircuitRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_cost_circuits WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterCostCircuitRow
    | undefined;
  if (!row) throw new Error("Cost circuit not found");
  return row;
}

/** The property's default ("Gesamtes Objekt") circuit id - every property has exactly one. Throws if the property has none, which should never happen post-migration (see migrations/0008 and createDefaultCostCircuit below). */
export function getDefaultCostCircuitId(sdk: ModuleSdk, workspaceId: string, propertyId: string): string {
  const row = sdk.sqlite
    .prepare("SELECT id FROM vermieter_cost_circuits WHERE workspace_id = ? AND property_id = ? AND is_default = 1")
    .get(workspaceId, propertyId) as { id: string } | undefined;
  if (!row) throw new Error(`Property ${propertyId} has no default cost circuit`);
  return row.id;
}

/** Called once, right after a property row is inserted (services/properties.ts::createProperty) - a brand-new property has no units yet, so membership starts empty and gets populated as units are created (see addUnitToDefaultCostCircuit). */
export function createDefaultCostCircuit(sdk: ModuleSdk, workspaceId: string, propertyId: string): void {
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_cost_circuits (id, workspace_id, property_id, name, is_default, created_at, updated_at)
       VALUES (?, ?, ?, 'Gesamtes Objekt', 1, ?, ?)`,
    )
    .run(sdk.newId(), workspaceId, propertyId, now, now);
}

/** Called from services/units.ts::createUnit right after a unit row is inserted - keeps the default circuit's membership auto-synced (every unit always belongs to "the whole property"). */
export function addUnitToDefaultCostCircuit(sdk: ModuleSdk, workspaceId: string, propertyId: string, unitId: string): void {
  const circuitId = getDefaultCostCircuitId(sdk, workspaceId, propertyId);
  sdk.sqlite
    .prepare("INSERT OR IGNORE INTO vermieter_cost_circuit_units (circuit_id, unit_id) VALUES (?, ?)")
    .run(circuitId, unitId);
}

export function createCostCircuit(sdk: ModuleSdk, workspaceId: string, propertyId: string, name: string): CostCircuitDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_cost_circuits (id, workspace_id, property_id, name, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(id, workspaceId, propertyId, name.trim(), now, now);
  return getCostCircuit(sdk, workspaceId, id)!;
}

export function renameCostCircuit(sdk: ModuleSdk, workspaceId: string, id: string, name: string): CostCircuitDto | null {
  const existing = getCostCircuit(sdk, workspaceId, id);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite.prepare("UPDATE vermieter_cost_circuits SET name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").run(
    name.trim(),
    now,
    id,
    workspaceId,
  );
  return getCostCircuit(sdk, workspaceId, id);
}

/**
 * Replaces a circuit's membership with exactly `unitIds`. The default
 * circuit's membership is not client-controlled - calling this on it is a
 * no-op (it silently keeps whatever the auto-sync produced) rather than an
 * error, since "PUT the default circuit's units to the full unit list" is a
 * harmless, arguably correct thing for a client to send.
 */
export function setCostCircuitUnits(sdk: ModuleSdk, workspaceId: string, id: string, unitIds: string[]): CostCircuitDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_cost_circuits WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterCostCircuitRow
    | undefined;
  if (!row) return null;
  if (row.is_default === 1) return rowToDto(row, unitIdsForCircuit(sdk, row.id));

  const now = sdk.nowIso();
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuit_units WHERE circuit_id = ?").run(id);
    const insert = sdk.sqlite.prepare("INSERT OR IGNORE INTO vermieter_cost_circuit_units (circuit_id, unit_id) VALUES (?, ?)");
    for (const unitId of unitIds) insert.run(id, unitId);
    sdk.sqlite.prepare("UPDATE vermieter_cost_circuits SET updated_at = ? WHERE id = ?").run(now, id);
  });
  tx();
  return getCostCircuit(sdk, workspaceId, id);
}

export interface DeleteCostCircuitResult {
  deleted: boolean;
  reason?: "not_found" | "is_default";
}

/**
 * Deletes a non-default circuit. Any receipt pointing at it is reassigned
 * back to the property's default circuit first (rather than rejecting the
 * deletion outright) - a deleted circuit shouldn't strand receipts with a
 * dangling `cost_circuit_id`, and "fall back to the whole property" is
 * always a safe, well-defined target. The default circuit itself can never
 * be deleted.
 */
export function deleteCostCircuit(sdk: ModuleSdk, workspaceId: string, id: string): DeleteCostCircuitResult {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_cost_circuits WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | VermieterCostCircuitRow
    | undefined;
  if (!row) return { deleted: false, reason: "not_found" };
  if (row.is_default === 1) return { deleted: false, reason: "is_default" };

  const defaultCircuitId = getDefaultCostCircuitId(sdk, workspaceId, row.property_id);
  const tx = sdk.sqlite.transaction(() => {
    sdk.sqlite
      .prepare("UPDATE vermieter_receipts SET cost_circuit_id = ? WHERE workspace_id = ? AND cost_circuit_id = ?")
      .run(defaultCircuitId, workspaceId, id);
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuit_units WHERE circuit_id = ?").run(id);
    sdk.sqlite.prepare("DELETE FROM vermieter_cost_circuits WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  });
  tx();
  return { deleted: true };
}

export { requireCostCircuitRow };
