import type { ModuleSdk } from "../manifest.js";
import type { VermieterUnitRow } from "../db/types.js";
import { addUnitToDefaultCostCircuit } from "./costCircuits.js";

export interface UnitDto {
  id: string;
  propertyId: string;
  label: string;
  floor: string;
  sizeSqm: number;
  rooms: number | null;
  heatingType: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

function rowToDto(row: VermieterUnitRow): UnitDto {
  return {
    id: row.id,
    propertyId: row.property_id,
    label: row.label,
    floor: row.floor,
    sizeSqm: row.size_sqm,
    rooms: row.rooms,
    heatingType: row.heating_type,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function listUnits(sdk: ModuleSdk, workspaceId: string, propertyId?: string, includeArchived = false): UnitDto[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_units WHERE workspace_id = ? ${propertyId ? "AND property_id = ?" : ""} ${includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY label ASC`,
    )
    .all(...(propertyId ? [workspaceId, propertyId] : [workspaceId])) as VermieterUnitRow[];
  return rows.map(rowToDto);
}

export function getUnit(sdk: ModuleSdk, workspaceId: string, unitId: string): UnitDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_units WHERE id = ? AND workspace_id = ?").get(unitId, workspaceId) as
    | VermieterUnitRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export function requireUnitRow(sdk: ModuleSdk, workspaceId: string, unitId: string): VermieterUnitRow {
  const row = sdk.sqlite.prepare("SELECT * FROM vermieter_units WHERE id = ? AND workspace_id = ?").get(unitId, workspaceId) as
    | VermieterUnitRow
    | undefined;
  if (!row) throw new Error("Unit not found");
  return row;
}

export interface UnitInput {
  propertyId: string;
  label: string;
  floor?: string;
  sizeSqm: number;
  rooms?: number | null;
  heatingType?: string;
  notes?: string;
}

export function createUnit(sdk: ModuleSdk, workspaceId: string, input: UnitInput): UnitDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_units (id, workspace_id, property_id, label, floor, size_sqm, rooms, heating_type, notes, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      workspaceId,
      input.propertyId,
      input.label.trim(),
      input.floor?.trim() ?? "",
      input.sizeSqm,
      input.rooms ?? null,
      input.heatingType?.trim() ?? "",
      input.notes?.trim() ?? "",
      now,
      now,
    );
  addUnitToDefaultCostCircuit(sdk, workspaceId, input.propertyId, id);
  return getUnit(sdk, workspaceId, id)!;
}

export function updateUnit(sdk: ModuleSdk, workspaceId: string, unitId: string, input: Partial<UnitInput>): UnitDto | null {
  const existing = getUnit(sdk, workspaceId, unitId);
  if (!existing) return null;
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_units SET label = ?, floor = ?, size_sqm = ?, rooms = ?, heating_type = ?, notes = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.label?.trim() ?? existing.label,
      input.floor !== undefined ? input.floor.trim() : existing.floor,
      input.sizeSqm ?? existing.sizeSqm,
      input.rooms !== undefined ? input.rooms : existing.rooms,
      input.heatingType !== undefined ? input.heatingType.trim() : existing.heatingType,
      input.notes !== undefined ? input.notes.trim() : existing.notes,
      now,
      unitId,
      workspaceId,
    );
  return getUnit(sdk, workspaceId, unitId);
}

export function archiveUnit(sdk: ModuleSdk, workspaceId: string, unitId: string): boolean {
  const now = sdk.nowIso();
  const result = sdk.sqlite
    .prepare("UPDATE vermieter_units SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(now, now, unitId, workspaceId);
  return result.changes > 0;
}
